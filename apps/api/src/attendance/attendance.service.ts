import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service';
import { NotificationsService, type INotificationPayload } from '../notifications/notifications.service';
import { PERMISSIONS } from '../common/permissions.js';
import { detectDeviceFromUserAgent } from '../common/device-detector.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import {
  parseWorkDate,
  workDateColumn,
  workDateKey,
  workDayBounds,
  workDayEnd,
  workDayStart,
} from '../common/time/workday.js';
import { NotificationType, Prisma } from '@prisma/client';
import { saveBase64Photo } from '../common/file-upload.util';
import { horaAviso } from '../notifications/notification-push-meta.js';
import { isCeoEquivalentEmail } from '../common/platform-accounts.js';
import { alcanzaA, esDeTodaLaEmpresa } from '../me/equipo-alcance.js';
import {
  AttendanceJustificationsService,
  type AttendanceJustificationDto,
} from './attendance-justifications.service';
import {
  ETIQUETA_MOTIVO_RECHAZO,
  MENSAJE_SOLO_APP,
  MENSAJE_UBICACION_SIMULADA,
  MENSAJE_UBICACION_VIEJA,
  MENSAJE_VIAJE_IMPOSIBLE,
  MOTIVO_RECHAZO,
  MOTIVO_VALIDACION,
  RADIO_SITIO_M,
  REPETIDAS_PARA_SOSPECHAR,
  combinarValidacion,
  coordenadaRepetida,
  edadDelPunto,
  evaluarUbicacion,
  horaCierreAutomatico,
  motivoCorreccionValido,
  origenChecada,
  resolverHoraChecada,
  sitioOficina,
  viajeImposible,
  type MotivoRechazo,
  type OrigenChecada,
  type PuntoChecada,
  type SitioPermitido,
  type ValidacionChecada,
} from './asistencia-confiable.js';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationHierarchy: NotificationHierarchyService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Aviso con push (NotificationsService); sin él (pruebas) queda solo en la campana como antes. */
  private async avisar(payload: INotificationPayload) {
    if (this.notifications) {
      await this.notifications.createNotification(payload);
      return;
    }
    const { channel: _c, collapseKey: _k, excludeActor: _e, dedupeSeconds: _d, icon: _i, ...data } = payload;
    await this.prisma.notification.create({ data: { ...data, type: data.type as NotificationType } });
  }

  /**
   * Quien aún no tiene foto de perfil toma la de su checada (cámara en vivo): así su cara aparece
   * en la pizarra, el chat y los avisos del teléfono. Los terminales de acceso no entregan la foto
   * enrolada por ISAPI (404), así que esta es la fuente real disponible. Nunca reemplaza una foto
   * que la persona ya subió.
   */
  private async usarFotoComoAvatarSiFalta(userId: number, photoUrl?: string | null, avatarActual?: string | null) {
    if (!photoUrl || (avatarActual || '').trim()) return;
    try {
      await this.prisma.user.updateMany({ where: { id: userId, avatarUrl: null }, data: { avatarUrl: photoUrl } });
    } catch (err) {
      this.logger.warn(`No se pudo usar la foto de checada como avatar (userId=${userId}): ${(err as Error).message}`);
    }
  }

  private persistAttendancePhoto(photoBase64?: string | null): string | null {
    if (!photoBase64 || !photoBase64.trim()) return null;
    try {
      const saved = saveBase64Photo(photoBase64, __dirname, 'attendance');
      // Nunca guardar data-URI en DB (rompe listados y el disco queda vacío).
      if (!saved || saved.startsWith('data:')) {
        this.logger.warn('Foto de asistencia no persistió a archivo; se omite photoUrl');
        return null;
      }
      return saved.startsWith('/uploads/')
        ? saved
        : `/uploads/${saved.replace(/^\//, '')}`;
    } catch (err) {
      this.logger.warn(`No se pudo persistir foto de asistencia: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Coordenadas reales, o `null` si el teléfono no tenía ubicación.
   *
   * La app publicada manda `0.0, 0.0` cuando el usuario niega el permiso de
   * ubicación, y `Number.isFinite(0)` es `true`: el cero pasaba el filtro y se
   * guardaba como si fuera un punto medido. Son coordenadas en el golfo de
   * Guinea, a 9.000 km de Puebla, y quedan en la misma columna que las buenas.
   *
   * Aquí NO se rechaza la petición: la versión de la app que la gente ya tiene
   * instalada seguiría mandando el cero y dejaría a medio equipo sin poder
   * fichar. Se acepta el registro y se guarda la ubicación como ausente, que es
   * lo que de verdad hubo. El rechazo duro se puede activar cuando la v2 esté
   * desplegada (ver `.ai/auditoria-2026-09/14-integridad-datos-remediacion.md`).
   */
  private realCoords(
    latitude?: number | null,
    longitude?: number | null,
  ): { latitude: number; longitude: number } | null {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    // El (0,0) exacto no es una lectura de GPS, es el valor por defecto.
    if (latitude === 0 && longitude === 0) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude };
  }

  private isSuperAdminEmail(email?: string | null) {
    if (!email) return false;
    const normalized = email.toLowerCase();
    return ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'].includes(normalized) || isCeoEquivalentEmail(normalized);
  }

  /**
   * Dia laboral de un instante, listo para una columna `@db.Date`.
   *
   * Antes era `setHours(0,0,0,0)` sobre hora local, que en el contenedor es
   * UTC: una salida a las 19:18 de Mexico caia en el dia siguiente.
   */
  private getDateOnly(date: Date) {
    return workDateColumn(date);
  }

  /**
   * Minutos que lleva corriendo una jornada todavía abierta.
   *
   * El corte es el menor entre el fin del rango consultado y **el fin de esa
   * misma jornada**. Sin el segundo tope, una entrada de la que nadie registró
   * salida seguía acumulando tiempo indefinidamente: en los datos reales había
   * una del 16 de julio sumando 710 horas porque la siguiente salida era del 15
   * de agosto. Una jornada no puede durar más que su propio día.
   */
  private computeOpenMinutes(lastEntryAt: Date | null, rangeEnd: Date) {
    if (!lastEntryAt) return 0;
    const start = lastEntryAt.getTime();
    if (Number.isNaN(start)) return 0;
    const finDeSuJornada = workDayEnd(lastEntryAt).getTime();
    const end = Math.min(rangeEnd.getTime(), finDeSuJornada);
    if (end <= start) return 0;
    return Math.max(0, Math.floor((end - start) / 60000));
  }

  /**
   * Faltas justificadas por persona en el rango: «Falta justificada · motivo» en vez de «Sin checada».
   * No son checadas ni jornada; van aparte para que nadie las sume como horas.
   */
  private async justificacionesPorPersona(
    userIds: number[],
    from: string,
    to: string,
    tenantId: number,
  ): Promise<Map<number, AttendanceJustificationDto[]>> {
    // Pruebas con Prisma simulado sin la tabla: sin faltas justificadas.
    if (!userIds.length || !(this.prisma as { attendanceJustification?: unknown }).attendanceJustification) {
      return new Map();
    }
    try {
      return await new AttendanceJustificationsService(this.prisma).listForUsers(userIds, from, to, tenantId);
    } catch (err) {
      this.logger.warn(`No se pudieron leer las faltas justificadas: ${(err as Error).message}`);
      return new Map();
    }
  }

  /** `AAAA-MM-DD` se interpreta como dia de la zona de la empresa. */
  private parseDateInput(value: string) {
    return parseWorkDate(value);
  }

  async getCurrentDay(userId: number, companyId?: number | null) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    const tenantId = requireCompanyId(companyId);
    const openDay = await this.prisma.attendanceDay.findFirst({
      where: { userId, isOpen: true, ...companyWhere(tenantId) },
      orderBy: { date: 'desc' },
    });
    return openDay ?? null;
  }

  /** Reabre jornada si hay entrada sin salida pero attendanceDay quedó inconsistente. */
  private async reconcileOpenDay(userId: number, referenceDate: Date, companyId: number) {
    const { start: dayStart, end: dayEnd } = workDayBounds(referenceDate);
    const tenant = companyWhere(companyId);

    const [entry, exit] = await Promise.all([
      this.prisma.attendance.findFirst({
        where: {
          userId,
          type: 'entrada',
          timestamp: { gte: dayStart, lte: dayEnd },
          ...tenant,
        },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.attendance.findFirst({
        where: {
          userId,
          type: 'salida',
          timestamp: { gte: dayStart, lte: dayEnd },
          ...tenant,
        },
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    if (!entry || exit) return null;

    return this.prisma.attendanceDay.upsert({
      where: { companyId_userId_date: { companyId, userId, date: workDateColumn(referenceDate) } },
      create: {
        userId,
        date: workDateColumn(referenceDate),
        totalMinutes: 0,
        lastEntryAt: entry.timestamp,
        isOpen: true,
        companyId,
      },
      update: {
        lastEntryAt: entry.timestamp,
        isOpen: true,
      },
    });
  }

  async getHistory(userId: number, date?: string, companyId?: number | null) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    const tenantId = requireCompanyId(companyId);
    const base = date ? this.parseDateInput(date) : new Date();
    if (Number.isNaN(base.getTime())) {
      throw new BadRequestException('Fecha invalida');
    }
    const { start, end } = workDayBounds(base);

    return this.prisma.attendance.findMany({
      where: {
        userId,
        timestamp: {
          gte: start,
          lte: end,
        },
        ...companyWhere(tenantId),
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  /** Checadas recientes de un colaborador (RH / gestión de asistencia). */
  async getPunchesForUser(
    targetUserId: number,
    limit = 20,
    companyId?: number | null,
  ) {
    if (!targetUserId || !Number.isFinite(targetUserId)) {
      throw new BadRequestException('userId inválido');
    }
    const tenantId = requireCompanyId(companyId);
    const take = Math.min(Math.max(limit || 20, 1), 100);
    const filas = await this.prisma.attendance.findMany({
      where: { userId: targetUserId, ...companyWhere(tenantId) },
      orderBy: { timestamp: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        timestamp: true,
        photoUrl: true,
        deviceInfo: true,
        entryLatitude: true,
        entryLongitude: true,
        exitLatitude: true,
        exitLongitude: true,
        validacion: true,
        motivoValidacion: true,
        fueraDeSitio: true,
        distanciaSitioM: true,
        sitioNombre: true,
        offline: true,
        cierreAutomatico: true,
        accuracyM: true,
      },
    });
    const correcciones = await this.correccionesDe(filas.map((f) => f.id));
    return filas.map((fila) => ({ ...fila, correcciones: correcciones.get(fila.id) ?? [] }));
  }

  /** Campos de validación que viajan en cada checada de las lecturas (contrato sección A). */
  private datosValidacion(
    att: {
      id?: number;
      validacion?: string | null;
      motivoValidacion?: string | null;
      fueraDeSitio?: boolean | null;
      distanciaSitioM?: number | null;
      sitioNombre?: string | null;
      offline?: boolean | null;
      cierreAutomatico?: boolean | null;
      accuracyM?: number | null;
      uniformeOk?: boolean | null;
      uniformeRevisadoPorId?: number | null;
      uniformeRevisadoAt?: Date | null;
    },
    correcciones?: Map<number, Array<Record<string, unknown>>>,
  ) {
    return {
      validacion: (att.validacion as ValidacionChecada) || 'OK',
      motivoValidacion: att.motivoValidacion ?? null,
      fueraDeSitio: Boolean(att.fueraDeSitio),
      distanciaSitioM: att.distanciaSitioM ?? null,
      sitioNombre: att.sitioNombre ?? null,
      offline: Boolean(att.offline),
      cierreAutomatico: Boolean(att.cierreAutomatico),
      accuracyM: att.accuracyM ?? null,
      correcciones: (att.id != null && correcciones?.get(att.id)) || [],
      // Uniforme (solo entradas): ✓ / ✗ del jefe; null = sin revisar.
      uniformeOk: att.uniformeOk ?? null,
      uniformeRevisadoPorId: att.uniformeRevisadoPorId ?? null,
      uniformeRevisadoAt: att.uniformeRevisadoAt ? att.uniformeRevisadoAt.toISOString() : null,
    };
  }

  async getDaySummary(userId: number, date?: string, companyId?: number | null) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    const tenantId = requireCompanyId(companyId);
    const base = date ? this.parseDateInput(date) : new Date();
    if (Number.isNaN(base.getTime())) {
      throw new BadRequestException('Fecha invalida');
    }
    const day = this.getDateOnly(base);
    return this.prisma.attendanceDay.findFirst({
      where: { userId, date: day, ...companyWhere(tenantId) },
    });
  }

  async getRangeSummary(userId: number, from?: string, to?: string, companyId?: number | null) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    if (!from || !to) throw new BadRequestException('Rango incompleto');
    const tenantId = requireCompanyId(companyId);
    const tenant = companyWhere(tenantId);
    const fromDate = this.parseDateInput(from);
    const toDate = this.parseDateInput(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Rango invalido');
    }
    const start = workDayStart(fromDate);
    const end = workDayEnd(toDate);
    const diaDesde = workDateColumn(fromDate);
    const diaHasta = workDateColumn(toDate);
    const now = new Date();
    const effectiveEnd = now < end ? now : end;

    const days = await this.prisma.attendanceDay.findMany({
      where: {
        userId,
        // `date` es una columna DATE —medianoche UTC del día laboral—, no un
        // instante. Compararla contra el inicio del rango, que son las 06:00
        // UTC, dejaba fuera el primer día.
        date: {
          gte: diaDesde,
          lte: diaHasta,
        },
        ...tenant,
      },
      orderBy: { date: 'asc' },
    });

    const attendances = await this.prisma.attendance.findMany({
      where: {
        userId,
        timestamp: {
          gte: start,
          lte: end,
        },
        ...tenant,
      },
      orderBy: { timestamp: 'asc' },
    });
    const totalMinutes = days.reduce((sum, day) => {
      const openExtra = day.isOpen ? this.computeOpenMinutes(day.lastEntryAt, effectiveEnd) : 0;
      return sum + (day.totalMinutes || 0) + openExtra;
    }, 0);

    const buildFallbackTotals = () => {
      let total = 0;
      let openEntryTime: Date | null = null;
      let openEntryDate: string | null = null;
      const dailyMap = new Map<string, number>();

      attendances
        .map((item) => ({ type: item.type, timestamp: new Date(item.timestamp) }))
        .filter((item) => !Number.isNaN(item.timestamp.getTime()))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .forEach((event) => {
          if (event.type === 'entrada') {
            openEntryTime = event.timestamp;
            openEntryDate = workDateKey(event.timestamp);
            return;
          }
          if (event.type === 'salida' && openEntryTime) {
            const diffMs = event.timestamp.getTime() - openEntryTime.getTime();
            const minutes = diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
            total += minutes;
            const dayKey = openEntryDate || workDateKey(event.timestamp);
            dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + minutes);
            openEntryTime = null;
            openEntryDate = null;
          }
        });

      if (openEntryTime !== null) {
        const entryTime = openEntryTime as Date;
        const diffMs = effectiveEnd.getTime() - entryTime.getTime();
        const minutes = diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
        total += minutes;
        const dayKey = openEntryDate || workDateKey(effectiveEnd);
        dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + minutes);
      }

      return {
        totalMinutes: total,
        days: Array.from(dailyMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, minutes]) => ({ date, totalMinutes: minutes })),
      };
    };

    const fallback = totalMinutes === 0 && attendances.length ? buildFallbackTotals() : null;
    const justificaciones = (await this.justificacionesPorPersona([userId], from, to, tenantId)).get(userId) ?? [];
    const correcciones = await this.correccionesDe(attendances.map((a) => a.id));
    return {
      /** Días marcados por Christian como «Falta justificada» (con motivo, quién y cuándo). */
      justificaciones,
      totalMinutes: fallback?.totalMinutes ?? totalMinutes,
      days: fallback?.days
        ?? days.map((day) => {
          const openExtra = day.isOpen ? this.computeOpenMinutes(day.lastEntryAt, effectiveEnd) : 0;
          return {
            date: day.date.toISOString().split('T')[0],
            totalMinutes: (day.totalMinutes || 0) + openExtra,
            isOpen: day.isOpen,
          };
        }),
      attendances: attendances.map((att) => ({
        id: att.id,
        type: att.type,
        timestamp: att.timestamp.toISOString(),
        deviceInfo: att.deviceInfo || null,
        ...this.datosValidacion(att, correcciones),
      })),
    };
  }

  /**
   * Rango del dia laboral con fin EXCLUSIVO: quien llama filtra con `lt`.
   * `workDayEnd` devuelve el ultimo milisegundo, asi que se suma uno.
   */
  private getDayBounds(date: Date) {
    const { start, end } = workDayBounds(date);
    return { start, end: new Date(end.getTime() + 1) };
  }

  /**
   * Crea el registro dejando que la base impida el duplicado.
   *
   * `register` comprueba primero y crea después, y entre las dos cosas caben
   * dos peticiones: un doble toque en el móvil o un reintento por red mala
   * creaban las dos. No es hipotético —en producción hay un usuario con dos
   * salidas el mismo día— y de estos registros sale la nómina.
   *
   * La comprobación previa se conserva porque da el mensaje claro en el caso
   * normal; esto cubre sólo la carrera, y traduce el choque del índice al mismo
   * mensaje para que quien lo lea no tenga que distinguir un caso del otro.
   */
  private async createAttendanceRecord<T extends Prisma.AttendanceCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AttendanceCreateArgs>,
  ) {
    try {
      // Genérico para que el `include` de quien llama siga tipando el retorno.
      return await this.prisma.attendance.create<T>(args);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const tipo = (args as { data?: { type?: string } })?.data?.type;
        throw new BadRequestException(
          tipo === 'entrada'
            ? 'Ya existe una entrada registrada para hoy'
            : 'Ya existe una salida registrada para hoy',
        );
      }
      throw error;
    }
  }

  private async findAttendanceOnDate(userId: number, type: string, date: Date, companyId: number) {
    const { start, end } = this.getDayBounds(date);
    return this.prisma.attendance.findFirst({
      where: {
        userId,
        type,
        timestamp: { gte: start, lt: end },
        ...companyWhere(companyId),
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  private async resolveOpenDay(userId: number, referenceDate: Date, companyId: number) {
    let day = await this.prisma.attendanceDay.findFirst({
      where: { userId, isOpen: true, ...companyWhere(companyId) },
      orderBy: { date: 'desc' },
    });
    if (!day?.isOpen || !day.lastEntryAt) {
      day = await this.reconcileOpenDay(userId, referenceDate, companyId);
    }
    if (!day?.isOpen || !day.lastEntryAt) {
      const yesterday = new Date(referenceDate);
      yesterday.setDate(yesterday.getDate() - 1);
      day = await this.reconcileOpenDay(userId, yesterday, companyId);
    }
    return day;
  }

  /**
   * Entrada ERP sugerida desde el primer acceso ACS del día.
   * Solo RH/admin: no inventa nómina sola — el híbrido pide confirmación.
   */
  async registerSuggestedAcsEntry(opts: {
    targetUserId: number;
    timestamp: Date;
    photoUrl?: string | null;
    door?: string | null;
    actorUserId: number;
    companyId?: number | null;
  }) {
    const tenantId = requireCompanyId(opts.companyId);
    const now = opts.timestamp;
    if (Number.isNaN(now.getTime())) {
      throw new BadRequestException('Timestamp ACS inválido');
    }
    const today = this.getDateOnly(now);
    const doorBit = opts.door ? ` · ${opts.door}` : '';
    const deviceInfo = `ACS Integra (sugerido RH #${opts.actorUserId})${doorBit}`;

    const existingEntry = await this.findAttendanceOnDate(
      opts.targetUserId,
      'entrada',
      now,
      tenantId,
    );
    if (existingEntry) {
      throw new BadRequestException('Ya existe una entrada registrada para ese día');
    }

    const openDay = await this.prisma.attendanceDay.findFirst({
      where: { userId: opts.targetUserId, isOpen: true, ...companyWhere(tenantId) },
    });
    if (openDay) {
      throw new BadRequestException(
        'El empleado tiene una jornada abierta. Cierra salida antes de aplicar la sugerencia.',
      );
    }

    const attendance = await this.createAttendanceRecord({
      data: {
        userId: opts.targetUserId,
        type: 'entrada',
        timestamp: now,
        workDate: today,
        deviceInfo,
        photoUrl: opts.photoUrl || null,
        companyId: tenantId,
      },
      include: { user: true },
    });

    const day = await this.prisma.attendanceDay.upsert({
      where: {
        companyId_userId_date: {
          companyId: tenantId,
          userId: opts.targetUserId,
          date: today,
        },
      },
      create: {
        userId: opts.targetUserId,
        date: today,
        totalMinutes: 0,
        lastEntryAt: now,
        isOpen: true,
        companyId: tenantId,
      },
      update: {
        lastEntryAt: now,
        isOpen: true,
      },
    });

    this.emitAttendanceUpdate(opts.targetUserId, 'entrada', now, attendance.user);

    try {
      await this.avisar({
        userId: opts.targetUserId,
        type: 'ATTENDANCE_CHECKIN',
        category: 'attendance',
        title: 'Recursos Humanos registró tu entrada',
        message: `${horaAviso(now)} · Control de acceso${doorBit}`,
        icon: 'entrada',
        relatedEntityId: attendance.id,
        entityType: 'Attendance',
        relatedUrl: '/erp/asistencias',
        priority: 'normal',
      });
    } catch {
      /* notificación best-effort */
    }

    await this.notificationHierarchy.notifyAttendanceChange(
      opts.targetUserId,
      'ATTENDANCE_CHECKIN',
      attendance.user.nombre || 'Usuario',
      // En el aviso basta el origen; el detalle interno (quién la sugirió) queda en el registro.
      `Control de acceso${doorBit}`,
      now,
    );

    return {
      message: 'Entrada ERP aplicada desde ACS',
      data: attendance,
      day,
      source: 'acs_suggestion',
    };
  }

  /**
   * Salida de emergencia: un jefe registra la checada de alguien de su equipo.
   *
   * Desde que la web no puede checar, el teléfono es el único camino — y los teléfonos se
   * rompen, se quedan sin batería y se olvidan en casa. Sin esta puerta, el día siguiente
   * a un teléfono roto es una falta, y la persona la paga en su nómina.
   *
   * Lo que la distingue de una checada real: `registradaPorId` y `motivoRegistro` nunca
   * van vacíos, y queda en `AuditLog`. No lleva foto —quien la registra no estaba ahí— y
   * por eso nace en REVISAR: es una afirmación de su jefe, no una medición.
   */
  async registrarPorJefe(
    actor: { id: number; email?: string | null; roleKey?: string | null; isSuperAdmin?: boolean; permissions?: string[] },
    body: { userId?: number; type?: string; timestamp?: string; motivo?: string },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const targetId = Number(body?.userId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      throw new BadRequestException('Falta la persona');
    }
    if (targetId === actor.id) {
      throw new BadRequestException('Tu propia checada se registra desde la app, no desde aquí');
    }
    const type = body?.type === 'salida' ? 'salida' : body?.type === 'entrada' ? 'entrada' : null;
    if (!type) throw new BadRequestException('type debe ser "entrada" o "salida"');
    if (!motivoCorreccionValido(body?.motivo)) {
      throw new BadRequestException('El motivo es obligatorio (al menos 10 caracteres)');
    }
    if (!(await this.alcanzaAPersona(actor, targetId, tenantId))) {
      throw new ForbiddenException('Esa persona no está en tu equipo');
    }

    const at = body?.timestamp ? new Date(body.timestamp) : new Date();
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException('timestamp debe ser una fecha ISO8601 válida');
    }
    if (at.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('No se puede registrar una checada en el futuro');
    }
    const motivo = String(body.motivo).trim();
    const dia = this.getDateOnly(at);

    const yaExiste = await this.findAttendanceOnDate(targetId, type, at, tenantId);
    if (yaExiste) {
      throw new BadRequestException(
        type === 'entrada'
          ? 'Ya existe una entrada registrada ese día'
          : 'Ya existe una salida registrada ese día',
      );
    }

    const checada = await this.createAttendanceRecord({
      data: {
        userId: targetId,
        type,
        timestamp: at,
        workDate: dia,
        deviceInfo: `Registrada por ${actor.email ?? `usuario #${actor.id}`}`,
        origen: null,
        registradaPorId: actor.id,
        motivoRegistro: motivo,
        // Sin foto y sin GPS: nadie midió nada. Que se vea así en la bandeja.
        validacion: 'REVISAR',
        motivoValidacion: 'Registrada por su jefe',
        companyId: tenantId,
      },
      include: { user: true },
    });

    // La jornada se recalcula con las checadas que quedaron, igual que tras una corrección.
    await this.recalcularJornada(targetId, at, tenantId).catch((err) =>
      this.logger.warn(`No se pudo recalcular la jornada: ${(err as Error).message}`),
    );

    this.emitAttendanceUpdate(targetId, type, at, checada.user);

    await this.avisarChecadaMarcada({
      userId: targetId,
      titulo: `Tu jefe registró tu ${type}`,
      mensaje: `${horaAviso(at)} · ${motivo.slice(0, 160)}`,
      attendanceId: checada.id,
      avisarPersona: true,
    });

    return { message: `${type === 'entrada' ? 'Entrada' : 'Salida'} registrada`, data: checada };
  }

  /**
   * Intentos de checada que el servidor rechazó, del más reciente al más viejo.
   *
   * Es la vista que faltaba: quién intentó checar con GPS falso, desde dónde y con qué
   * teléfono. Cada quien ve lo que alcanza (dirección y RH, todo; un jefe, su equipo).
   */
  async listarRechazos(
    actor: { id: number; email?: string | null; roleKey?: string | null; isSuperAdmin?: boolean; permissions?: string[] },
    filtros: { from?: string; to?: string; userId?: string; motivo?: string },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const prisma = this.prisma as any;
    if (typeof prisma?.attendanceRejection?.findMany !== 'function') return { items: [] };

    const desde = filtros.from ? workDayStart(parseWorkDate(filtros.from)) : null;
    const hasta = filtros.to ? workDayEnd(parseWorkDate(filtros.to)) : null;
    const pedido = Number(filtros.userId);
    const soloUno = Number.isInteger(pedido) && pedido > 0 ? pedido : null;

    const todos = this.puedeCorregirChecadas(actor) || esDeTodaLaEmpresa(actor);
    let visibles: number[] | null = null;
    if (!todos) {
      const users = await this.prisma.user.findMany({
        where: { isActive: true, companyMemberships: { some: { companyId: tenantId } } },
        select: { id: true, email: true, managerId: true },
      });
      visibles = users.filter((u) => alcanzaA(actor, users, u.id)).map((u) => u.id);
      if (!visibles.includes(actor.id)) visibles.push(actor.id);
    }
    if (soloUno && visibles && !visibles.includes(soloUno)) {
      throw new ForbiddenException('Esa persona no está en tu equipo');
    }

    const filas = await prisma.attendanceRejection.findMany({
      where: {
        ...companyWhere(tenantId),
        ...(soloUno ? { userId: soloUno } : visibles ? { userId: { in: visibles } } : {}),
        ...(filtros.motivo ? { motivo: filtros.motivo } : {}),
        ...(desde || hasta ? { at: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
      },
      orderBy: { at: 'desc' },
      take: 300,
      select: {
        id: true,
        type: true,
        lat: true,
        lng: true,
        accuracyM: true,
        motivo: true,
        detalle: true,
        origen: true,
        deviceInfo: true,
        clientCapturedAt: true,
        at: true,
        user: { select: { id: true, nombre: true, email: true, avatarUrl: true, puesto: true } },
      },
    });

    return {
      items: (filas ?? []).map((f: any) => ({
        id: f.id,
        type: f.type,
        motivo: f.motivo,
        motivoEtiqueta: ETIQUETA_MOTIVO_RECHAZO[f.motivo] ?? f.motivo,
        detalle: f.detalle ?? null,
        origen: f.origen ?? null,
        deviceInfo: f.deviceInfo ?? null,
        lat: f.lat ?? null,
        lng: f.lng ?? null,
        accuracyM: f.accuracyM ?? null,
        clientCapturedAt: f.clientCapturedAt ? f.clientCapturedAt.toISOString() : null,
        at: f.at.toISOString(),
        persona: f.user
          ? {
              id: f.user.id,
              nombre: f.user.nombre,
              email: f.user.email,
              avatarUrl: f.user.avatarUrl,
              puesto: f.user.puesto,
            }
          : null,
      })),
    };
  }

  /**
   * Dónde es legítimo checar hoy: la oficina y las sucursales con coordenadas de
   * las actividades que esa persona tiene ese día.
   *
   * Si la base no puede responder (pruebas con Prisma simulado, cliente sin el
   * modelo) queda sólo la oficina: es preferible no acusar a nadie de estar
   * fuera de sitio por un fallo de lectura.
   */
  private async sitiosPermitidos(userId: number, at: Date, tenantId: number): Promise<SitioPermitido[]> {
    const sitios: SitioPermitido[] = [sitioOficina()];
    const prisma = this.prisma as any;
    if (!prisma?.activity?.findMany || !prisma?.serviceClientBranch?.findMany) return sitios;

    try {
      const { start, end } = workDayBounds(at);
      const enElDia = { gte: start, lte: end };
      // Columna `@db.Date` del día: una actividad de varios días vale todos los días de su
      // periodo (si no, el día 3 de una obra la sucursal ya no contaba como sitio válido).
      const dia = workDateColumn(at);
      const actividades = await prisma.activity.findMany({
        where: {
          ...companyWhere(tenantId),
          AND: [
            {
              OR: [
                { responsableId: userId },
                { assignees: { some: { userId, retiradoAt: null } } },
              ],
            },
            {
              OR: [
                { fechaAsignacion: enElDia },
                { fechaInicio: enElDia },
                { fechaMaxima: enElDia },
                { fechaEntregaEsperada: enElDia },
                { periodoInicio: { lte: dia }, periodoFin: { gte: dia } },
              ],
            },
          ],
        },
        select: { clientId: true, branchNumber: true, branchName: true },
        take: 50,
      });

      const clientIds = [
        ...new Set(
          actividades
            .map((a: { clientId: number | null }) => a.clientId)
            .filter((id: number | null): id is number => typeof id === 'number'),
        ),
      ];
      if (!clientIds.length) return sitios;

      const sucursales = await prisma.serviceClientBranch.findMany({
        where: {
          clientId: { in: clientIds },
          latitud: { not: null },
          longitud: { not: null },
          ...companyWhere(tenantId),
        },
        select: { clientId: true, name: true, branchNumber: true, latitud: true, longitud: true },
        take: 200,
      });

      const normal = (v?: string | null) => (v || '').trim().toLowerCase();
      for (const actividad of actividades) {
        if (typeof actividad.clientId !== 'number') continue;
        const delCliente = sucursales.filter(
          (s: { clientId: number }) => s.clientId === actividad.clientId,
        );
        // Si la actividad dice qué sucursal es, sólo esa; si no, cualquiera de ese cliente.
        const pedida = actividad.branchNumber || actividad.branchName;
        const elegidas = pedida
          ? delCliente.filter(
              (s: { name: string; branchNumber: string | null }) =>
                normal(s.branchNumber) === normal(actividad.branchNumber) ||
                normal(s.name) === normal(actividad.branchName),
            )
          : delCliente;
        for (const sucursal of elegidas.length ? elegidas : delCliente) {
          const latitude = Number(sucursal.latitud);
          const longitude = Number(sucursal.longitud);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
          if (sitios.some((s) => s.latitude === latitude && s.longitude === longitude)) continue;
          sitios.push({
            nombre: sucursal.name || 'Sucursal del cliente',
            latitude,
            longitude,
            radioM: RADIO_SITIO_M,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`No se pudieron resolver los sitios permitidos: ${(err as Error).message}`);
    }
    return sitios;
  }

  /**
   * Aviso «esta checada hay que mirarla» a sus jefes por organigrama y a dirección.
   * Nunca tumba el registro: si el aviso falla, la checada sigue siendo válida.
   */
  private async avisarChecadaMarcada(params: {
    userId: number;
    titulo: string;
    mensaje: string;
    attendanceId?: number | null;
    avisarPersona?: boolean;
  }) {
    try {
      const hierarchy = this.notificationHierarchy as {
        notifyAttendanceFlagged?: (p: typeof params) => Promise<void>;
      };
      if (typeof hierarchy?.notifyAttendanceFlagged === 'function') {
        await hierarchy.notifyAttendanceFlagged(params);
      }
    } catch (err) {
      this.logger.warn(`No se pudo avisar de la checada marcada: ${(err as Error).message}`);
    }
  }

  /**
   * Los últimos puntos con coordenadas de esta persona, del más reciente al más viejo.
   *
   * Alimenta las dos comprobaciones que no necesitan hardware nuevo —viaje imposible y
   * coordenada calcada—, así que se leen los pocos que hacen falta y nada más. Si la base
   * no puede contestar (Prisma simulado en pruebas) se devuelve vacío: no saber no es
   * motivo para acusar a nadie.
   */
  private async puntosAnteriores(
    userId: number,
    antesDe: Date,
    tenantId: number,
  ): Promise<PuntoChecada[]> {
    const prisma = this.prisma as any;
    if (typeof prisma?.attendance?.findMany !== 'function') return [];
    try {
      const filas = await prisma.attendance.findMany({
        where: { userId, timestamp: { lt: antesDe }, ...companyWhere(tenantId) },
        orderBy: { timestamp: 'desc' },
        take: REPETIDAS_PARA_SOSPECHAR,
        select: {
          timestamp: true,
          type: true,
          entryLatitude: true,
          entryLongitude: true,
          exitLatitude: true,
          exitLongitude: true,
        },
      });
      const out: PuntoChecada[] = [];
      for (const f of filas ?? []) {
        // Una entrada guarda su punto en `entry*` y una salida en `exit*`.
        const lat = f.type === 'salida' ? f.exitLatitude : f.entryLatitude;
        const lng = f.type === 'salida' ? f.exitLongitude : f.entryLongitude;
        const punto = this.realCoords(lat, lng);
        if (punto) out.push({ ...punto, at: f.timestamp });
      }
      return out;
    } catch (err) {
      this.logger.warn(`No se pudieron leer las checadas anteriores: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Deja constancia del intento y corta con 422.
   *
   * El registro **no** entra a `Attendance` —de ahí sale la nómina— pero el intento sí
   * queda: RH necesita poder ver quién quiso checar, desde dónde, con qué teléfono y por
   * qué no pasó. Antes el rechazo por ubicación simulada no guardaba absolutamente nada,
   * así que al día siguiente no había forma de demostrar que había ocurrido.
   *
   * Nunca lanza por no haber podido escribir la fila: perder el aviso es malo, pero dejar
   * pasar una checada falsa porque la tabla de auditoría falló sería peor.
   */
  private async rechazar(
    ctx: {
      userId: number;
      tipo: string;
      coords: { latitude: number; longitude: number } | null;
      accuracyM?: number | null;
      origen: OrigenChecada;
      deviceInfo?: string | null;
      capturedAt?: string | Date | null;
      tenantId: number;
    },
    motivo: MotivoRechazo,
    mensaje: string,
    detalle?: string,
  ): Promise<never> {
    const at = new Date();
    const prisma = this.prisma as any;
    if (typeof prisma?.attendanceRejection?.create === 'function') {
      try {
        const capturada = ctx.capturedAt ? new Date(ctx.capturedAt) : null;
        await prisma.attendanceRejection.create({
          data: {
            userId: ctx.userId,
            type: ctx.tipo,
            lat: ctx.coords?.latitude ?? null,
            lng: ctx.coords?.longitude ?? null,
            accuracyM:
              typeof ctx.accuracyM === 'number' && Number.isFinite(ctx.accuracyM)
                ? ctx.accuracyM
                : null,
            motivo,
            detalle: detalle ?? mensaje,
            origen: ctx.origen,
            deviceInfo: ctx.deviceInfo ?? null,
            clientCapturedAt:
              capturada && !Number.isNaN(capturada.getTime()) ? capturada : null,
            at,
            companyId: ctx.tenantId,
          },
        });
      } catch (err) {
        this.logger.warn(`No se pudo registrar el intento rechazado: ${(err as Error).message}`);
      }
    }

    // El intento desde el navegador no es un fraude: es alguien que abrió la web
    // en vez de la app. No se despierta a sus jefes por eso.
    if (motivo !== MOTIVO_RECHAZO.desdeNavegador) {
      await this.avisarChecadaMarcada({
        userId: ctx.userId,
        titulo:
          motivo === MOTIVO_RECHAZO.ubicacionSimulada
            ? 'Intento de checada con ubicación simulada'
            : 'Checada rechazada por el servidor',
        mensaje: [
          `${ctx.tipo === 'entrada' ? 'Entrada' : 'Salida'} rechazada`,
          horaAviso(at),
          detalle,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }

    throw new UnprocessableEntityException(mensaje);
  }

  /** Lo que se escribe en las columnas de validación de una checada. */
  private marcaValidacion(parts: Array<{ validacion: ValidacionChecada; motivo: string | null }>) {
    const validacion = parts.reduce<ValidacionChecada>(
      (acc, p) => combinarValidacion(acc, p.validacion),
      'OK',
    );
    const motivos = [
      ...new Set(
        parts.filter((p) => p.validacion === validacion && p.motivo).map((p) => p.motivo as string),
      ),
    ];
    return { validacion, motivoValidacion: motivos.length ? motivos.join(' · ') : null };
  }

  /**
   * Cierra una jornada que nadie cerró: salida a `min(entrada + 9 h, 23:30)`,
   * marcada como cierre automático y a revisión.
   *
   * La usa la tarea de las 23:30 y también la entrada del día siguiente: una
   * jornada abierta de ayer ya no puede dejar a nadie sin poder checar hoy.
   */
  private async cerrarJornadaAutomatica(
    day: { id: number; userId: number; lastEntryAt: Date | null },
    tenantId: number,
  ): Promise<Date | null> {
    if (!day.lastEntryAt) {
      await this.prisma.attendanceDay.update({
        where: { id: day.id },
        data: { isOpen: false, lastEntryAt: null },
      });
      return null;
    }
    const salidaAt = horaCierreAutomatico(day.lastEntryAt);
    const minutos = Math.max(0, Math.ceil((salidaAt.getTime() - day.lastEntryAt.getTime()) / 60000));

    let attendanceId: number | null = null;
    try {
      const creada = await this.prisma.attendance.create({
        data: {
          userId: day.userId,
          type: 'salida',
          timestamp: salidaAt,
          workDate: workDateColumn(day.lastEntryAt),
          deviceInfo: 'Cierre automático del sistema',
          cierreAutomatico: true,
          validacion: 'REVISAR',
          motivoValidacion: MOTIVO_VALIDACION.cierreAutomatico,
          companyId: tenantId,
        },
      });
      attendanceId = creada.id;
    } catch (error) {
      // Ya había una salida ese día: basta con cerrar la jornada.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }

    await this.prisma.attendanceDay.update({
      where: { id: day.id },
      data: { totalMinutes: { increment: minutos }, lastEntryAt: null, isOpen: false },
    });

    await this.avisarChecadaMarcada({
      userId: day.userId,
      titulo: 'Jornada cerrada automáticamente',
      mensaje: `${MOTIVO_VALIDACION.cierreAutomatico} · Salida puesta a las ${horaAviso(salidaAt)}`,
      attendanceId,
      avisarPersona: true,
    });

    return salidaAt;
  }

  /**
   * Tarea de las 23:30 (hora de México): toda jornada abierta del día recibe su
   * salida automática. Devuelve cuántas cerró.
   */
  async cerrarJornadasOlvidadas(ahora: Date = new Date()): Promise<{ cerradas: number }> {
    const dias = await this.prisma.attendanceDay.findMany({
      where: { isOpen: true, date: workDateColumn(ahora) },
      select: { id: true, userId: true, lastEntryAt: true, companyId: true },
    });
    let cerradas = 0;
    for (const dia of dias) {
      try {
        await this.cerrarJornadaAutomatica(dia, dia.companyId);
        cerradas += 1;
      } catch (err) {
        this.logger.error(
          `No se pudo cerrar la jornada ${dia.id} (userId=${dia.userId}): ${(err as Error).message}`,
        );
      }
    }
    if (cerradas) this.logger.log(`Cierre automático de jornadas: ${cerradas}`);
    return { cerradas };
  }

  /**
   * Corregir la hora de una checada — sólo dirección (CEO-equivalentes) y RH, y
   * siempre con motivo. No se pisa el dato en silencio: queda el antes, el
   * después, el motivo y quién lo hizo.
   */
  async corregirChecada(
    actor: { id: number; email?: string | null; permissions?: string[]; roleKey?: string | null; isSuperAdmin?: boolean },
    attendanceId: number,
    body: { timestamp?: string; motivo?: string },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    if (!this.puedeCorregirChecadas(actor)) {
      throw new ForbiddenException('Solo dirección y Recursos Humanos pueden corregir checadas');
    }
    if (!motivoCorreccionValido(body?.motivo)) {
      throw new BadRequestException('El motivo es obligatorio (al menos 10 caracteres)');
    }
    const nueva = new Date(body?.timestamp ?? '');
    if (Number.isNaN(nueva.getTime())) {
      throw new BadRequestException('timestamp debe ser una fecha ISO8601 válida');
    }

    const checada = await this.prisma.attendance.findFirst({
      where: { id: attendanceId, ...companyWhere(tenantId) },
    });
    if (!checada) throw new NotFoundException('Checada no encontrada');

    const antes = checada.timestamp;
    const motivo = String(body.motivo).trim();

    const actualizada = await this.prisma.attendance.update({
      where: { id: checada.id },
      data: {
        timestamp: nueva,
        workDate: workDateColumn(nueva),
        validacion: 'OK',
        motivoValidacion: null,
      },
    });

    await this.prisma.attendanceCorrection.create({
      data: { attendanceId: checada.id, antes, despues: nueva, motivo, porId: actor.id },
    });

    // La jornada del día se recalcula con las checadas que quedaron.
    await this.recalcularJornada(checada.userId, nueva, tenantId).catch((err) =>
      this.logger.warn(`No se pudo recalcular la jornada tras la corrección: ${(err as Error).message}`),
    );

    await this.avisarChecadaMarcada({
      userId: checada.userId,
      titulo: 'Corrigieron tu checada',
      mensaje: `${checada.type === 'entrada' ? 'Entrada' : 'Salida'} de ${horaAviso(antes)} a ${horaAviso(nueva)} · ${motivo.slice(0, 160)}`,
      attendanceId: checada.id,
      avisarPersona: true,
    });

    return {
      message: 'Checada corregida',
      data: {
        ...actualizada,
        correcciones: await this.correccionesDe([checada.id]).then((m) => m.get(checada.id) ?? []),
      },
    };
  }

  /**
   * Uniforme en la entrada: quien revisa la foto marca ✓ (`ok: true`) o ✗ (`ok: false`);
   * `ok: null` la deja otra vez sin revisar. De aquí sale el KPI «cumplimiento con uniforme».
   *
   * Pueden sus jefes (organigrama hacia arriba y el flujo de despacho, la misma regla de la
   * pizarra), dirección y RH. Nadie califica su propio uniforme.
   */
  async marcarUniforme(
    actor: { id: number; email?: string | null; permissions?: string[]; roleKey?: string | null; isSuperAdmin?: boolean },
    attendanceId: number,
    body: { ok?: boolean | null },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const ok = body?.ok;
    if (ok !== true && ok !== false && ok !== null) {
      throw new BadRequestException('ok debe ser true (con uniforme), false (sin uniforme) o null (sin revisar)');
    }
    const checada = await this.prisma.attendance.findFirst({
      where: { id: attendanceId, ...companyWhere(tenantId) },
      select: { id: true, userId: true, type: true },
    });
    if (!checada) throw new NotFoundException('Checada no encontrada');
    if (checada.type !== 'entrada') {
      throw new BadRequestException('El uniforme se revisa en la foto de entrada');
    }
    if (checada.userId === actor.id) {
      throw new ForbiddenException('No puedes revisar tu propio uniforme');
    }
    if (!(await this.puedeRevisarUniforme(actor, checada.userId, tenantId))) {
      throw new ForbiddenException('Solo sus jefes, dirección o RH revisan el uniforme');
    }

    const revisado = ok !== null;
    const actualizada = await this.prisma.attendance.update({
      where: { id: checada.id },
      data: {
        uniformeOk: ok,
        uniformeRevisadoPorId: revisado ? actor.id : null,
        uniformeRevisadoAt: revisado ? new Date() : null,
      },
      select: { id: true, userId: true, uniformeOk: true, uniformeRevisadoPorId: true, uniformeRevisadoAt: true },
    });
    return {
      message: ok === null ? 'Uniforme sin revisar' : ok ? 'Con uniforme' : 'Sin uniforme',
      data: {
        ...actualizada,
        uniformeRevisadoAt: actualizada.uniformeRevisadoAt?.toISOString() ?? null,
      },
    };
  }

  private async puedeRevisarUniforme(
    actor: { id: number; email?: string | null; roleKey?: string | null; isSuperAdmin?: boolean; permissions?: string[] },
    targetId: number,
    tenantId: number,
  ): Promise<boolean> {
    return this.alcanzaAPersona(actor, targetId, tenantId);
  }

  /**
   * ¿Esta persona está en el alcance del actor? Dirección y RH llegan a todos; un jefe,
   * a su organigrama hacia abajo. Es el mismo alcance de la pizarra y de los KPI.
   */
  private async alcanzaAPersona(
    actor: { id: number; email?: string | null; roleKey?: string | null; isSuperAdmin?: boolean; permissions?: string[] },
    targetId: number,
    tenantId: number,
  ): Promise<boolean> {
    if (this.puedeCorregirChecadas(actor) || esDeTodaLaEmpresa(actor)) return true;
    const users = await this.prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true, email: true, managerId: true },
    });
    return alcanzaA(actor, users, targetId);
  }

  /** Dirección (CEO-equivalentes) y RH: los únicos que pueden mover una hora. */
  private puedeCorregirChecadas(actor: {
    email?: string | null;
    roleKey?: string | null;
    permissions?: string[];
    isSuperAdmin?: boolean;
  }): boolean {
    if (isCeoEquivalentEmail(actor?.email)) return true;
    if (actor?.email && actor.email.toLowerCase() === 'developer@nexara.com.mx') return true;
    const roleKey = (actor?.roleKey || '').toLowerCase();
    return roleKey === 'rh' || roleKey === 'rrhh' || roleKey === 'recursos_humanos';
  }

  /** Suma de la jornada de un día a partir de sus checadas (tras corregir una hora). */
  private async recalcularJornada(userId: number, at: Date, tenantId: number) {
    const { start, end } = this.getDayBounds(at);
    const checadas = await this.prisma.attendance.findMany({
      where: { userId, timestamp: { gte: start, lt: end }, ...companyWhere(tenantId) },
      orderBy: { timestamp: 'asc' },
    });
    const entrada = checadas.find((c) => c.type === 'entrada');
    const salida = [...checadas].reverse().find((c) => c.type === 'salida');
    if (!entrada) return;
    const abierta = !salida;
    const minutos = salida
      ? Math.max(0, Math.ceil((salida.timestamp.getTime() - entrada.timestamp.getTime()) / 60000))
      : 0;
    await this.prisma.attendanceDay.upsert({
      where: {
        companyId_userId_date: { companyId: tenantId, userId, date: workDateColumn(at) },
      },
      create: {
        userId,
        date: workDateColumn(at),
        totalMinutes: minutos,
        lastEntryAt: abierta ? entrada.timestamp : null,
        isOpen: abierta,
        companyId: tenantId,
      },
      update: {
        totalMinutes: minutos,
        lastEntryAt: abierta ? entrada.timestamp : null,
        isOpen: abierta,
      },
    });
  }

  /** Correcciones de un conjunto de checadas, listas para las lecturas. */
  private async correccionesDe(attendanceIds: number[]) {
    const vacio = new Map<number, Array<Record<string, unknown>>>();
    const prisma = this.prisma as any;
    if (!attendanceIds.length || !prisma?.attendanceCorrection?.findMany) return vacio;
    try {
      const filas = await prisma.attendanceCorrection.findMany({
        where: { attendanceId: { in: attendanceIds } },
        orderBy: { createdAt: 'asc' },
        select: {
          attendanceId: true,
          antes: true,
          despues: true,
          motivo: true,
          createdAt: true,
          por: { select: { id: true, nombre: true } },
        },
      });
      const out = new Map<number, Array<Record<string, unknown>>>();
      for (const fila of filas) {
        const lista = out.get(fila.attendanceId) ?? [];
        lista.push({
          antes: fila.antes.toISOString(),
          despues: fila.despues.toISOString(),
          motivo: fila.motivo,
          por: fila.por ? { id: fila.por.id, nombre: fila.por.nombre } : null,
          at: fila.createdAt.toISOString(),
        });
        out.set(fila.attendanceId, lista);
      }
      return out;
    } catch (err) {
      this.logger.warn(`No se pudieron leer las correcciones: ${(err as Error).message}`);
      return vacio;
    }
  }

  async register(dto: CreateAttendanceDto, userId: number, req?: any, companyId?: number | null) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    if (!dto.photoBase64 || !String(dto.photoBase64).trim()) {
      throw new BadRequestException('La foto es obligatoria para registrar asistencia');
    }
    const tenantId = requireCompanyId(companyId);

    const userAgent = req?.headers?.['user-agent'] || req?.headers?.['User-Agent'];
    const deviceInfo = detectDeviceFromUserAgent(userAgent, req?.headers);
    const origen = origenChecada(userAgent, req?.headers);
    const coordsIntento = this.realCoords(dto.latitude, dto.longitude);
    /** Todo lo que necesita un rechazo para quedar registrado. */
    const contexto = {
      userId,
      tipo: dto.type,
      coords: coordsIntento,
      accuracyM: dto.accuracyM,
      origen,
      deviceInfo,
      capturedAt: dto.capturedAt ?? dto.timestamp ?? null,
      tenantId,
    };

    // Ubicación simulada: no se guarda la checada y sus jefes se enteran. Es el
    // truco barato para checar desde la cama, y de aquí sale la nómina.
    if (dto.mockLocation === true) {
      await this.rechazar(contexto, MOTIVO_RECHAZO.ubicacionSimulada, MENSAJE_UBICACION_SIMULADA);
    }

    // Nadie checa desde el navegador (decisión del dueño). La geolocalización de
    // una pestaña se falsea desde la consola en dos líneas, así que aquí no se
    // puede afirmar dónde estuvo nadie. Quien no pueda usar su teléfono, que su
    // jefe le registre la checada con motivo (`registrarPorJefe`).
    if (origen === 'WEB') {
      await this.rechazar(contexto, MOTIVO_RECHAZO.desdeNavegador, MENSAJE_SOLO_APP);
    }

    // Una posición guardada hace media hora no dice dónde está su dueño.
    const edad = edadDelPunto(dto.fixAgeMs);
    if (edad.veredicto === 'rechazar') {
      await this.rechazar(
        contexto,
        MOTIVO_RECHAZO.ubicacionVieja,
        MENSAJE_UBICACION_VIEJA,
        `Medición de hace ${Math.round((edad.edadMs ?? 0) / 60000)} min`,
      );
    }

    // La hora la pone el servidor. `timestamp` (campo viejo de la app 1.0.2) se
    // lee como hora del teléfono, no como la del registro.
    const hora = resolverHoraChecada({
      ahora: new Date(),
      capturedAt: dto.capturedAt ?? dto.timestamp ?? null,
      offline: dto.offline,
    });
    const now = hora.at;
    const today = this.getDateOnly(now);
    // Una sola lectura de las coordenadas para todo el registro: lo que se
    // guarda, lo que decide si hay GPS y lo que alimenta el rastreo salen de
    // aquí. Antes cada uno filtraba a su manera y `entryLatitude` acababa con
    // el (0,0) que los otros dos ya habían descartado.
    const coords = this.realCoords(dto.latitude, dto.longitude);
    if (!coords && (dto.latitude !== undefined || dto.longitude !== undefined)) {
      this.logger.warn(
        `Asistencia sin ubicación real (userId=${userId}, recibido lat=${dto.latitude} lng=${dto.longitude}); se guarda sin coordenadas`,
      );
    }

    const ubicacion = evaluarUbicacion({
      coords,
      accuracyM: dto.accuracyM,
      sitios: await this.sitiosPermitidos(userId, now, tenantId),
    });

    // Lo que solo se ve mirando las checadas anteriores de esta misma persona.
    // Las dos comprobaciones son gratis —una consulta, sin hardware nuevo— y
    // atrapan lo que el teléfono no delató.
    const anteriores = await this.puntosAnteriores(userId, now, tenantId);
    if (coords) {
      const viaje = viajeImposible(anteriores[0] ?? null, { ...coords, at: now });
      if (viaje.imposible) {
        await this.rechazar(
          { ...contexto, coords },
          MOTIVO_RECHAZO.viajeImposible,
          MENSAJE_VIAJE_IMPOSIBLE,
          `${viaje.distanciaM} m desde su checada anterior en ese tiempo (${viaje.velocidadKmh} km/h)`,
        );
      }
    }
    const repetida = coordenadaRepetida(coords, anteriores);
    const sospechas: Array<{ validacion: ValidacionChecada; motivo: string | null }> = [];
    if (edad.veredicto === 'revisar') {
      sospechas.push({ validacion: 'REVISAR', motivo: MOTIVO_VALIDACION.ubicacionVieja });
    }
    if (repetida) {
      sospechas.push({ validacion: 'REVISAR', motivo: MOTIVO_VALIDACION.coordenadaRepetida });
    }

    const marca = this.marcaValidacion([hora, ubicacion, ...sospechas]);
    const columnasValidacion = {
      clientCapturedAt: hora.clientCapturedAt,
      accuracyM:
        typeof dto.accuracyM === 'number' && Number.isFinite(dto.accuracyM) ? dto.accuracyM : null,
      fixAgeMs: edad.edadMs,
      origen,
      offline: hora.offline,
      mockDetected: false,
      validacion: marca.validacion,
      motivoValidacion: marca.motivoValidacion,
      fueraDeSitio: ubicacion.fueraDeSitio,
      distanciaSitioM: ubicacion.distanciaSitioM,
      sitioNombre: ubicacion.sitioNombre,
      cierreAutomatico: false,
    };

    const isEntry = dto.type === 'entrada';

    if (isEntry) {
      const existingEntry = await this.findAttendanceOnDate(userId, 'entrada', now, tenantId);
      if (existingEntry) {
        throw new BadRequestException('Ya existe una entrada registrada para hoy');
      }

      const openDay = await this.prisma.attendanceDay.findFirst({
        where: { userId, isOpen: true, ...companyWhere(tenantId) },
      });
      if (openDay) {
        // Una jornada abierta de un día anterior ya no bloquea la entrada de
        // hoy: se cierra sola (a revisión) y la persona puede checar.
        const esDeHoy =
          openDay.date instanceof Date && openDay.date.getTime() === today.getTime();
        if (esDeHoy) {
          throw new BadRequestException(
            'Tienes una jornada abierta sin salida. Registra salida antes de una nueva entrada.',
          );
        }
        await this.cerrarJornadaAutomatica(openDay, tenantId);
      }

      const attendance = await this.createAttendanceRecord({
        data: {
          userId,
          type: dto.type,
          timestamp: now,
          workDate: today,
          deviceInfo,
          photoUrl: this.persistAttendancePhoto(dto.photoBase64),
          entryLatitude: coords?.latitude ?? null,
          entryLongitude: coords?.longitude ?? null,
          ...columnasValidacion,
          companyId: tenantId,
        },
        include: { user: true },
      });
      await this.usarFotoComoAvatarSiFalta(userId, attendance.photoUrl, attendance.user?.avatarUrl);

      const day = await this.prisma.attendanceDay.upsert({
        where: { companyId_userId_date: { companyId: tenantId, userId, date: today } },
        create: {
          userId,
          date: today,
          totalMinutes: 0,
          lastEntryAt: now,
          isOpen: true,
          companyId: tenantId,
        },
        update: {
          lastEntryAt: now,
          isOpen: true,
        },
      });

      // Fichar NO es consentir el rastreo.
      //
      // Aquí se escribía `locationConsent: true` por el mero hecho de que la
      // petición trajera coordenadas. Nadie otorgaba nada: la base afirmaba un
      // consentimiento que el usuario nunca dio, y con él su posición pasaba a
      // ser visible en el mapa del equipo el resto de la jornada. El
      // consentimiento sólo se escribe desde `PATCH /gps/consent`, que cuelga
      // del interruptor de la pantalla de GPS.
      //
      // El punto de esta entrada sí se guarda: es el sitio desde el que fichó,
      // y para eso pidió el permiso. Lo que no se guarda es una autorización
      // permanente que no dio.
      if (coords) {
        await this.prisma['locationTracking'].create({
          data: {
            usuarioId: userId,
            latitud: coords.latitude,
            longitud: coords.longitude,
            velocidadKmh: null,
            estaActivo: true,
            ultimaActualizacion: now,
            // Una checada con ubicación simulada no llega hasta aquí: se rechazó arriba.
            mockLocation: false,
            companyId: tenantId,
          },
        });
      }

      this.emitAttendanceUpdate(userId, dto.type, now, attendance.user);

      try {
        await this.avisar({
          userId,
          type: 'ATTENDANCE_CHECKIN',
          category: 'attendance',
          title: 'Registraste tu entrada',
          message: [horaAviso(now), deviceInfo].filter(Boolean).join(' · '),
          icon: 'entrada',
          relatedEntityId: attendance.id,
          entityType: 'Attendance',
          relatedUrl: '/erp/asistencias',
          priority: 'normal',
        });
      } catch (selfNotificationError) {
        this.logger.warn(`No se pudo crear notificación propia de entrada para userId=${userId}`);
        this.logger.debug(
          selfNotificationError instanceof Error
            ? selfNotificationError.message
            : String(selfNotificationError),
        );
      }

      await this.notificationHierarchy.notifyAttendanceChange(
        userId,
        'ATTENDANCE_CHECKIN',
        attendance.user.nombre || 'Usuario',
        deviceInfo,
        now,
      );

      await this.avisarSiHayQueRevisar(userId, 'entrada', attendance.id, columnasValidacion);

      return {
        message: 'Entrada registrada exitosamente',
        data: attendance,
        day,
      };
    }

    // Salida: resolver jornada abierta ANTES de crear el registro (evita salidas huérfanas).
    const openDay = await this.resolveOpenDay(userId, now, tenantId);

    if (!openDay?.isOpen || !openDay.lastEntryAt) {
      const existingExit = await this.findAttendanceOnDate(userId, 'salida', now, tenantId);
      if (existingExit) {
        throw new BadRequestException('Ya existe una salida registrada para hoy');
      }
      throw new BadRequestException('No hay una entrada abierta para cerrar');
    }

    // Salida huérfana de un intento anterior (jornada sigue abierta): se
    // actualiza, no se borra. Un cierre automático de las 23:30 también cae
    // aquí, y borrar la única prueba de que existió esa salida —en una tabla de
    // la que sale la nómina— no es limpiar, es perder el dato.
    const orphanExit = await this.findAttendanceOnDate(userId, 'salida', now, tenantId);
    const datosSalida = {
      timestamp: now,
      workDate: today,
      deviceInfo,
      photoUrl: this.persistAttendancePhoto(dto.photoBase64),
      exitLatitude: coords?.latitude ?? null,
      exitLongitude: coords?.longitude ?? null,
      ...columnasValidacion,
    };

    const attendance = orphanExit
      ? await (async () => {
          this.logger.warn(
            `Salida previa reutilizada (id=${orphanExit.id}) para userId=${userId} al cerrar jornada abierta`,
          );
          return this.prisma.attendance.update({
            where: { id: orphanExit.id },
            data: datosSalida,
            include: { user: true },
          });
        })()
      : await this.createAttendanceRecord({
          data: {
            userId,
            type: dto.type,
            ...datosSalida,
            companyId: tenantId,
          },
          include: { user: true },
        });

    const diffMs = now.getTime() - openDay.lastEntryAt.getTime();
    const durationMinutes = diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
    const updatedDay = await this.prisma.attendanceDay.update({
      where: { id: openDay.id },
      data: {
        totalMinutes: { increment: durationMinutes },
        lastEntryAt: null,
        isOpen: false,
      },
    });

    // El `false` de la salida sí se queda. Revocar no es fabricar: apagar el
    // rastreo al cerrar la jornada es el comportamiento conservador, y deja al
    // usuario donde estaría si nunca hubiera consentido. Lo que se quitó, en la
    // entrada, era el `true` que nadie había otorgado.
    await this.prisma.user.update({
      where: { id: userId },
      data: { locationConsent: false },
    });

    await this.prisma['locationTracking'].updateMany({
      where: { usuarioId: userId, estaActivo: true },
      data: { estaActivo: false, ultimaActualizacion: now },
    });

    this.emitAttendanceUpdate(userId, dto.type, now, attendance.user);

    try {
      await this.avisar({
        userId,
        type: 'ATTENDANCE_CHECKOUT',
        category: 'attendance',
        title: 'Registraste tu salida',
        message: [horaAviso(now), deviceInfo].filter(Boolean).join(' · '),
        icon: 'salida',
        relatedEntityId: attendance.id,
        entityType: 'Attendance',
        relatedUrl: '/erp/asistencias',
        priority: 'normal',
      });
    } catch (selfNotificationError) {
      this.logger.warn(`No se pudo crear notificación propia de salida para userId=${userId}`);
      this.logger.debug(
        selfNotificationError instanceof Error
          ? selfNotificationError.message
          : String(selfNotificationError),
      );
    }

    await this.notificationHierarchy.notifyAttendanceChange(
      userId,
      'ATTENDANCE_CHECKOUT',
      attendance.user.nombre || 'Usuario',
      deviceInfo,
      now,
    );

    await this.avisarSiHayQueRevisar(userId, 'salida', attendance.id, columnasValidacion);

    return {
      message: 'Salida registrada exitosamente',
      data: attendance,
      day: updatedDay,
    };
  }

  /**
   * Una checada fuera de sitio o marcada para revisar no se queda callada: sus
   * jefes por organigrama y dirección se enteran en el momento.
   */
  private async avisarSiHayQueRevisar(
    userId: number,
    tipo: 'entrada' | 'salida',
    attendanceId: number,
    marca: {
      validacion: ValidacionChecada;
      motivoValidacion: string | null;
      fueraDeSitio: boolean;
      distanciaSitioM: number | null;
      sitioNombre: string | null;
    },
  ) {
    if (!marca.fueraDeSitio && marca.validacion !== 'REVISAR') return;
    const partes = [
      tipo === 'entrada' ? 'Entrada' : 'Salida',
      marca.fueraDeSitio && marca.distanciaSitioM != null
        ? `Fuera de sitio · a ${marca.distanciaSitioM} m de ${marca.sitioNombre || 'el sitio más cercano'}`
        : null,
      marca.motivoValidacion,
    ].filter(Boolean);
    await this.avisarChecadaMarcada({
      userId,
      titulo: marca.fueraDeSitio ? 'Checada fuera de sitio' : 'Checada por revisar',
      mensaje: partes.join(' · '),
      attendanceId,
    });
  }

  private async emitAttendanceUpdate(userId: number, type: string, timestamp: Date, user: any) {
    // Emit al usuario para actualizar su UI
    this.realtimeGateway.emit('attendance:updated', {
      userId,
      type,
      timestamp: timestamp.toISOString(),
      date: workDateKey(timestamp),
    });

    // Obtener admins relevantes y crear notificaciones
    try {
      const allAdmins = await this.prisma.user.findMany({
        where: {
          OR: [
            // Superadmins
            { email: { in: ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'] } },
            // Admins de consola
            { role: { accesoConsoleAdmin: true } },
            // Admins del mismo departamento
            { 
              AND: [
                { departmentId: user.departmentId },
                { role: { accesoConsoleAdmin: true } },
              ]
            },
          ],
        },
        select: { id: true, nombre: true, email: true },
      });

      // Crear notificaciones para cada admin
      const isSuperAdmin = this.isSuperAdminEmail(user.email);
      for (const admin of allAdmins) {
        // No notificar al propio usuario
        if (admin.id === userId) continue;
        
        // No notificar a admins si el usuario es un admin (except superadmins notifican a todos)
        const isAdminUser = !isSuperAdmin && allAdmins.some(a => a.id === userId);
        if (!this.isSuperAdminEmail(admin.email) && isAdminUser) continue;

        try {
          // El aviso con push lo manda NotificationHierarchyService.notifyAttendanceChange a sus
          // jefes y a Christian; aquí solo queda el evento en vivo para la consola web.
          // Emitir notificación en tiempo real al admin
          this.realtimeGateway.emit('attendance:notification', {
            adminId: admin.id,
            userId,
            type,
            userName: user.nombre,
            userEmail: user.email,
            timestamp: timestamp.toISOString(),
          });
        } catch (notificationError) {
          console.error(
            `Error creating attendance notification for admin ${admin.id}:`,
            notificationError,
          );
          continue;
        }
      }
    } catch (error) {
      console.error('Error emitting attendance notifications:', error);
    }
  }

  private normalizeProductivity(value?: string | null) {
    const normalized = (value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized.startsWith('alta') || normalized.startsWith('high')) return 'Alta';
    if (normalized.startsWith('media') || normalized.startsWith('medium')) return 'Media';
    if (normalized.startsWith('baja') || normalized.startsWith('low')) return 'Baja';
    return null;
  }

  private productivityScore(label: 'Alta' | 'Media' | 'Baja') {
    if (label === 'Alta') return 3;
    if (label === 'Media') return 2;
    return 1;
  }

  private productivityLevel(avgScore: number, count: number) {
    if (!count) return 'Sin datos';
    if (avgScore >= 2.5) return 'Alta';
    if (avgScore >= 1.75) return 'Media';
    return 'Baja';
  }

  private isCompanyWideAttendanceViewer(viewer: {
    isSuperAdmin?: boolean;
    roleKey?: string | null;
    email?: string | null;
    permissions?: string[];
  }): boolean {
    if (viewer.isSuperAdmin) return true;
    if (viewer.roleKey === 'ceo') return true;
    if (viewer.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) return true;
    const email = (viewer.email || '').toLowerCase();
    return isCeoEquivalentEmail(email) || email === 'developer@nexara.com.mx';
  }

  /** Viewer + descendientes por managerId dentro del tenant. */
  private async getManagerSubtreeIds(
    rootId: number,
    companyId?: number | null,
  ): Promise<Set<number>> {
    const tenantId = requireCompanyId(companyId);
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        companyMemberships: { some: { companyId: tenantId } },
      },
      select: { id: true, managerId: true },
    });
    const children = new Map<number, number[]>();
    for (const u of users) {
      if (u.managerId == null) continue;
      const list = children.get(u.managerId) ?? [];
      list.push(u.id);
      children.set(u.managerId, list);
    }
    const out = new Set<number>([rootId]);
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const child of children.get(id) ?? []) {
        if (out.has(child)) continue;
        out.add(child);
        queue.push(child);
      }
    }
    return out;
  }

  /**
   * Usuarios visibles en jerarquía de asistencia.
   * - Superadmin / CONSOLE_ADMIN: todos los activos del tenant
   * - ATTENDANCE_MANAGE (encargados): todos los activos del tenant;
   *   el recorte real es scope=subtree por managerId (no por departamento:
   *   los de campo suelen estar en otro depto. que su coordinador).
   */
  private async getAccessibleUsers(
    currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean },
    companyId?: number | null,
  ) {
    if (!currentUser?.id) {
      throw new BadRequestException('Usuario no autenticado');
    }
    const tenantId = requireCompanyId(companyId);
    const membership = {
      isActive: true,
      companyMemberships: { some: { companyId: tenantId } },
    };
    const isSuperAdmin = Boolean(currentUser.isSuperAdmin);
    const isConsoleAdmin = Boolean(currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN));
    const canManageAttendance = Boolean(currentUser.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE));

    if (!isSuperAdmin && !isConsoleAdmin && !canManageAttendance) {
      throw new ForbiddenException(
        'Tu nivel no te permite ver estadísticas de otros usuarios',
      );
    }

    if (isSuperAdmin || isConsoleAdmin || canManageAttendance) {
      return this.prisma.user.findMany({
        where: membership,
        include: { role: true, department: true },
        orderBy: { nombre: 'asc' },
      });
    }

    // Fallback: solo su propia información.
    return this.prisma.user.findMany({
      where: { id: currentUser.id, ...membership },
      include: { role: true, department: true },
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Obtiene estadísticas de asistencia para múltiples usuarios en un rango
   * Respeta la jerarquía de acceso
   */
  async getHierarchyAttendanceRange(
    currentUser: {
      id: number;
      departmentId: number;
      permissions?: string[];
      isSuperAdmin?: boolean;
      roleKey?: string | null;
      email?: string | null;
    },
    from?: string,
    to?: string,
    targetDepartmentId?: number,
    companyId?: number | null,
    scope?: 'subtree',
  ) {
    if (!from || !to) {
      throw new BadRequestException('Rango incompleto');
    }
    const tenantId = requireCompanyId(companyId);
    const tenant = companyWhere(tenantId);

    const fromDate = this.parseDateInput(from);
    const toDate = this.parseDateInput(to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Rango invalido');
    }

    // Obtener usuarios accesibles (solo miembros del tenant)
    let accessibleUsers = await this.getAccessibleUsers(currentUser, companyId);

    // Filtrar según el tipo de usuario:
    // - Superadmin: Ve todos EXCEPTO otros superadmins (y a sí mismo vía email plataforma)
    // - Admin consola / managers: él mismo + usuarios normales (sin permisos de admin de consola)
    // - scope=subtree (abajo) recorta encargados a su árbol managerId
    if (currentUser.isSuperAdmin) {
      // Superadmin: excluir otros superadmins
      accessibleUsers = accessibleUsers.filter(
        (user) => !this.isSuperAdminEmail(user.email),
      );
    } else if (
      currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) ||
      currentUser.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE)
    ) {
      // Admin consola o manager: sin otros admins de consola / plataforma
      accessibleUsers = accessibleUsers.filter(
        (user) =>
          user.id === currentUser.id ||
          (!user.role?.accesoConsoleAdmin && !this.isSuperAdminEmail(user.email)),
      );
    }

    // Company-wide (CEO/developer): no listar la propia tarjeta — es tablero del equipo.
    if (this.isCompanyWideAttendanceViewer(currentUser)) {
      accessibleUsers = accessibleUsers.filter((u) => u.id !== currentUser.id);
    }

    // Filtrar por departamento si se proporciona
    if (targetDepartmentId) {
      accessibleUsers = accessibleUsers.filter(
        (u) => u.departmentId === targetDepartmentId,
      );
    }

    // scope=subtree: manager + descendientes por managerId (CEO/plataforma conserva company-wide)
    if (scope === 'subtree' && !this.isCompanyWideAttendanceViewer(currentUser)) {
      const treeIds = await this.getManagerSubtreeIds(currentUser.id, companyId);
      accessibleUsers = accessibleUsers.filter((u) => treeIds.has(u.id));
    }

    // Instantes para filtrar por `timestamp`; valores de columna para `date`.
    const start = workDayStart(fromDate);
    const end = workDayEnd(toDate);
    const diaDesde = workDateColumn(fromDate);
    const diaHasta = workDateColumn(toDate);
    const now = new Date();
    const effectiveEnd = now < end ? now : end;

    const accessibleUserIds = accessibleUsers.map((user) => user.id);
    const justificadas = await this.justificacionesPorPersona(accessibleUserIds, from, to, tenantId);
    const evidenceRows = await this.prisma.evidence.findMany({
      where: {
        userId: { in: accessibleUserIds },
        calificacionEficiencia: { not: null },
        ...tenant,
        OR: [
          { revisadoEn: { gte: start, lte: end } },
          { revisadoEn: null, subidoEn: { gte: start, lte: end } },
        ],
      },
      select: {
        userId: true,
        calificacionEficiencia: true,
        observacionesRevision: true,
        revisadoEn: true,
        subidoEn: true,
      },
    });

    const productivityMap = new Map<
      number,
      {
        scoreSum: number;
        count: number;
        alta: number;
        media: number;
        baja: number;
        reviews: { rating: string; note: string | null; reviewedAt: string }[];
      }
    >();

    for (const row of evidenceRows) {
      const label = this.normalizeProductivity(row.calificacionEficiencia);
      if (!label) continue;
      const reviewedAt = (row.revisadoEn || row.subidoEn)?.toISOString?.();
      if (!reviewedAt) continue;
      const userId = typeof row.userId === 'number' ? row.userId : 0;
      const entry = productivityMap.get(userId) || {
        scoreSum: 0,
        count: 0,
        alta: 0,
        media: 0,
        baja: 0,
        reviews: [],
      };
      entry.scoreSum += this.productivityScore(label);
      entry.count += 1;
      if (label === 'Alta') entry.alta += 1;
      if (label === 'Media') entry.media += 1;
      if (label === 'Baja') entry.baja += 1;
      if (entry.reviews.length < 4) {
        entry.reviews.push({
          rating: label,
          note: row.observacionesRevision || null,
          reviewedAt,
        });
      }
      productivityMap.set(userId, entry);
    }

    // Obtener datos de asistencia para todos los usuarios accesibles
    const userStats = await Promise.all(
      accessibleUsers.map(async (user) => {
        const days = await this.prisma.attendanceDay.findMany({
          where: {
            userId: user.id,
            // Columna DATE, no instante: ver la nota de `getRangeSummary`.
            date: {
              gte: diaDesde,
              lte: diaHasta,
            },
            ...tenant,
          },
          orderBy: { date: 'asc' },
        });

        const totalMinutes = days.reduce(
          (sum, day) => {
            const openExtra = day.isOpen ? this.computeOpenMinutes(day.lastEntryAt, effectiveEnd) : 0;
            return sum + (day.totalMinutes || 0) + openExtra;
          },
          0,
        );
        const workDays = days.length;

        // Obtener registros de entrada/salida para detalles
        const attendances = await this.prisma.attendance.findMany({
          where: {
            userId: user.id,
            timestamp: {
              gte: start,
              lte: end,
            },
            ...tenant,
          },
          orderBy: { timestamp: 'asc' },
        });

        const correccionesPorChecada = await this.correccionesDe(attendances.map((a) => a.id));

        const activities = await this.prisma.activity.findMany({
          where: {
            responsableId: user.id,
            ...tenant,
            OR: [
              { fechaAsignacion: { gte: start, lte: end } },
              { fechaInicio: { gte: start, lte: end } },
              { fechaFinalizacion: { gte: start, lte: end } },
            ],
          },
          select: {
            id: true,
            anNumber: true,
            titulo: true,
            estatus: true,
            fechaAsignacion: true,
            fechaInicio: true,
            fechaFinalizacion: true,
          },
          orderBy: { fechaAsignacion: 'asc' },
        });

        return {
          userId: user.id,
          userName: user.nombre,
          email: user.email,
          employeeNumber: user.employeeNumber || null,
          department: user.department?.nombre,
          roleName: user.role.nombre,
          roleFlags: {
            accesoConsole: Boolean(user.role?.accesoConsole),
            accesoConsoleAdmin: Boolean(user.role?.accesoConsoleAdmin),
            accesoGestionUsuarios: Boolean(user.role?.accesoGestionUsuarios),
            accesoGestionTienda: Boolean(user.role?.accesoGestionTienda),
            accesoGestionWeb: Boolean(user.role?.accesoGestionWeb),
            accesoContabilidad: Boolean(user.role?.accesoContabilidad),
          },
          isSuperAdmin: this.isSuperAdminEmail(user.email),
          /** Días sin checada que Christian justificó: se muestran como «Falta justificada · motivo». */
          justificaciones: justificadas.get(user.id) ?? [],
          totalMinutes,
          workDays,
          avgMinutesPerDay:
            workDays > 0 ? Math.round(totalMinutes / workDays) : 0,
          days: days.map((day) => {
            const openExtra = day.isOpen ? this.computeOpenMinutes(day.lastEntryAt, effectiveEnd) : 0;
            return {
              date: day.date.toISOString().split('T')[0],
              totalMinutes: (day.totalMinutes || 0) + openExtra,
              isOpen: day.isOpen,
            };
          }),
          attendances: attendances.map((att) => ({
            id: att.id,
            type: att.type,
            timestamp: att.timestamp.toISOString(),
            deviceInfo: att.deviceInfo || null,
            photoUrl: att.photoUrl || undefined,
            entryLatitude: att.entryLatitude ?? undefined,
            entryLongitude: att.entryLongitude ?? undefined,
            exitLatitude: att.exitLatitude ?? undefined,
            exitLongitude: att.exitLongitude ?? undefined,
            ...this.datosValidacion(att, correccionesPorChecada),
          })),
          activities: activities.map((activity) => ({
            id: activity.id,
            anNumber: activity.anNumber,
            titulo: activity.titulo,
            estatus: activity.estatus,
            fechaAsignacion: activity.fechaAsignacion?.toISOString() || null,
            fechaInicio: activity.fechaInicio?.toISOString() || null,
            fechaFinalizacion: activity.fechaFinalizacion?.toISOString() || null,
          })),
          productivity: (() => {
            const entry = productivityMap.get(user.id);
            const count = entry?.count || 0;
            const avgScore = count ? entry!.scoreSum / count : 0;
            return {
              avgScore: Number(avgScore.toFixed(2)),
              level: this.productivityLevel(avgScore, count),
              counts: {
                alta: entry?.alta || 0,
                media: entry?.media || 0,
                baja: entry?.baja || 0,
              },
              reviewed: count,
              notes: entry?.reviews || [],
            };
          })(),
        };
      }),
    );

    const totalMinutesAll = userStats.reduce(
      (sum, stat) => sum + stat.totalMinutes,
      0,
    );
    const avgTime =
      userStats.length > 0
        ? Math.round(totalMinutesAll / userStats.length)
        : 0;

    return {
      rangeStart: start.toISOString().split('T')[0],
      rangeEnd: end.toISOString().split('T')[0],
      totalUsers: userStats.length,
      totalMinutesAll,
      avgMinutesPerUser: avgTime,
      users: userStats,
    };
  }

  }

