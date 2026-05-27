import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * Detecta tickets con SLA a punto de vencer y notifica a los usuarios
 * con acceso administrativo (Console Admin / Superadmin).
 *
 * Migrado del gateway WebSocket legacy a la cola unificada de notificaciones
 * (`NotificationsService`) — cada admin recibe un Notification persistente
 * que aparece en la campana + Web Push, en vez de un broadcast efímero.
 */
@Injectable()
export class TicketAlertsService {
  private readonly logger = new Logger(TicketAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/1 * * * *')
  async notifyUpcomingDeadlines() {
    const now = new Date();
    const alertAt = new Date(now.getTime() + 30 * 60 * 1000);

    const upcoming = await this.prisma.$queryRaw<
      Array<{ id: number; anNumber: string; clientName: string | null }>
    >`
      SELECT
        a.id,
        a."anNumber",
        c.name AS "clientName"
      FROM "Activity" a
      LEFT JOIN service_clients c ON c.id = a."clientId"
      WHERE a."clientId" IS NOT NULL
        AND a.estatus <> 'Finalizada'
        AND a."fechaEntregaEsperada" >= ${now}
        AND a."fechaEntregaEsperada" <= ${alertAt}
        AND a."slaAlertedAt" IS NULL
        AND a."deletedAt" IS NULL
    `;

    if (!upcoming.length) return;

    const adminUserIds = await this.getConsoleAdminIds();
    if (!adminUserIds.length) {
      this.logger.warn('SLA alert sin admins activos — no se envía notificación');
    }

    for (const activity of upcoming) {
      const message = `Ticket ${activity.anNumber} de ${activity.clientName || 'cliente'} vence en 30 min`;

      await Promise.all(
        adminUserIds.map((userId) =>
          this.notifications
            .createNotification({
              userId,
              type: 'SLA_ALERT' as any,
              category: 'sla-alert',
              priority: 'high',
              title: '⏰ Ticket por vencer',
              message,
              entityType: 'Activity',
              relatedEntityId: activity.id,
              relatedUrl: `/operacion/activities`,
            })
            .catch((err) => this.logger.warn(`SLA notify: ${err?.message || err}`)),
        ),
      );

      await this.prisma['activity'].update({
        where: { id: activity.id },
        data: { slaAlertedAt: new Date() },
      });
    }
  }

  private async getConsoleAdminIds(): Promise<number[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        OR: [
          { isSuperAdmin: true } as any,
          { role: { accesoConsoleAdmin: true } as any },
        ],
      },
      select: { id: true },
    });
    return admins.map((u) => Number(u.id)).filter((id) => Number.isFinite(id) && id > 0);
  }
}
