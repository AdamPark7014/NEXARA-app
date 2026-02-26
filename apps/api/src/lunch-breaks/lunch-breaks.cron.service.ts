import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class LunchBreaksCronService {
  private readonly logger = new Logger(LunchBreaksCronService.name);

  constructor(private prisma: PrismaService) {}

  // Notificación a las 14:50 (2:50 PM) - Lunes a Viernes
  @Cron('50 14 * * 1-5') // Minuto 50, hora 14, cualquier día del mes, cualquier mes, lunes a viernes
  async notifyLunchBreakApproaching() {
    this.logger.debug('CRON: Enviando notificaciones de hora de comida próxima');

    try {
      const users = await this.prisma['user'].findMany({
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
        .filter(u => u.email !== 'developer@nexara.com.mx' && u.email !== 'gerencia@nexara.com.mx') // Excluir superadmins
        .map(u => ({
          usuarioId: u.id,
          tipo: 'LUNCH_BREAK_APPROACHING',
          titulo: '🍽️ Hora de Comida',
          mensaje: `Tu hora de comida se acerca en 10 minutos. Registra tu entrada, deja tu escritorio limpio y tómate tiempo para descansar.`,
          leido: false,
          createdAt: new Date(),
        }));

      if (notifications.length > 0) {
        await this.prisma['notification'].createMany({
          data: notifications as any,
        });

        this.logger.log(`✓ Notificaciones enviadas a ${notifications.length} usuarios`);
      }

      // Emitir evento WebSocket para notificaciones en tiempo real
      this.broadcastNotification('lunch_break:approaching', notifications);
    } catch (error) {
      this.logger.error('Error enviando notificaciones de comida:', error);
    }
  }

  // Notificación a las 16:05 (4:05 PM) - Lunes a Viernes
  @Cron('5 16 * * 1-5') // Minuto 5, hora 16, cualquier día del mes, cualquier mes, lunes a viernes
  async notifyLunchBreakExpired() {
    this.logger.debug('CRON: Enviando notificaciones de hora de comida expirada');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Obtener usuarios que no han hecho checkout de comida
      const usersWithoutCheckout = await this.prisma['lunchBreak'].findMany({
        where: {
          date: today,
          checkoutTime: null, // No han hecho checkout
        },
        select: {
          usuario: {
            select: {
              id: true,
              nombre: true,
              email: true,
            },
          },
        },
        distinct: ['usuarioId'],
      });

      if (usersWithoutCheckout.length === 0) {
        this.logger.log('No hay usuarios pendientes de checkout de comida');
        return;
      }

      const notifications = usersWithoutCheckout
        .filter(u => u.usuario.email !== 'developer@nexara.com.mx' && u.usuario.email !== 'gerencia@nexara.com.mx')
        .map(u => ({
          usuarioId: u.usuario.id,
          tipo: 'LUNCH_BREAK_EXPIRED',
          titulo: '🍽️ Hora de Comida Completada',
          mensaje: `Tu hora de comida ha expirado. Por favor regresa al trabajo y registra tu salida con una foto de que iniciaste labores nuevamente.`,
          leido: false,
          createdAt: new Date(),
        }));

      if (notifications.length > 0) {
        await this.prisma['notification'].createMany({
          data: notifications as any,
        });

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
      const adminUsers = await this.prisma['user'].findMany({
        where: {
          role: {
            accesoConsoleAdmin: true,
          },
        },
        select: { id: true },
      });

      const isSuperAdmin = userData.email === 'developer@nexara.com.mx' || userData.email === 'gerencia@nexara.com.mx';
      
      const messages = {
        checkin: `${userData.nombre} registró su entrada a comida. Foto capturada.`,
        checkout: `${userData.nombre} registró su regreso del almuerzo. Foto capturada.`,
      };

      const titles = {
        checkin: `🍽️ ${userData.nombre} - Entrada a Comida`,
        checkout: `🍽️ ${userData.nombre} - Regreso del Almuerzo`,
      };

      // Si es un usuario normal, notificar a admins
      // Si es admin, notificar a superadmins y otros admins
      let targetUserIds = [];

      if (!isSuperAdmin && !userData.email.includes('@nexara.com.mx')) {
        // Usuario normal -> notificar a admins
        targetUserIds = adminUsers.map(u => u.id);
      } else if (adminUsers.length > 0) {
        // Admin -> notificar a otros admins y superadmins
        targetUserIds = adminUsers.map(u => u.id).filter(id => id !== userData.id);
      }

      if (targetUserIds.length > 0) {
        const notifications = targetUserIds.map(userId => ({
          usuarioId: userId,
          tipo: type === 'checkin' ? 'USER_LUNCH_CHECKIN' : 'USER_LUNCH_CHECKOUT',
          titulo: titles[type],
          mensaje: messages[type],
          leido: false,
          createdAt: new Date(),
        }));

        await this.prisma['notification'].createMany({
          data: notifications as any,
        });

        this.broadcastNotification(`lunch_break:${type}`, { user: userData, targetUsers: targetUserIds });
      }
    } catch (error) {
      this.logger.error(`Error notificando admin sobre comida de usuario:`, error);
    }
  }

  private broadcastNotification(event: string, data: any) {
    // Aquí iría la integración con WebSocket/Socket.io
    // Por ahora solo logging
    this.logger.log(`WebSocket event: ${event}`, data);
  }
}
