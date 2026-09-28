import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { WORKDAY_TIMEZONE, workDayStart } from '../common/time/workday.js';
import { PLATFORM_OWNER_EMAIL } from '../common/platform-accounts.js';
import { CeoBriefService } from './ceo-brief.service.js';

/** Categoría del aviso: sirve también para saber si hoy ya se envió el resumen. */
export const CATEGORIA_RESUMEN_CEO = 'resumen-ceo';

/**
 * «Tu día»: cada mañana hábil, a las 8:00 de México, un solo aviso al CEO de cada empresa con lo que
 * espera algo de él (aprobaciones con importe, cobranza vencida, compras atrasadas, cotizaciones por
 * vencer, actividades atrasadas y la pre-nómina cuando cierra la quincena).
 *
 * Si no hay nada pendiente no se manda nada. Una vez por persona y empresa al día, también tras
 * reiniciar el servidor.
 */
@Injectable()
export class CeoBriefCronService {
  private readonly logger = new Logger(CeoBriefCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brief: CeoBriefService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 8 * * 1-5', { name: 'ceo-daily-brief', timeZone: WORKDAY_TIMEZONE })
  async handleDailyBrief() {
    await runScheduledJob('ceo-daily-brief', this.logger, async () => {
      const enviados = await this.enviar();
      if (enviados > 0) this.logger.log(`Resumen del CEO: ${enviados} enviado(s)`);
    });
  }

  /** Expuesto para pruebas: arma y envía los resúmenes; devuelve cuántos salieron. */
  async enviar(now: Date = new Date()): Promise<number> {
    const empresas = await this.prisma.companyProfile.findMany({ where: { isActive: true }, select: { id: true } });
    const desde = workDayStart(now);
    let enviados = 0;

    for (const { id: companyId } of empresas) {
      // El CEO es quien tiene ese rol o el dueño de la plataforma (Christian se reconoce también por correo).
      const destinatarios = await this.prisma.user.findMany({
        where: {
          isActive: true,
          companyMemberships: { some: { companyId } },
          OR: [{ roleKey: 'ceo' }, { email: PLATFORM_OWNER_EMAIL }],
        },
        select: { id: true, roleKey: true },
      });
      if (!destinatarios.length) continue;

      const yaRecibieron = new Set(
        (
          await this.prisma.notification.findMany({
            where: {
              userId: { in: destinatarios.map((d) => d.id) },
              category: CATEGORIA_RESUMEN_CEO,
              companyId,
              createdAt: { gte: desde },
            },
            select: { userId: true },
          })
        ).map((n) => n.userId),
      );

      for (const u of destinatarios) {
        if (yaRecibieron.has(u.id)) continue;
        try {
          const resumen = await this.brief.resumen(companyId, { id: u.id, roleKey: u.roleKey }, now);
          if (resumen.vacio) continue;
          await this.notifications.createNotification({
            userId: u.id,
            // No hay un tipo propio (exigiría migrar el enum): el más cercano es «pendiente de decisión»;
            // la categoría lo distingue.
            type: 'WORKFLOW_PENDING',
            category: CATEGORIA_RESUMEN_CEO,
            title: resumen.titulo,
            message: resumen.mensaje,
            icon: 'resumen',
            entityType: 'CeoBrief',
            relatedUrl: resumen.items[0]?.url ?? '/erp/executive',
            priority: resumen.prioridad === 'alta' ? 'high' : 'normal',
            companyId,
            collapseKey: `nx_resumen_ceo_c${companyId}_u${u.id}`,
            // La idempotencia del día ya se resolvió arriba.
            dedupeSeconds: 0,
          });
          enviados += 1;
        } catch (error) {
          this.logger.warn(
            `Resumen del CEO: no se envió a user=${u.id} empresa=${companyId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
    return enviados;
  }
}
