import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { esCerrada, estaExcedida, minutosPlan, minutosReales } from './actividad-tiempos.js';
import { esMultiDia, periodoDeActividad } from './actividad-periodo.js';

/**
 * Aviso de tiempo excedido (contrato del 18-09, sección B).
 *
 * Cada 15 minutos: quien está en una actividad con tiempo estimado y ya lleva más
 * de lo planeado recibe un aviso —una sola vez, marcado en `alertaExcesoAt`— junto
 * con sus superiores. No bloquea ni cierra nada: es información para reaccionar.
 */
@Injectable()
export class ActivityTimeAlertsService {
  private readonly logger = new Logger(ActivityTimeAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  @Cron('*/15 * * * *')
  async avisarExcesosDeTiempo() {
    await runScheduledJob('actividades:tiempo-excedido', this.logger, () => this.escanear());
  }

  private async escanear(ahora = new Date()) {
    const enCurso = await this.prisma.activityAssignee.findMany({
      where: {
        retiradoAt: null,
        inicioRealAt: { not: null },
        finRealAt: null,
        horasPlan: { not: null },
        alertaExcesoAt: null,
        activity: { deletedAt: null },
      },
      select: {
        id: true,
        userId: true,
        activityId: true,
        horasPlan: true,
        inicioRealAt: true,
        activity: { select: { estatus: true, periodoInicio: true, periodoFin: true } },
      },
      take: 500,
    });

    for (const fila of enCurso) {
      if (esCerrada(fila.activity?.estatus)) continue;
      // Actividad de varios días: el tiempo estimado es de una jornada y el reloj corre
      // de corrido, así que «excedida» no significa nada. Lo tarde lo dice el fin del periodo.
      if (esMultiDia(periodoDeActividad(fila.activity))) continue;
      const plan = minutosPlan(fila.horasPlan);
      const reales = minutosReales(fila.inicioRealAt, null, ahora);
      if (!estaExcedida(plan, reales)) continue;

      // Marcar primero: si el aviso falla, no se repite cada 15 minutos.
      await this.prisma.activityAssignee.update({
        where: { id: fila.id },
        data: { alertaExcesoAt: ahora },
      });
      await this.notificationHierarchy.notifyActivityOvertime({
        activityId: fila.activityId,
        userId: fila.userId,
        minutosPlan: plan as number,
        minutosReales: reales as number,
      });
    }
  }
}
