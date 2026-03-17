import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsGateway } from '../notifications.module';

@Injectable()
export class TicketAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
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

    for (const activity of upcoming) {
      this.notificationsGateway.sendNotification({
        message: `Ticket ${activity.anNumber} de ${activity.clientName || 'cliente'} vence en 30 min`,
        activityId: activity.id,
        adminOnly: true,
      });

      await this.prisma['activity'].update({
        where: { id: activity.id },
        data: { slaAlertedAt: new Date() },
      });
    }
  }
}
