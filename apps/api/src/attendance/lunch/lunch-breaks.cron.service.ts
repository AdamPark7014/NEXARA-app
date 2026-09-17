import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { WORKDAY_TIMEZONE, workDateColumn } from '../../common/time/workday.js';
import { horaAviso, nombreCorto } from '../../notifications/notification-push-meta.js';

@Injectable()
export class LunchBreaksCronService {
  private readonly logger = new Logger(LunchBreaksCronService.name);

  constructor(
    private prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Notificación a las 14:50 (2:50 PM) hora de México - Lunes a Viernes.
  //
  // Sin `timeZone` el cron usa la del proceso, que en el contenedor es UTC:
  // el aviso de "tu comida es en 10 minutos" salía a las 08:50 de México.
  @Cron('50 14 * * 1-5', { timeZone: WORKDAY_TIMEZONE })
  async notifyLunchBreakApproaching() {
    this.logger.debug('CRON: Enviando notificaciones de hora de comida próxima');

    try {
      const users = await this.prisma.user.findMany({
        where: {
          role: {
            accesoConsole: true, // Usuarios con acceso a consola (no superadmin)
          },
        },
        select: {
          id: true,
          nombre: true,
          email: true,
        },
      });

      // Crear notificaciones para cada usuario
      const notifications = users
        .filter((u: any) => u.email !== 'developer@nexara.com.mx' && u.email !== 'gerencia@nexara.com.mx') // Excluir superadmins
        .map((u: any) => ({
          userId: u.id,
          type: NotificationType.LUNCH_CHECKIN,
          category: 'lunch_break',
          title: 'Tu hora de comida empieza en 10 minutos',
          message: 'Registra tu salida a comer con foto desde la app',
          icon: 'comida_sale',
          isRead: false,
          entityType: 'lunch_break',
          priority: 'normal',
          createdAt: new Date(),
        }));

      if (notifications.length > 0) {
        await this.pushAll(notifications);

        this.logger.log(`✓ Notificaciones enviadas a ${notifications.length} usuarios`);
      }

      // Emitir evento WebSocket para notificaciones en tiempo real
      this.broadcastNotification('lunch_break:approaching', notifications);
    } catch (error) {
      this.logger.error('Error enviando notificaciones de comida:', error);
    }
  }

  // Notificación a las 16:05 (4:05 PM) hora de México - Lunes a Viernes.
  @Cron('5 16 * * 1-5', { timeZone: WORKDAY_TIMEZONE })
  async notifyLunchBreakExpired() {
    this.logger.debug('CRON: Enviando notificaciones de hora de comida expirada');

    try {
      // Mismo día que escribe `LunchBreaksService`: el de México, no el del
      // contenedor. Con `setHours(0,0,0,0)` este cron buscaba el día UTC y no
      // encontraba las comidas abiertas de la tarde mexicana.
      const today = workDateColumn(new Date());

      // Obtener usuarios que no han hecho checkout de comida
      const usersWithoutCheckout = await this.prisma.lunchBreak.findMany({
        where: {
          date: today,
          checkoutTime: null, // No han hecho checkout
        },
        select: {
          user: {
            select: {
              id: true,
              nombre: true,
              email: true,
            },
          },
        },
        distinct: ['userId'],
      });

      if (usersWithoutCheckout.length === 0) {
        this.logger.log('No hay usuarios pendientes de checkout de comida');
        return;
      }

      const notifications = usersWithoutCheckout
        .filter((u: any) => u.user.email !== 'developer@nexara.com.mx' && u.user.email !== 'gerencia@nexara.com.mx')
        .map((u: any) => ({
          userId: u.user.id,
          type: NotificationType.LUNCH_CHECKOUT,
          category: 'lunch_break',
          title: 'Tu hora de comida terminó',
          message: 'Registra tu regreso con una foto al retomar labores',
          icon: 'comida_tarde',
          isRead: false,
          entityType: 'lunch_break',
          priority: 'high',
          createdAt: new Date(),
        }));

      if (notifications.length > 0) {
        await this.pushAll(notifications);

        this.logger.log(`✓ Notificaciones de expiración enviadas a ${notifications.length} usuarios`);
      }

      // Emitir evento WebSocket
      this.broadcastNotification('lunch_break:expired', notifications);
    } catch (error) {
      this.logger.error('Error enviando notificaciones de comida expirada:', error);
    }
  }

  // Notificación para admins cuando usuarios registran comida (solo en horario de trabajo)
  async notifyAdminUserLunchBreak(userData: { id: number; nombre: string; email: string }, type: 'checkin' | 'checkout', photoUrl?: string) {
    try {
      const adminUsers = await this.prisma.user.findMany({
        where: {
          role: {
            accesoConsoleAdmin: true,
          },
        },
        select: { id: true },
      });

      const isSuperAdmin = userData.email === 'developer@nexara.com.mx' || userData.email === 'gerencia@nexara.com.mx';
      
      const nombre = nombreCorto(userData.nombre) || 'Alguien del equipo';
      const hora = horaAviso(new Date());
      const messages = {
        checkin: `${hora} · Registro con foto`,
        checkout: `${hora} · Registro con foto`,
      };

      const titles = {
        checkin: `${nombre} salió a comer`,
        checkout: `${nombre} regresó de comer`,
      };

      // Si es un usuario normal, notificar a admins
      // Si es admin, notificar a superadmins y otros admins
      let targetUserIds = [];

      if (!isSuperAdmin && !userData.email.includes('@nexara.com.mx')) {
        // Usuario normal -> notificar a admins
        targetUserIds = adminUsers.map((u: any) => u.id);
      } else if (adminUsers.length > 0) {
        // Admin -> notificar a otros admins y superadmins
        targetUserIds = adminUsers.map((u: any) => u.id).filter((id: any) => id !== userData.id);
      }

      if (targetUserIds.length > 0) {
        const notifications = targetUserIds.map((userId: any) => ({
          userId,
          type: type === 'checkin' ? NotificationType.LUNCH_CHECKIN : NotificationType.LUNCH_CHECKOUT,
          category: 'lunch_break',
          title: titles[type],
          message: messages[type],
          icon: type === 'checkin' ? 'comida_sale' : 'comida_regresa',
          isRead: false,
          entityType: 'lunch_break',
          priority: 'normal',
          createdAt: new Date(),
        }));

        await this.pushAll(notifications);

        this.broadcastNotification(`lunch_break:${type}`, { user: userData, targetUsers: targetUserIds });
      }
    } catch (error) {
      this.logger.error(`Error notificando admin sobre comida de usuario:`, error);
    }
  }

  /** Cada aviso por NotificationsService para que también salga push (createMany solo llenaba la campana). */
  private async pushAll(
    notifications: Array<{
      userId: number;
      type: NotificationType;
      category: string;
      title: string;
      message: string;
      entityType: string;
      priority: string;
      icon?: string;
    }>,
  ) {
    for (const n of notifications) {
      await this.notificationsService
        .createNotification({
          userId: n.userId,
          type: n.type,
          category: n.category,
          title: n.title,
          message: n.message,
          icon: n.icon,
          entityType: n.entityType,
          priority: n.priority === 'high' ? 'high' : 'normal',
          relatedUrl: '/erp/asistencias',
          dedupeSeconds: 0,
        })
        .catch((error) =>
          this.logger.warn(
            `Aviso de comida userId=${n.userId}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    }
  }

  private broadcastNotification(event: string, data: any) {
    // Aquí iría la integración con WebSocket/Socket.io
    // Por ahora solo logging
    this.logger.log(`WebSocket event: ${event}`, data);
  }
}
