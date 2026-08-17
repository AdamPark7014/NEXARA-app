import { BadRequestException, Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service';
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
import { Prisma } from '@prisma/client';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  private isSuperAdminEmail(email?: string | null) {
    if (!email) return false;
    const normalized = email.toLowerCase();
    return ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'].includes(normalized);
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

  private computeOpenMinutes(lastEntryAt: Date | null, rangeEnd: Date) {
    if (!lastEntryAt) return 0;
    const end = rangeEnd.getTime();
    const start = lastEntryAt.getTime();
    if (Number.isNaN(start) || end <= start) return 0;
    return Math.max(0, Math.floor((end - start) / 60000));
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
    return {
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
        type: att.type,
        timestamp: att.timestamp.toISOString(),
        deviceInfo: att.deviceInfo || null,
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

  async register(dto: CreateAttendanceDto, userId: number, req?: any, companyId?: number | null) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    const tenantId = requireCompanyId(companyId);
    const now = dto.timestamp ? new Date(dto.timestamp) : new Date();
    const today = this.getDateOnly(now);
    const userAgent = req?.headers?.['user-agent'] || req?.headers?.['User-Agent'];
    const deviceInfo = detectDeviceFromUserAgent(userAgent, req?.headers);

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
        throw new BadRequestException(
          'Tienes una jornada abierta sin salida. Registra salida antes de una nueva entrada.',
        );
      }

      const attendance = await this.createAttendanceRecord({
        data: {
          userId,
          type: dto.type,
          timestamp: now,
          workDate: today,
          deviceInfo,
          photoUrl: dto.photoBase64 || null,
          entryLatitude: dto.latitude || null,
          entryLongitude: dto.longitude || null,
          companyId: tenantId,
        },
        include: { user: true },
      });

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

      await this.prisma.user.update({
        where: { id: userId },
        data: { locationConsent: true },
      });

      if (typeof dto.latitude === 'number' && typeof dto.longitude === 'number') {
        await this.prisma['locationTracking'].create({
          data: {
            usuarioId: userId,
            latitud: dto.latitude,
            longitud: dto.longitude,
            velocidadKmh: null,
            estaActivo: true,
            ultimaActualizacion: now,
            companyId: tenantId,
          },
        });
      }

      this.emitAttendanceUpdate(userId, dto.type, now, attendance.user);

      try {
        await this.prisma.notification.create({
          data: {
            userId,
            type: 'ATTENDANCE_CHECKIN',
            category: 'attendance',
            title: 'Entrada registrada',
            message: `Registraste tu entrada desde ${deviceInfo}.`,
            relatedEntityId: attendance.id,
            entityType: 'Attendance',
            priority: 'normal',
          },
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
      );

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

    // Limpiar salida huérfana de un intento fallido anterior (jornada sigue abierta).
    const orphanExit = await this.findAttendanceOnDate(userId, 'salida', now, tenantId);
    if (orphanExit) {
      await this.prisma.attendance.delete({ where: { id: orphanExit.id } });
      this.logger.warn(
        `Salida huérfana eliminada (id=${orphanExit.id}) para userId=${userId} al cerrar jornada abierta`,
      );
    }

    const attendance = await this.createAttendanceRecord({
      data: {
        userId,
        workDate: today,
        type: dto.type,
        timestamp: now,
        deviceInfo,
        photoUrl: dto.photoBase64 || null,
        exitLatitude: dto.latitude || null,
        exitLongitude: dto.longitude || null,
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
      await this.prisma.notification.create({
        data: {
          userId,
          type: 'ATTENDANCE_CHECKOUT',
          category: 'attendance',
          title: 'Salida registrada',
          message: `Registraste tu salida desde ${deviceInfo}.`,
          relatedEntityId: attendance.id,
          entityType: 'Attendance',
          priority: 'normal',
        },
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
    );

    return {
      message: 'Salida registrada exitosamente',
      data: attendance,
      day: updatedDay,
    };
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

        const typeLabel = type === 'entrada' ? 'entrada' : 'salida';
        const title = `${user.nombre} registró ${typeLabel}`;
        const message = `${user.nombre} (${user.email}) registró ${typeLabel} a las ${timestamp.toLocaleTimeString('es-MX')}`;

        try {
          await this.prisma.notification.create({
            data: {
              userId: admin.id,
              type: type === 'entrada' ? 'ATTENDANCE_CHECKIN' : 'ATTENDANCE_CHECKOUT',
              category: 'attendance',
              title,
              message,
              relatedEntityId: userId,
              entityType: 'Attendance',
            },
          });

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

  /**
  * Obtiene usuarios accesibles según la jerarquía del usuario actual
  * - Superadmin (gerencia/developer): Ve todos los usuarios del tenant
    * - Console admin (CONSOLE_ADMIN): Ve todos los usuarios del tenant
    * - Usuario con ATTENDANCE_MANAGE sin CONSOLE_ADMIN: Solo su propio usuario
    * - Otros: No tiene acceso a esta funcion
   * 
    * NOTA: El filtrado final por tipo de usuario se hace en getHierarchyAttendanceRange
   */
  private async getAccessibleUsers(
    currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean },
    companyId?: number | null,
  ) {
    if (!currentUser?.id) {
      throw new BadRequestException('Usuario no autenticado');
    }
    const tenantId = requireCompanyId(companyId);
    const membership = { companyMemberships: { some: { companyId: tenantId } } };
    const isSuperAdmin = Boolean(currentUser.isSuperAdmin);
    const isConsoleAdmin = Boolean(currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN));
    const canManageAttendance = Boolean(currentUser.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE));

    if (!isSuperAdmin && !isConsoleAdmin && !canManageAttendance) {
      throw new ForbiddenException(
        'Tu nivel no te permite ver estadísticas de otros usuarios',
      );
    }

    if (isSuperAdmin || isConsoleAdmin) {
      return this.prisma.user.findMany({
        where: membership,
        include: { role: true, department: true },
        orderBy: { nombre: 'asc' },
      });
    }

    // v2 OPS managers have ATTENDANCE_MANAGE but not CONSOLE_ADMIN —
    // give them department-level scope (same as console admin, filtered later).
    if (canManageAttendance) {
      return this.prisma.user.findMany({
        where: {
          ...membership,
          departmentId: currentUser.departmentId,
          role: { accesoConsoleAdmin: false },
        },
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
    currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean },
    from?: string,
    to?: string,
    targetDepartmentId?: number,
    companyId?: number | null,
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
    // - Superadmin: Ve todos EXCEPTO otros superadmins
    // - Admin consola (no superadmin): Ve solo a él mismo + usuarios normales (sin permisos de admin)
    // - Usuario normal: Solo ve su propia información (manejado por getAccessibleUsers)
    if (currentUser.isSuperAdmin) {
      // Superadmin: excluir otros superadmins
      accessibleUsers = accessibleUsers.filter(
        (user) => !this.isSuperAdminEmail(user.email),
      );
    } else if (
      currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) ||
      currentUser.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE)
    ) {
      // Admin consola o v2 manager: solo él mismo + usuarios normales sin permisos de admin
      accessibleUsers = accessibleUsers.filter(
        (user) =>
          user.id === currentUser.id ||
          (!user.role?.accesoConsoleAdmin && !this.isSuperAdminEmail(user.email)),
      );
    }

    // Filtrar por departamento si se proporciona
    if (targetDepartmentId) {
      accessibleUsers = accessibleUsers.filter(
        (u) => u.departmentId === targetDepartmentId,
      );
    }

    // Instantes para filtrar por `timestamp`; valores de columna para `date`.
    const start = workDayStart(fromDate);
    const end = workDayEnd(toDate);
    const diaDesde = workDateColumn(fromDate);
    const diaHasta = workDateColumn(toDate);
    const now = new Date();
    const effectiveEnd = now < end ? now : end;

    const accessibleUserIds = accessibleUsers.map((user) => user.id);
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
            type: att.type,
            timestamp: att.timestamp.toISOString(),
            deviceInfo: att.deviceInfo || null,
            photoUrl: att.photoUrl || undefined,
            entryLatitude: att.entryLatitude || undefined,
            entryLongitude: att.entryLongitude || undefined,
            exitLatitude: att.exitLatitude || undefined,
            exitLongitude: att.exitLongitude || undefined,
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

