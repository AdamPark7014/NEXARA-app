import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { appUrls } from '../common/app-urls.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { etapaDeSeguimiento, HORAS_BORRADOR, textoBorradores, textoSeguimiento } from './seguimiento-cotizacion.js';

/**
 * Una vez al día le pregunta a quien hizo la cotización lo que el sistema no puede saber solo. Varias
 * instancias corren el cron a la vez: gana quien marca la fila con el `updateMany` condicional.
 */
@Injectable()
export class SeguimientoCotizacionService {
  private readonly logger = new Logger(SeguimientoCotizacionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 10 * * 1-6', { name: 'cotizaciones-seguimiento', timeZone: WORKDAY_TIMEZONE })
  async correr() {
    await runScheduledJob('cotizaciones:seguimiento', this.logger, () => this.revisar());
  }

  /** Expuesto para las pruebas. */
  async revisar(ahora = new Date()): Promise<{ seguimientos: number; borradores: number }> {
    const seguimientos = await this.preguntarRespuesta(ahora);
    const borradores = await this.preguntarSiLaMando(ahora);
    if (seguimientos || borradores) {
      this.logger.log(`Seguimiento de cotizaciones: ${seguimientos} por respuesta, ${borradores} por borrador`);
    }
    return { seguimientos, borradores };
  }

  private async preguntarRespuesta(ahora: Date): Promise<number> {
    const enviadas = await this.prisma.cotizacion.findMany({
      where: { status: 'SENT', deletedAt: null, sentAt: { not: null }, createdById: { not: null } },
      select: {
        id: true,
        quoteNumber: true,
        clientCompany: true,
        clientName: true,
        sentAt: true,
        seguimientoEtapa: true,
        createdById: true,
        companyId: true,
      },
      take: 500,
    });
    let enviados = 0;
    for (const c of enviadas) {
      const etapa = etapaDeSeguimiento({ sentAt: c.sentAt as Date, etapaActual: c.seguimientoEtapa, ahora });
      if (etapa == null) continue;
      const { count } = await this.prisma.cotizacion.updateMany({
        where: { id: c.id, seguimientoEtapa: c.seguimientoEtapa },
        data: { seguimientoEtapa: etapa },
      });
      if (!count) continue;
      const { title, message } = textoSeguimiento({ ...c, sentAt: c.sentAt as Date, ahora });
      await this.notifications.createNotification({
        userId: c.createdById as number,
        type: 'QUOTE_SENT',
        category: 'quotes',
        title,
        message,
        entityType: 'Cotizacion',
        relatedEntityId: c.id,
        relatedUrl: appUrls.erpCotizaciones(c.id),
        entrega: 'siempre',
        dedupeSeconds: 0,
        companyId: c.companyId,
      });
      enviados += 1;
    }
    return enviados;
  }

  /** Una sola tarjeta por autor, y cada cotización se pregunta una vez. */
  private async preguntarSiLaMando(ahora: Date): Promise<number> {
    const limite = new Date(ahora.getTime() - HORAS_BORRADOR * 60 * 60 * 1000);
    const borradores = await this.prisma.cotizacion.findMany({
      where: {
        status: 'DRAFT',
        deletedAt: null,
        borradorAvisadoAt: null,
        createdAt: { lte: limite },
        createdById: { not: null },
        OR: [{ validUntil: null }, { validUntil: { gte: ahora } }],
      },
      select: { id: true, createdById: true, companyId: true },
      take: 500,
    });
    const porAutor = new Map<number, typeof borradores>();
    for (const b of borradores) {
      const autor = b.createdById as number;
      porAutor.set(autor, [...(porAutor.get(autor) ?? []), b]);
    }
    let tarjetas = 0;
    for (const [autor, suyas] of porAutor) {
      const { count } = await this.prisma.cotizacion.updateMany({
        where: { id: { in: suyas.map((b) => b.id) }, borradorAvisadoAt: null },
        data: { borradorAvisadoAt: ahora },
      });
      if (!count) continue;
      const { title, message } = textoBorradores(count);
      await this.notifications.createNotification({
        userId: autor,
        type: 'QUOTE_SENT',
        category: 'quotes',
        title,
        message,
        entityType: 'CotizacionBorradores',
        relatedUrl: count === 1 ? appUrls.erpCotizaciones(suyas[0].id) : '/erp/cotizaciones',
        entrega: 'siempre',
        dedupeSeconds: 0,
        companyId: suyas[0].companyId,
      });
      tarjetas += 1;
    }
    return tarjetas;
  }
}
