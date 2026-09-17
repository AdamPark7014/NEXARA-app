import { ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere, requireCompanyId, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';
import { CreateGpsDto } from './dto/create-gps.dto.js';
import { parseWorkDate, workDateColumn, workDayBounds } from '../common/time/workday.js';
import { ActivityGeofenceService } from '../activities/geofence/activity-geofence.service.js';
import { puedeVerGpsDireccion } from '../attendance/asistencia-confiable.js';

@Injectable()
export class GpsService {
  private readonly logger = new Logger(GpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly geofence?: ActivityGeofenceService,
  ) {}

  /**
   * "Hoy" para comparar contra `AttendanceDay.date`, que es `@db.Date`.
   *
   * Antes devolvía `workDayStart`, o sea las 06:00 UTC. Una columna `date` de
   * Postgres se compara contra medianoche, así que `date = <06:00>` no casaba
   * nunca: el mapa del equipo salía vacío y `GET /gps/me` decía que no había
   * consentimiento aunque lo hubiera. El día se construye igual que lo escribe
   * `AttendanceService`.
   */
  private getTodayDateOnly() {
    return workDateColumn(new Date());
  }

  /**
   * Punto real, o `null`. Mismo criterio que en asistencia: el (0,0) exacto es
   * el valor por defecto de un teléfono sin permiso de ubicación, no una
   * lectura. `Number.isFinite(0)` lo dejaba pasar y se guardaba como si fuera
   * un punto medido en el golfo de Guinea.
   */
  private realPoint(lat?: number | null, lng?: number | null) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }

  async create(createGpsDto: CreateGpsDto, companyId?: number | null) {
    if (createGpsDto.usuarioId === undefined) {
      throw new Error('usuarioId requerido');
    }

    // No se lanza excepción: la app instalada en los teléfonos podría mandar
    // un (0,0) y dejaría al técnico con un error rojo en pantalla por un ping
    // que ni siquiera pidió. Se descarta el punto y se dice que se descartó.
    // El 400 duro se puede activar cuando la v2 esté desplegada; ver
    // `.ai/auditoria-2026-09/14-integridad-datos-remediacion.md`.
    const punto = this.realPoint(createGpsDto.latitud, createGpsDto.longitud);
    if (!punto) {
      this.logger.warn(
        `Ping GPS descartado (usuarioId=${createGpsDto.usuarioId}, lat=${createGpsDto.latitud}, lng=${createGpsDto.longitud}): no es una ubicación real`,
      );
      return { skipped: true as const, reason: 'coordenadas no válidas (0,0 o fuera de rango)' };
    }

    const resolvedCompanyId = await resolveRequiredCompanyId(this.prisma, companyId);
    const data: Prisma.LocationTrackingUncheckedCreateInput = {
      usuarioId: createGpsDto.usuarioId,
      latitud: punto.lat,
      longitud: punto.lng,
      velocidadKmh: createGpsDto.velocidadKmh ?? null,
      estaActivo: createGpsDto.estaActivo ?? true,
      ultimaActualizacion: createGpsDto.ultimaActualizacion,
      companyId: resolvedCompanyId,
      ...(createGpsDto.actividadId ? { actividadId: createGpsDto.actividadId } : {}),
    };
    const creado = await this.prisma['locationTracking'].create({ data });
    // Geocerca de actividades: se mide sin hacer esperar al teléfono.
    void Promise.resolve(
      this.geofence?.evaluarPunto({
        userId: createGpsDto.usuarioId,
        latitude: punto.lat,
        longitude: punto.lng,
        actividadId: createGpsDto.actividadId ?? null,
      }),
    ).catch(() => undefined);
    return creado;
  }

  async findMe(userId: number) {
    const today = this.getTodayDateOnly();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locationConsent: true },
    });
    const openDay = await this.prisma.attendanceDay.findFirst({
      where: { userId, date: today, isOpen: true },
      select: { isOpen: true },
    });
    const effectiveConsent = Boolean(user?.locationConsent && openDay?.isOpen);

    const location = await this.prisma['locationTracking'].findFirst({
      where: { usuarioId: userId, estaActivo: true },
      orderBy: { ultimaActualizacion: 'desc' },
      include: {
        usuario: { include: { role: true, department: true } },
        actividad: true,
      },
    });
    return {
      consent: effectiveConsent,
      location: effectiveConsent ? location : null,
    };
  }

  async updateConsent(userId: number, enabled: boolean) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { locationConsent: enabled },
      select: { locationConsent: true },
    });
    if (!enabled) {
      await this.prisma['locationTracking'].updateMany({
        where: { usuarioId: userId, estaActivo: true },
        data: { estaActivo: false, ultimaActualizacion: new Date() },
      });
    }
    return { consent: Boolean(user.locationConsent) };
  }

  private pickLatestByUser(locations: any[]) {
    const byUser = new Map<number, any>();
    for (const location of locations) {
      if (!byUser.has(location.usuarioId)) {
        byUser.set(location.usuarioId, location);
      }
    }
    return Array.from(byUser.values());
  }

  /**
   * GPS en vivo: sólo dirección.
   *
   * El mapa del equipo y las trayectorias son telemetría minuto a minuto, no
   * asistencia. Un coordinador ve las checadas de su gente —con el punto desde
   * el que ficharon y su distancia al sitio—; seguir a alguien por la ciudad se
   * queda en dirección (contrato del viernes 18-09, sección A).
   */
  private exigirDireccion(requester?: { email?: string | null } | null) {
    if (!puedeVerGpsDireccion(requester)) {
      throw new ForbiddenException('El GPS en vivo del equipo es solo para dirección');
    }
  }

  async findTeamLocations(
    requester: {
      id: number;
      departmentId?: number;
      email?: string | null;
      permissions?: string[];
      isSuperAdmin?: boolean;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    this.exigirDireccion(requester);
    const today = this.getTodayDateOnly();

    const userFilter: any = {
      locationConsent: true,
      attendanceDays: { some: { date: today, isOpen: true } },
      companyMemberships: { some: { companyId: tenantId } },
    };

    const allowedUsers = await this.prisma.user.findMany({
      where: userFilter,
      select: { id: true },
    });

    if (!allowedUsers.length) return [];

    const locations = await this.prisma['locationTracking'].findMany({
      where: {
        usuarioId: { in: allowedUsers.map((u) => u.id) },
        estaActivo: true,
        ...companyWhere(tenantId),
      },
      orderBy: { ultimaActualizacion: 'desc' },
      include: {
        usuario: { include: { role: true, department: true } },
        actividad: true,
      },
    });

    return this.pickLatestByUser(locations);
  }

  /** All GPS points for userId on a given date (YYYY-MM-DD), ordered asc. Used for trajectory view. */
  async getMyTrajectory(userId: number, date?: string, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const { start, end } = this.parseDateRange(date);
    return this.prisma['locationTracking'].findMany({
      where: {
        usuarioId: userId,
        ultimaActualizacion: { gte: start, lte: end },
        ...companyWhere(tenantId),
      },
      orderBy: { ultimaActualizacion: 'asc' },
    });
  }

  /**
   * Trayectoria de una persona: sólo dirección, la suya incluida.
   *
   * Antes un encargado con `attendance.manage` veía el recorrido completo de
   * sus subordinados. Eso es seguir a alguien por la ciudad, no comprobar que
   * llegó: para eso están la checada, su punto y su distancia al sitio.
   */
  async getTrajectoryForUser(
    requester: {
      id: number;
      departmentId?: number;
      email?: string | null;
      permissions?: string[];
      isSuperAdmin?: boolean;
    },
    targetUserId: number,
    date?: string,
    companyId?: number | null,
  ) {
    this.exigirDireccion(requester);
    return this.getMyTrajectory(targetUserId, date, companyId);
  }

  /**
   * Rango del día pedido, en hora de la empresa.
   *
   * El recorrido de un técnico se mide por su día, no por el del servidor: en
   * UTC, la tarde de hoy en México ya cuenta como mañana, así que el trayecto
   * de la tarde desaparecía del mapa del día.
   */
  private parseDateRange(date?: string) {
    const targetDate =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseWorkDate(date) : new Date();
    return workDayBounds(targetDate);
  }

  findOne(id: number) {
    return this.prisma['locationTracking'].findUnique({
      where: { id },
      include: { usuario: true, actividad: true },
    });
  }

  /**
   * Un punto suelto, acotado a la empresa de quien pregunta.
   *
   * Antes buscaba por id a secas: con el id de otra empresa devolvía su punto,
   * con su usuario dentro. Ahora sin `companyId` no hay resultado.
   */
  findOneWithUser(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma['locationTracking'].findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: {
        usuario: { include: { role: true, department: true } },
        actividad: true,
      },
    });
  }
}
