import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { workDateKey } from '../common/time/workday.js';
import { ACTIVITY_STATUS, isFinishedStatus, statusVariants } from './activity-status.js';
import {
  canCancelActivity,
  chainExecutorIds,
  cleanMotivo,
  isCancelledStatus,
  loadActivityChain,
  MOTIVO_MINIMO,
  type ChainActor,
  type ChainMember,
} from './activity-superiors.js';
import {
  admiteRegistroManual,
  CAUSA_CIERRE_JORNADA,
  CAUSAS_INCUMPLIMIENTO,
  cierreDeJornada,
  decidirCierreDeJornada,
  esCausaValida,
  esNoCumplida,
  estatusAlReprogramar,
  etiquetaCausa,
  horaDeCierre,
  type EjecutorEntrega,
  type OrigenIncumplimiento,
} from './incumplimiento.js';
import { ActivityTeamService } from './activity-team.service.js';
import { leerIncumplimientos, type IncumplimientoDto } from './incumplimiento-lectura.js';

const LOTE = 500;

const REGISTRO_FORBIDDEN =
  'Solo los superiores de quien ejecuta la actividad (su jefe, el responsable o quien la asignó, el encargado que la repartió o Christian) pueden registrarla como no cumplida o reprogramarla';

/** Lo que el cierre de jornada lee de cada actividad. */
const SELECT_CIERRE = {
  id: true,
  companyId: true,
  titulo: true,
  estatus: true,
  responsableId: true,
  assignmentCharge: true,
  fechaAsignacion: true,
  fechaInicio: true,
  fechaMaxima: true,
  fechaEntregaEsperada: true,
  periodoInicio: true,
  periodoFin: true,
  cierreAvisadoAt: true,
  assignees: {
    where: { retiradoAt: null },
    select: { userId: true, rol: true, asignadoAt: true, inicioRealAt: true, finRealAt: true },
  },
  activityEvidences: { select: { userId: true, status: true, completedAt: true, entryPhotoUploadedAt: true } },
} as const;

type FilaCierre = {
  id: number;
  companyId: number;
  titulo: string;
  estatus: string;
  responsableId: number;
  assignmentCharge: string | null;
  fechaAsignacion: Date | null;
  fechaInicio: Date | null;
  fechaMaxima: Date | null;
  fechaEntregaEsperada: Date | null;
  periodoInicio: Date | null;
  periodoFin: Date | null;
  cierreAvisadoAt: Date | null;
  assignees: Array<{ userId: number; rol: string; asignadoAt: Date; inicioRealAt: Date | null; finRealAt: Date | null }>;
  activityEvidences: Array<{
    userId: number;
    status: string | null;
    completedAt: Date | null;
    entryPhotoUploadedAt: Date | null;
  }>;
};

/**
 * Actividades no cumplidas: cierre de jornada automático, registro de un superior y reprogramación.
 * Las reglas viven en `incumplimiento.ts`; aquí solo se lee la base, se escribe y se avisa.
 *
 * El cron no trae empresa en el request: cada escritura filtra por `companyId` y por el estatus
 * que se leyó, así una actividad que alguien entregó o canceló entre la lectura y la escritura
 * no se toca.
 */
@Injectable()
export class ActivityNonComplianceService {
  private readonly logger = new Logger(ActivityNonComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly team: ActivityTeamService,
    @Optional() private readonly domainEvents?: DomainEventBusService,
  ) {}

  @Cron('*/5 * * * *', { name: 'actividades-cierre-jornada' })
  async cierreDeJornada() {
    await runScheduledJob('actividades:cierre-jornada', this.logger, () => this.revisarCierres());
  }

  /** Expuesto para las pruebas. */
  async revisarCierres(ahora = new Date()): Promise<{ cerradas: number; avisadas: number }> {
    // Lo que puede vencer de aquí a mañana; lo demás todavía no tiene nada que decidir.
    const horizonte = new Date(ahora.getTime() + 36 * 3_600_000);
    const filas = (await this.prisma.activity.findMany({
      where: {
        deletedAt: null,
        estatus: {
          in: [
            ACTIVITY_STATUS.PENDIENTE,
            ACTIVITY_STATUS.ASIGNADA,
            ACTIVITY_STATUS.EN_PROCESO,
            ACTIVITY_STATUS.RECHAZADA,
          ].flatMap((s) => statusVariants(s)),
        },
        OR: [
          { periodoFin: { lte: horizonte } },
          { periodoFin: null, fechaMaxima: { lte: horizonte } },
          { periodoFin: null, fechaEntregaEsperada: { lte: horizonte } },
        ],
      },
      select: SELECT_CIERRE,
      orderBy: { id: 'asc' },
      take: LOTE,
    })) as FilaCierre[];
    if (!filas.length) return { cerradas: 0, avisadas: 0 };

    const salidas = await this.horasDeSalida(filas.flatMap((f) => this.ejecutoresDe(f)));
    let cerradas = 0;
    let avisadas = 0;
    for (const fila of filas) {
      const ejecutores = this.ejecutoresDe(fila);
      const cierre = cierreDeJornada({ ...fila, horasSalida: ejecutores.map((id) => salidas.get(id) ?? null) });
      const decision = decidirCierreDeJornada({
        estatus: fila.estatus,
        cierre,
        ahora,
        avisadoAt: fila.cierreAvisadoAt,
        ejecutores: this.entregas(fila, ejecutores),
      });
      try {
        if (decision.accion === 'cerrar' && cierre) {
          const ok = await this.cerrar(fila, {
            origen: 'CIERRE_JORNADA',
            causa: CAUSA_CIERRE_JORNADA,
            observaciones: null,
            limite: cierre,
            pendientesIds: decision.pendientes.length ? decision.pendientes : ejecutores,
            actorId: null,
            ahora,
          });
          if (ok) cerradas += 1;
        } else if (decision.accion === 'avisar' && cierre) {
          const marcada = await this.prisma.activity.updateMany({
            where: { id: fila.id, companyId: fila.companyId, cierreAvisadoAt: null },
            data: { cierreAvisadoAt: ahora },
          });
          if (marcada.count) {
            avisadas += 1;
            void this.notificationHierarchy
              .notifyActivityClosingSoon({ activityId: fila.id, pendientesIds: decision.pendientes, cierre })
              .catch(() => undefined);
          }
        }
      } catch (error) {
        this.logger.warn(`Cierre de jornada ${fila.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (cerradas || avisadas) this.logger.log(`Cierre de jornada: ${cerradas} no cumplida(s), ${avisadas} aviso(s)`);
    return { cerradas, avisadas };
  }

  /**
   * Un superior la registra como no cumplida, con causa y observaciones. Misma regla de permiso
   * que cancelar: superior de todos los que la ejecutan.
   */
  async registrar(
    activityId: number,
    body: { causa?: unknown; observaciones?: unknown },
    actor: ChainActor | undefined,
    companyId: number | null | undefined,
  ) {
    if (!actor?.id) throw new ForbiddenException('Usuario no autenticado');
    const tenantId = requireCompanyId(companyId);
    const chain = await loadActivityChain(this.prisma, activityId, tenantId);
    if (!canCancelActivity(actor, chain)) throw new ForbiddenException(REGISTRO_FORBIDDEN);
    if (esNoCumplida(chain.estatus)) throw new BadRequestException('La actividad ya está registrada como no cumplida');
    if (isCancelledStatus(chain.estatus)) throw new BadRequestException('La actividad está cancelada');
    if (isFinishedStatus(chain.estatus)) throw new BadRequestException('La actividad ya está finalizada');
    if (!admiteRegistroManual(chain.estatus)) {
      throw new BadRequestException(`No se puede registrar como no cumplida una actividad en estatus «${chain.estatus}»`);
    }
    if (!esCausaValida(body?.causa)) throw new BadRequestException('Elige la causa del incumplimiento');
    const observaciones = cleanMotivo(body?.observaciones);
    if (!observaciones) {
      throw new BadRequestException(`Escribe las observaciones (mínimo ${MOTIVO_MINIMO} caracteres)`);
    }

    const fila = await this.leerFila(activityId, tenantId);
    const ejecutores = this.ejecutoresDe(fila);
    const salidas = await this.horasDeSalida(ejecutores);
    const entregas = this.entregas(fila, ejecutores);
    const sinEntregar = entregas.filter((e) => !e.entregadaAt).map((e) => e.userId);
    const ok = await this.cerrar(fila, {
      origen: 'MANUAL',
      causa: body.causa as string,
      observaciones,
      limite: cierreDeJornada({ ...fila, horasSalida: ejecutores.map((id) => salidas.get(id) ?? null) }),
      // Si todos entregaron (p. ej. «no cumple lo solicitado»), la falla es de todo el equipo.
      pendientesIds: sinEntregar.length ? sinEntregar : ejecutores,
      actorId: actor.id,
      ahora: new Date(),
    });
    if (!ok) throw new BadRequestException('La actividad cambió mientras la registrabas; vuelve a intentarlo');
    return this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(tenantId) },
      include: { responsable: { select: { id: true, nombre: true } } },
    });
  }

  /**
   * Reabre una actividad no cumplida con fecha nueva. El incumplimiento queda registrado (los KPI
   * lo siguen contando); la agenda cambia con el mismo registro y aviso que «Cambiar fecha».
   */
  async reprogramar(
    activityId: number,
    body: { fecha?: unknown; motivo?: unknown },
    actor: ChainActor | undefined,
    companyId: number | null | undefined,
  ) {
    if (!actor?.id) throw new ForbiddenException('Usuario no autenticado');
    const tenantId = requireCompanyId(companyId);
    const chain = await loadActivityChain(this.prisma, activityId, tenantId);
    if (!canCancelActivity(actor, chain)) throw new ForbiddenException(REGISTRO_FORBIDDEN);
    if (!esNoCumplida(chain.estatus)) {
      throw new BadRequestException('Solo se reprograma aquí una actividad no cumplida; para mover una abierta usa «Cambiar fecha»');
    }
    const nueva = typeof body?.fecha === 'string' || body?.fecha instanceof Date ? new Date(body.fecha as string) : null;
    if (!nueva || Number.isNaN(nueva.getTime())) throw new BadRequestException('Indica la nueva fecha y hora');
    const motivo = cleanMotivo(body?.motivo);
    if (!motivo) throw new BadRequestException(`Escribe el motivo de la reprogramación (mínimo ${MOTIVO_MINIMO} caracteres)`);

    const ahora = new Date();
    if (workDateKey(nueva) < workDateKey(ahora)) throw new BadRequestException('La nueva fecha no puede ser de un día que ya pasó');
    const fila = await this.leerFila(activityId, tenantId);
    const ejecutores = this.ejecutoresDe(fila);
    const salidas = await this.horasDeSalida(ejecutores);
    const nuevoCierre = cierreDeJornada({
      fechaInicio: nueva,
      fechaMaxima: nueva,
      fechaEntregaEsperada: nueva,
      horasSalida: ejecutores.map((id) => salidas.get(id) ?? null),
    });
    if (!fila.periodoFin && nuevoCierre && nuevoCierre.getTime() <= ahora.getTime()) {
      throw new BadRequestException(
        `Esa fecha ya pasó el cierre de su jornada (${horaDeCierre(nuevoCierre)}): elige una fecha u hora posterior`,
      );
    }

    await this.team.reschedule(activityId, nueva, motivo, tenantId, actor.id);
    const arrancada =
      fila.assignees.some((a) => a.inicioRealAt) || fila.activityEvidences.some((e) => e.entryPhotoUploadedAt);
    const ultimo = await this.prisma.activityNonCompliance.findFirst({
      where: { activityId, companyId: tenantId },
      orderBy: { registradoAt: 'desc' },
      select: { id: true, estatusPrevio: true },
    });
    const estatus = estatusAlReprogramar(ultimo?.estatusPrevio, arrancada);
    await this.prisma.$transaction([
      this.prisma.activity.updateMany({
        where: { id: activityId, companyId: tenantId, estatus: { in: statusVariants(ACTIVITY_STATUS.NO_CUMPLIDA) } },
        data: { estatus, cierreAvisadoAt: null },
      }),
      ...(ultimo
        ? [
            this.prisma.activityNonCompliance.updateMany({
              where: { id: ultimo.id, companyId: tenantId },
              data: {
                reprogramadaAt: ahora,
                reprogramadaPorId: actor.id,
                reprogramadaPara: nueva,
                motivoReprogramacion: motivo,
              },
            }),
          ]
        : []),
    ]);
    this.publicar(activityId, tenantId, actor.id, { estatus, prevEstatus: chain.estatus, reprogramadaPara: nueva.toISOString() });
    return this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(tenantId) },
      include: { responsable: { select: { id: true, nombre: true } } },
    });
  }

  /** El último incumplimiento de la actividad (el vigente si está «No cumplida»), o null. */
  async ultimo(activityId: number, companyId: number | null | undefined): Promise<IncumplimientoDto | null> {
    const filas = await this.historial(activityId, companyId, 1);
    return filas[0] ?? null;
  }

  /** Incumplimientos de la actividad, el más reciente primero. */
  historial(activityId: number, companyId: number | null | undefined, take = 20): Promise<IncumplimientoDto[]> {
    return leerIncumplimientos(this.prisma, activityId, companyId, take);
  }

  /** Catálogo de causas para los formularios, en orden. */
  causas() {
    return CAUSAS_INCUMPLIMIENTO.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta }));
  }

  // ---------------------------------------------------------------------------

  /**
   * Pasa la actividad a «No cumplida» (solo si sigue en el estatus que se leyó), deja el registro,
   * cierra los relojes que sigan corriendo y avisa. Devuelve false si alguien la movió antes.
   */
  private async cerrar(
    fila: FilaCierre,
    p: {
      origen: OrigenIncumplimiento;
      causa: string;
      observaciones: string | null;
      limite: Date | null;
      pendientesIds: number[];
      actorId: number | null;
      ahora: Date;
    },
  ): Promise<boolean> {
    const movida = await this.prisma.$transaction(async (tx) => {
      const r = await tx.activity.updateMany({
        where: { id: fila.id, companyId: fila.companyId, estatus: fila.estatus, deletedAt: null },
        data: { estatus: ACTIVITY_STATUS.NO_CUMPLIDA },
      });
      if (!r.count) return false;
      await tx.activityNonCompliance.create({
        data: {
          activityId: fila.id,
          companyId: fila.companyId,
          origen: p.origen,
          causa: p.causa,
          observaciones: p.observaciones,
          limite: p.limite,
          estatusPrevio: fila.estatus,
          pendientesIds: [...new Set(p.pendientesIds)],
          registradoPorId: p.actorId,
          registradoAt: p.ahora,
        },
      });
      return true;
    });
    if (!movida) return false;
    // Nadie sigue «trabajando» en una actividad cerrada: su reloj se corta ahora.
    await this.prisma.activityWorkSession
      .updateMany({
        where: { activityId: fila.id, companyId: fila.companyId, endedAt: null },
        data: { endedAt: p.ahora, endReason: 'CORTE_DIA' },
      })
      .catch((error: unknown) => this.logger.warn(`Sesiones de ${fila.id}: ${String(error)}`));

    void this.notificationHierarchy
      .notifyActivityNonCompliance({
        activityId: fila.id,
        actorId: p.actorId,
        pendientesIds: p.pendientesIds,
        causa: etiquetaCausa(p.causa),
        observaciones: p.observaciones,
        cierre: p.limite,
      })
      .catch(() => undefined);
    this.publicar(fila.id, fila.companyId, p.actorId, {
      estatus: ACTIVITY_STATUS.NO_CUMPLIDA,
      prevEstatus: fila.estatus,
      origen: p.origen,
      causa: p.causa,
    });
    return true;
  }

  private publicar(activityId: number, companyId: number, userId: number | null, payload: Record<string, unknown>) {
    try {
      this.domainEvents?.publishEntityLifecycle('updated', {
        entityType: 'ACTIVITY',
        entityId: activityId,
        companyId,
        userId: userId ?? undefined,
        payload,
      } as any);
    } catch {
      /* el evento es informativo */
    }
  }

  private async leerFila(activityId: number, companyId: number): Promise<FilaCierre> {
    const fila = (await this.prisma.activity.findFirst({
      where: { id: activityId, deletedAt: null, ...companyWhere(companyId) },
      select: SELECT_CIERRE,
    })) as FilaCierre | null;
    if (!fila) throw new BadRequestException('Actividad no encontrada');
    return fila;
  }

  /** Quienes la ejecutan (misma regla que las evidencias); si nadie, el responsable. */
  private ejecutoresDe(fila: FilaCierre): number[] {
    const members: ChainMember[] = fila.assignees.map((a) => ({
      userId: a.userId,
      rol: String(a.rol),
      asignadoAt: new Date(a.asignadoAt),
    }));
    const ids = chainExecutorIds({
      responsableId: fila.responsableId,
      assignmentCharge: fila.assignmentCharge,
      members,
    });
    return ids.length ? ids : [fila.responsableId];
  }

  /** Cuándo entregó cada ejecutor: su fin real o su evidencia completa. */
  private entregas(fila: FilaCierre, ejecutores: number[]): EjecutorEntrega[] {
    return ejecutores.map((userId) => {
      const asig = fila.assignees.find((a) => a.userId === userId);
      const ev = fila.activityEvidences.find((e) => e.userId === userId);
      const entregadaAt = asig?.finRealAt ?? (ev?.status === 'COMPLETED' ? ev.completedAt : null) ?? null;
      return { userId, entregadaAt };
    });
  }

  /** `HH:MM` de salida de cada persona con horario propio. */
  private async horasDeSalida(userIds: number[]): Promise<Map<number, string | null>> {
    const ids = [...new Set(userIds)].filter((id) => id > 0);
    if (!ids.length) return new Map();
    try {
      const filas = await this.prisma.workSchedule.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, horaSalida: true },
      });
      return new Map(filas.map((f) => [f.userId, f.horaSalida]));
    } catch {
      return new Map();
    }
  }
}
