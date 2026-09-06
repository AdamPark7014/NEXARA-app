import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { companyWhere, requireCompanyId, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';
import { CreateGpsDto } from './dto/create-gps.dto.js';
import { parseWorkDate, workDateColumn, workDayBounds } from '../common/time/workday.js';

@Injectable()
export class GpsService {
  private readonly logger = new Logger(GpsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma['locationTracking'].create({ data });
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

  private hasPermission(
    user: { permissions?: string[]; isSuperAdmin?: boolean } | null | undefined,
    permission: string,
  ) {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return Boolean(user.permissions?.includes(permission));
  }

  async findTeamLocations(
    requester: {
      id: number;
      departmentId?: number;
      permissions?: string[];
      isSuperAdmin?: boolean;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const today = this.getTodayDateOnly();
    const canSeeAll =
      this.hasPermission(requester, PERMISSIONS.CONSOLE_ADMIN) ||
      this.hasPermission(requester, PERMISSIONS.GPS_MANAGE);

    const userFilter: any = {
      locationConsent: true,
      attendanceDays: { some: { date: today, isOpen: true } },
      companyMemberships: { some: { companyId: tenantId } },
    };

    if (!canSeeAll && requester.departmentId) {
      userFilter.departmentId = requester.departmentId;
    }

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

  async getTrajectoryForUser(
    requester: {
      id: number;
      departmentId?: number;
      permissions?: string[];
      isSuperAdmin?: boolean;
    },
    targetUserId: number,
    date?: string,
    companyId?: number | null,
  ) {
    const canManage =
      requester.isSuperAdmin ||
      requester.permissions?.includes(PERMISSIONS.GPS_MANAGE) ||
      requester.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE) ||
      requester.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);

    if (targetUserId !== requester.id && !canManage) {
      throw new ForbiddenException('No tienes permisos para ver el trayecto de otro usuario');
    }

    if (targetUserId !== requester.id) {
      const target = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, departmentId: true, locationConsent: true },
      });
      if (!target) return [];
      if (
        !requester.isSuperAdmin &&
        !requester.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) &&
        !requester.permissions?.includes(PERMISSIONS.GPS_MANAGE) &&
        requester.departmentId &&
        target.departmentId !== requester.departmentId
      ) {
        throw new ForbiddenException('No puedes ver usuarios de otro departamento');
      }
    }

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

  findOneWithUser(id: number) {
    return this.prisma['locationTracking'].findUnique({
      where: { id },
      include: {
        usuario: { include: { role: true, department: true } },
        actividad: true,
      },
    });
  }
}
