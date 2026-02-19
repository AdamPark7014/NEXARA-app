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

    const upcoming = await this.prisma['activity'].findMany({
      where: {
        clientId: { not: null },
        estatus: { not: 'Finalizada' },
        fechaEntregaEsperada: { gte: now, lte: alertAt },
        slaAlertedAt: null,
      },
      include: { client: true, responsable: true },
    });

    if (!upcoming.length) return;

    for (const activity of upcoming) {
      this.notificationsGateway.sendNotification({
        message: `Ticket ${activity.anNumber} de ${activity.client?.name || 'cliente'} vence en 30 min`,
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
