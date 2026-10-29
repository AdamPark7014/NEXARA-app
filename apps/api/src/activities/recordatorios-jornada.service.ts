import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { appUrls } from '../common/app-urls.js';
import { isNonEmployeeEmail } from '../common/platform-accounts.js';
import { workDateColumn, workDateKey } from '../common/time/workday.js';
import { ACTIVITY_STATUS, statusVariants } from './activity-status.js';
import { limiteDeEntrega } from './semaforo-actividad.js';
import {
  avisoPorVencer,
  avisoSinActividad,
  CADA_POR_VENCER_MIN,
  CADA_SIN_ACTIVIDAD_MIN,
  ejecutoresDeActividad,
  horarioDeRecordatorios,
  minutosAlLimite,
  necesitaActividad,
  tocaAvisoPorVencer,
  yaEntrego,
} from './recordatorios-jornada.js';

/** Lo que todavía corre plazo: sin entregar ni cerrar («Por Validar» ya está cumplida). */
const ABIERTAS = [
  ACTIVITY_STATUS.PENDIENTE,
  ACTIVITY_STATUS.ASIGNADA,
  ACTIVITY_STATUS.EN_PROCESO,
  ACTIVITY_STATUS.RECHAZADA,
].flatMap((s) => statusVariants(s));

/**
 * Cada 5 minutos, solo con la jornada abierta (checó entrada y no ha salido): push a quien no
 * tiene actividad corriendo y, cada 10 min, a quien se le vence una sin entregar. Reglas en
 * `recordatorios-jornada.ts`. El cron no trae empresa en el request: todo filtra por `companyId`.
 */
@Injectable()
export class RecordatoriosJornadaService {
  private readonly logger = new Logger(RecordatoriosJornadaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/5 * * * *', { name: 'recordatorios-jornada' })
  async correr() {
    await runScheduledJob('actividades:recordatorios-jornada', this.logger, () => this.revisar());
  }

  /** Expuesto para las pruebas. Devuelve cuántos avisos de cada tipo se mandaron. */
  async revisar(ahora = new Date()): Promise<{ sinActividad: number; porVencer: number }> {
    const vacio = { sinActividad: 0, porVencer: 0 };
    if (!horarioDeRecordatorios(ahora)) return vacio;
    const hoy = workDateColumn(ahora);

    const dias = await this.prisma.attendanceDay.findMany({
      where: { date: hoy, isOpen: true },
      select: { userId: true, companyId: true, user: { select: { email: true, isActive: true } } },
    });
    const enJornada = new Map<number, number>();
    for (const d of dias) {
      if (d.user?.isActive === false || isNonEmployeeEmail(d.user?.email)) continue;
      enJornada.set(d.userId, d.companyId);
    }
    if (!enJornada.size) return vacio;
    const ids = [...enJornada.keys()];

    const [comidas, relojes, actividades] = await Promise.all([
      this.prisma.lunchBreak.findMany({
        where: { userId: { in: ids }, date: hoy, checkoutTime: null },
        select: { userId: true },
      }),
      this.prisma.activityWorkSession.findMany({
        where: { userId: { in: ids }, endedAt: null },
        select: { userId: true },
      }),
      this.prisma.activity.findMany({
        where: {
          deletedAt: null,
          estatus: { in: ABIERTAS },
          OR: [{ responsableId: { in: ids } }, { assignees: { some: { userId: { in: ids }, retiradoAt: null } } }],
        },
        select: {
          id: true,
          companyId: true,
          anNumber: true,
          titulo: true,
          responsableId: true,
          assignmentCharge: true,
          fechaInicio: true,
          fechaMaxima: true,
          fechaEntregaEsperada: true,
          periodoInicio: true,
          periodoFin: true,
          assignees: {
            where: { retiradoAt: null },
            select: { userId: true, rol: true, asignadoAt: true, finRealAt: true },
          },
          activityEvidences: { select: { userId: true, status: true } },
        },
        take: 1000,
      }),
    ]);
    const enComida = new Set(comidas.map((c) => c.userId));
    const conReloj = new Set(relojes.map((r) => r.userId));

    // Lo abierto de cada quien (para el texto) y los avisos de «se te vence».
    const abiertasDe = new Map<number, number>();
    const porVencer: Array<{ userId: number; companyId: number; a: (typeof actividades)[number]; minutos: number }> = [];
    const diaDeHoy = workDateKey(ahora);
    for (const a of actividades) {
      const limite = limiteDeEntrega(a);
      const minutos = minutosAlLimite(limite, ahora);
      const limiteEsDeHoy = limite != null && workDateKey(limite) === diaDeHoy;
      for (const userId of ejecutoresDeActividad({ ...a, assignees: a.assignees.map((m) => ({ ...m, rol: String(m.rol) })) })) {
        if (!enJornada.has(userId)) continue;
        const entregada = yaEntrego(userId, a);
        if (!entregada) abiertasDe.set(userId, (abiertasDe.get(userId) ?? 0) + 1);
        if (minutos != null && tocaAvisoPorVencer({ minutos, entregada, enJornada: true, limiteEsDeHoy })) {
          porVencer.push({ userId, companyId: a.companyId, a, minutos });
        }
      }
    }

    let sinActividad = 0;
    for (const [userId, companyId] of enJornada) {
      if (!necesitaActividad({ enJornada: true, enComida: enComida.has(userId), relojCorriendo: conReloj.has(userId) })) {
        continue;
      }
      const { title, message } = avisoSinActividad(abiertasDe.get(userId) ?? 0);
      const ok = await this.notifications.createNotification({
        userId,
        type: 'SLA_ALERT',
        category: 'activities',
        title,
        message,
        icon: 'atraso',
        relatedEntityId: userId,
        entityType: 'User',
        relatedUrl: '/erp/pizarra?vista=mias',
        priority: 'high',
        channel: 'ops',
        // La tarjeta del teléfono se reemplaza, no se apila; uno por corrida del cron.
        collapseKey: `nx_sin_actividad_u${userId}`,
        dedupeSeconds: (CADA_SIN_ACTIVIDAD_MIN - 1) * 60,
        companyId,
      });
      if (ok) sinActividad += 1;
    }

    let vence = 0;
    for (const v of porVencer) {
      const { title, message } = avisoPorVencer({ anNumber: v.a.anNumber, titulo: v.a.titulo, minutos: v.minutos });
      const ok = await this.notifications.createNotification({
        userId: v.userId,
        type: 'ACTIVITY_OVERDUE',
        category: 'activities',
        title,
        message,
        icon: 'vencida',
        relatedEntityId: v.a.id,
        entityType: 'Activity',
        relatedUrl: appUrls.erpActividad(v.a.id),
        priority: 'high',
        channel: 'ops',
        collapseKey: `nx_vence_${v.a.id}_u${v.userId}`,
        dedupeSeconds: (CADA_POR_VENCER_MIN - 1) * 60,
        companyId: v.companyId,
      });
      if (ok) vence += 1;
    }

    // Cuenta también los que el dedupe dejó pasar sin repetir (createNotification devuelve el previo).
    if (sinActividad || vence) {
      this.logger.log(`Recordatorios de jornada: ${sinActividad} sin actividad, ${vence} por vencer`);
    }
    return { sinActividad, porVencer: vence };
  }
}
