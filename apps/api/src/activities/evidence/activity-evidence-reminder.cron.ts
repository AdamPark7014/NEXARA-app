import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { appUrls } from '../../common/app-urls.js';
import { WORKDAY_TIMEZONE } from '../../common/time/workday.js';

/**
 * Recordatorio diario: evidencias completadas que siguen «Pendiente» de revisión
 * después de 24 horas. Notifica al responsable de la actividad una vez al día
 * por evidencia (dedupe de 24 h por evidencia y revisor).
 */
@Injectable()
export class ActivityEvidenceReminderCronService {
  private readonly logger = new Logger(ActivityEvidenceReminderCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_09, { timeZone: WORKDAY_TIMEZONE })
  async sendDailyReminders() {
    try {
      const total = await this.sendPendingReminders();
      if (total > 0) {
        this.logger.log(`Evidences reminder: ${total} recordatorio(s) enviados`);
      }
    } catch (error) {
      this.logger.error('Evidences reminder cron failed', error as any);
    }
  }

  /**
   * Expuesto para pruebas: ejecuta el chequeo y devuelve el número de avisos enviados.
   */
  async sendPendingReminders(now: Date = new Date()): Promise<number> {
    const threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Evidencias listas (COMPLETED), todavía en revisión (PENDING), sin revisar por >24h.
    // Prioridad del "desde cuándo": correctionSubmittedAt > completedAt > updatedAt.
    const rows = await this.prisma.activityEvidence.findMany({
      where: {
        status: 'COMPLETED',
        reviewStatus: 'PENDING',
        OR: [
          { correctionSubmittedAt: { not: null, lte: threshold } },
          {
            AND: [
              { correctionSubmittedAt: null },
              { completedAt: { not: null, lte: threshold } },
            ],
          },
          {
            AND: [
              { correctionSubmittedAt: null },
              { completedAt: null },
              { updatedAt: { lte: threshold } },
            ],
          },
        ],
      },
      include: {
        activity: {
          select: { id: true, titulo: true, anNumber: true, responsableId: true, companyId: true },
        },
        user: { select: { id: true, nombre: true } }, // Quien subió la evidencia
      },
      take: 300,
    });

    let sent = 0;
    for (const ev of rows) {
      const activityId = ev.activityId;
      const reviewerId = ev.activity?.responsableId ?? null;
      if (!reviewerId) continue;

      const actividad = ev.activity?.titulo?.trim() || ev.activity?.anNumber || `Actividad #${activityId}`;
      const quien = ev.user?.nombre?.trim() || 'alguien de tu equipo';

      try {
        await this.notifications.createNotification({
          userId: reviewerId,
          type: 'EVIDENCE_SUBMITTED',
          category: 'evidences',
          title: 'Recordatorio: evidencia por revisar',
          message: `«${actividad}» lleva más de 24 h pendiente de revisión (${quien}).`,
          icon: 'por_revisar',
          relatedEntityId: ev.id, // dedupe por evidencia
          entityType: 'ActivityEvidence',
          relatedUrl: appUrls.erpActividadEvidencias(activityId),
          priority: 'normal',
          companyId: ev.activity?.companyId ?? undefined,
          // Un aviso por evidencia al día para ese revisor.
          dedupeSeconds: 24 * 60 * 60,
        });
        sent += 1;
      } catch (error) {
        this.logger.warn(
          `Reminder skip evidence=${ev.id} reviewer=${reviewerId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return sent;
  }
}

