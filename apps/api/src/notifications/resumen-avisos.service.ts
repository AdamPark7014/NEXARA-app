import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';
import { textoResumenAvisos } from './presupuesto-avisos.js';

/** Lo más viejo que todavía se resume: lo de hace más queda en «Agrupados» sin tarjeta nueva. */
const VENTANA_MS = 72 * 60 * 60 * 1000;

/**
 * Dos veces al día, una sola tarjeta por persona con lo que quedó agrupado
 * (Programa Velocidad Core, `presupuesto-avisos.ts`). Varias instancias corren el cron a la vez: gana
 * quien marca las filas, y el `updateMany` condicional hace que las otras no encuentren nada.
 */
@Injectable()
export class ResumenAvisosService {
  private readonly logger = new Logger(ResumenAvisosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 11,17 * * 1-6', { name: 'resumen-avisos', timeZone: WORKDAY_TIMEZONE })
  async correr() {
    await runScheduledJob('avisos:resumen', this.logger, () => this.revisar());
  }

  /** Expuesto para las pruebas. Devuelve cuántas tarjetas salieron. */
  async revisar(ahora = new Date()): Promise<number> {
    const filas = await this.prisma.notification.findMany({
      where: { entrega: 'resumen', createdAt: { gte: new Date(ahora.getTime() - VENTANA_MS) } },
      select: { id: true, userId: true, category: true, companyId: true },
      orderBy: { id: 'asc' },
      take: 5000,
    });
    const porPersona = new Map<number, typeof filas>();
    for (const f of filas) porPersona.set(f.userId, [...(porPersona.get(f.userId) ?? []), f]);

    let tarjetas = 0;
    for (const [userId, suyas] of porPersona) {
      const { count } = await this.prisma.notification.updateMany({
        where: { id: { in: suyas.map((f) => f.id) }, entrega: 'resumen' },
        data: { entrega: 'resumida' },
      });
      if (!count) continue;
      const { title, message } = textoResumenAvisos(suyas.map((f) => f.category));
      await this.notifications.createNotification({
        userId,
        // Sin tipo propio (exigiría migrar el enum): igual que el resumen del CEO; la categoría lo distingue.
        type: 'WORKFLOW_PENDING',
        category: 'resumen-avisos',
        title,
        message,
        icon: 'resumen',
        entityType: 'ResumenAvisos',
        relatedUrl: '/erp/notifications-center?view=agrupados',
        companyId: suyas[0]?.companyId ?? undefined,
        collapseKey: `nx_resumen_avisos_u${userId}`,
        reemplazar: true,
        dedupeSeconds: 0,
      });
      tarjetas += 1;
    }
    if (tarjetas) this.logger.log(`Resumen de avisos: ${tarjetas} tarjeta(s)`);
    return tarjetas;
  }
}
