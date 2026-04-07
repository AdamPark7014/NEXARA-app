import { BadRequestException, Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service';
import { PERMISSIONS } from '../common/permissions.js';
import { detectDeviceFromUserAgent } from '../common/device-detector.js';

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

  private getDateOnly(date: Date) {
    const only = new Date(date);
    only.setHours(0, 0, 0, 0);
    return only;
  }

  private computeOpenMinutes(lastEntryAt: Date | null, rangeEnd: Date) {
    if (!lastEntryAt) return 0;
    const end = rangeEnd.getTime();
    const start = lastEntryAt.getTime();
    if (Number.isNaN(start) || end <= start) return 0;
    return Math.max(0, Math.floor((end - start) / 60000));
  }

  private parseDateInput(value: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map((part) => Number(part));
      return new Date(year, month - 1, day);
    }
    return new Date(value);
  }

  async getCurrentDay(userId: number) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    const today = this.getDateOnly(new Date());
    return this.prisma.attendanceDay.findUnique({
      where: { userId_date: { userId, date: today } },
    });
  }

  async getHistory(userId: number, date?: string) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    const base = date ? new Date(date) : new Date();
    if (Number.isNaN(base.getTime())) {
      throw new BadRequestException('Fecha invalida');
    }
    const start = this.getDateOnly(base);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    return this.prisma.attendance.findMany({
      where: {
        userId,
        timestamp: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  async getDaySummary(userId: number, date?: string) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    const base = date ? new Date(date) : new Date();
    if (Number.isNaN(base.getTime())) {
      throw new BadRequestException('Fecha invalida');
    }
    const day = this.getDateOnly(base);
    return this.prisma.attendanceDay.findUnique({
      where: { userId_date: { userId, date: day } },
    });
  }

  async getRangeSummary(userId: number, from?: string, to?: string) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    if (!from || !to) throw new BadRequestException('Rango incompleto');
    const fromDate = this.parseDateInput(from);
    const toDate = this.parseDateInput(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Rango invalido');
    }
    const start = this.getDateOnly(fromDate);
    const end = this.getDateOnly(toDate);
    end.setHours(23, 59, 59, 999);
    const now = new Date();
    const effectiveEnd = now < end ? now : end;

    const days = await this.prisma.attendanceDay.findMany({
      where: {
        userId,
        date: {
          gte: start,
          lte: end,
        },
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
            openEntryDate = this.getDateOnly(event.timestamp).toISOString().split('T')[0];
            return;
          }
          if (event.type === 'salida' && openEntryTime) {
            const diffMs = event.timestamp.getTime() - openEntryTime.getTime();
            const minutes = diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
            total += minutes;
            const dayKey = openEntryDate || this.getDateOnly(event.timestamp).toISOString().split('T')[0];
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
        const dayKey = openEntryDate || this.getDateOnly(effectiveEnd).toISOString().split('T')[0];
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

  async register(dto: CreateAttendanceDto, userId: number, req?: any) {
    if (!userId) throw new BadRequestException('Usuario no autenticado');
    const now = dto.timestamp ? new Date(dto.timestamp) : new Date();
    const today = this.getDateOnly(now);
    const userAgent = req?.headers?.['user-agent'] || req?.headers?.['User-Agent'];
    const deviceInfo = detectDeviceFromUserAgent(userAgent, req?.headers);

    // Determinar si es entrada o salida para guardar coordenadas correctas
    const isEntry = dto.type === 'entrada';
    
    // Validar que no exista ya una entrada/salida del mismo tipo hoy
    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        userId,
        type: dto.type,
        timestamp: {
          gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
          lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
        },
      },
    });

    if (existingAttendance) {
      throw new BadRequestException(`Ya existe una ${dto.type} registrada para hoy`);
    }
    
    const attendance = await this.prisma.attendance.create({
      data: {
        userId,
        type: dto.type,
        timestamp: now,
        deviceInfo,
        photoUrl: dto.photoBase64 || null,
        // Guardar coordenadas en los campos apropiados según si es entrada o salida
        ...(isEntry && {
          entryLatitude: dto.latitude || null,
          entryLongitude: dto.longitude || null,
        }),
        ...(!isEntry && {
          exitLatitude: dto.latitude || null,
          exitLongitude: dto.longitude || null,
        }),
      },
      include: { user: true },
    });

    if (isEntry) {
      const day = await this.prisma.attendanceDay.upsert({
        where: { userId_date: { userId, date: today } },
        create: {
          userId,
          date: today,
          totalMinutes: 0,
          lastEntryAt: now,
          isOpen: true,
        },
        update: {
          lastEntryAt: now,
          isOpen: true,
        },
      });

      // Abrir consentimiento de ubicación al iniciar jornada y dejar un primer punto GPS
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
      
      // Enviar notificación a supervisores
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

    const day = await this.prisma.attendanceDay.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (!day?.isOpen || !day.lastEntryAt) {
      throw new BadRequestException('No hay una entrada abierta para cerrar');
    }
    const diffMs = now.getTime() - day.lastEntryAt.getTime();
    const durationMinutes = diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
    const updatedDay = await this.prisma.attendanceDay.update({
      where: { id: day.id },
      data: {
        totalMinutes: { increment: durationMinutes },
        lastEntryAt: null,
        isOpen: false,
      },
    });

    // Cerrar consentimiento de ubicación al finalizar jornada y desactivar tracking activo
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
    
    // Enviar notificación a supervisores
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
      date: this.getDateOnly(timestamp).toISOString().split('T')[0],
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
   * - Superadmin (gerencia/developer): Ve todos los usuarios
    * - Console admin (CONSOLE_ADMIN): Ve todos los usuarios
    * - Usuario con ATTENDANCE_MANAGE sin CONSOLE_ADMIN: Solo su propio usuario
    * - Otros: No tiene acceso a esta funcion
   * 
    * NOTA: El filtrado final por tipo de usuario se hace en getHierarchyAttendanceRange
   */
  private async getAccessibleUsers(
    currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean },
  ) {
    if (!currentUser?.id) {
      throw new BadRequestException('Usuario no autenticado');
    }
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
        include: { role: true, department: true },
        orderBy: { nombre: 'asc' },
      });
    }

    // Usuario con attendance.manage pero sin privilegios de consola:
    // solo puede consultar su propia información.
    return this.prisma.user.findMany({
      where: { id: currentUser.id },
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
  ) {
    if (!from || !to) {
      throw new BadRequestException('Rango incompleto');
    }

    const fromDate = this.parseDateInput(from);
    const toDate = this.parseDateInput(to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Rango invalido');
    }

    // Obtener usuarios accesibles
    let accessibleUsers = await this.getAccessibleUsers(currentUser);

    // Filtrar según el tipo de usuario:
    // - Superadmin: Ve todos EXCEPTO otros superadmins
    // - Admin consola (no superadmin): Ve solo a él mismo + usuarios normales (sin permisos de admin)
    // - Usuario normal: Solo ve su propia información (manejado por getAccessibleUsers)
    if (currentUser.isSuperAdmin) {
      // Superadmin: excluir otros superadmins
      accessibleUsers = accessibleUsers.filter(
        (user) => !this.isSuperAdminEmail(user.email),
      );
    } else if (currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) {
      // Admin consola (no superadmin): solo él mismo + usuarios normales sin permisos de admin
      accessibleUsers = accessibleUsers.filter(
        (user) => 
          user.id === currentUser.id || // Él mismo
          (!user.role?.accesoConsoleAdmin && !this.isSuperAdminEmail(user.email)) // Usuarios normales sin accesoConsoleAdmin
      );
    }

    // Filtrar por departamento si se proporciona
    if (targetDepartmentId) {
      accessibleUsers = accessibleUsers.filter(
        (u) => u.departmentId === targetDepartmentId,
      );
    }

    const start = this.getDateOnly(fromDate);
    const end = this.getDateOnly(toDate);
    end.setHours(23, 59, 59, 999);
    const now = new Date();
    const effectiveEnd = now < end ? now : end;

    const accessibleUserIds = accessibleUsers.map((user) => user.id);
    const evidenceRows = await this.prisma.evidence.findMany({
      where: {
        userId: { in: accessibleUserIds },
        calificacionEficiencia: { not: null },
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
            date: {
              gte: start,
              lte: end,
            },
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
          },
          orderBy: { timestamp: 'asc' },
        });

        const activities = await this.prisma.activity.findMany({
          where: {
            responsableId: user.id,
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

