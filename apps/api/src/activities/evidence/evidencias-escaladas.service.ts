import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runScheduledJob } from '../../common/cron/run-scheduled-job.js';
import { WORKDAY_TIMEZONE } from '../../common/time/workday.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { actividadCerradaParaRevision, esperaRevision, revisionEscalada } from '../../me/revision-evidencias.js';
import { armarEscaladas, textoEscalada } from './evidencias-escaladas.js';

/** Una vez al día, a media mañana y de lunes a viernes. Reglas en `evidencias-escaladas.ts`. */
@Injectable()
export class EvidenciasEscaladasService {
  private readonly logger = new Logger(EvidenciasEscaladasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('30 10 * * 1-5', { name: 'evidencias-escaladas', timeZone: WORKDAY_TIMEZONE })
  async correr() {
    await runScheduledJob('evidencias:escaladas', this.logger, () => this.revisar());
  }

  /** Expuesto para las pruebas. Devuelve cuántas tarjetas salieron. */
  async revisar(ahora = new Date()): Promise<number> {
    const [filas, personas] = await Promise.all([
      this.prisma.activityEvidence.findMany({
        where: {
          status: 'COMPLETED',
          reviewStatus: { notIn: ['APPROVED', 'REJECTED'] },
          activity: { deletedAt: null },
        },
        select: {
          userId: true,
          companyId: true,
          status: true,
          reviewStatus: true,
          completedAt: true,
          correctionSubmittedAt: true,
          activity: { select: { estatus: true } },
        },
        take: 1000,
      }),
      this.prisma.user.findMany({ select: { id: true, managerId: true, nombre: true, isActive: true } }),
    ]);
    const enEspera = filas.filter(
      (f) =>
        revisionEscalada(f.correctionSubmittedAt ?? f.completedAt, ahora) &&
        esperaRevision(f) &&
        !actividadCerradaParaRevision(f.activity.estatus),
    );

    let tarjetas = 0;
    for (const t of armarEscaladas(
      enEspera.map((f) => ({ duenoId: f.userId, companyId: f.companyId })),
      personas,
    )) {
      const { title, message } = textoEscalada(t);
      await this.notifications.createNotification({
        userId: t.userId,
        type: 'WORKFLOW_ESCALATION',
        category: 'evidences',
        title,
        message,
        icon: 'por_revisar',
        relatedEntityId: t.userId,
        entityType: 'EvidenciasEscaladas',
        relatedUrl: '/erp/pizarra?vista=revision',
        collapseKey: `nx_evidencias_escaladas_u${t.userId}`,
        reemplazar: true,
        // Varias instancias corren el cron: con esto solo sale una al día.
        dedupeSeconds: 20 * 60 * 60,
        companyId: t.companyId,
      });
      tarjetas += 1;
    }
    if (tarjetas) this.logger.log(`Evidencias escaladas: ${tarjetas} tarjeta(s)`);
    return tarjetas;
  }
}
