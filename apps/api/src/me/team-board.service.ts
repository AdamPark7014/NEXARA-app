import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { evidenceProgressPct } from '../activities/evidence/evidence-flow.helpers.js';
import {
  parseWorkDate,
  workDateColumn,
  workDateKey,
  workDayBounds,
  workDayEnd,
} from '../common/time/workday.js';
import { isNonEmployeeEmail } from '../common/platform-accounts.js';
import {
  limiteDeActividad,
  periodoDeActividad,
  periodoDto,
  type PeriodoDto,
} from '../activities/actividad-periodo.js';
import { esDeTodaLaEmpresa, extrasDeTablero, subarbolIds, tiposVisibles } from './equipo-alcance.js';
import {
  calculaActividad,
  enRango,
  kpisDePersona,
  minutosAsistidos,
  minutosPlanDeHoras,
  tiemposReales,
  type ActividadCalculada,
  type Comida,
  type Jornada,
  type KpisPersona,
  type Prioridad,
  type Semaforo,
} from './pizarra-kpi.js';

export type BoardActivityBucket = 'daily' | 'projects' | 'services';
/**
 * activo/atrasado: tiene algo abierto (atrasado = pasó la fecha máxima).
 * libre: hoy terminó su actividad y no tiene otra abierta. sin_actividad: hoy no tuvo nada.
 * inactivo: ya no se asigna (clientes viejos).
 */
export type BoardUserStatus = 'activo' | 'inactivo' | 'atrasado' | 'libre' | 'sin_actividad';

/** Rango de la pizarra, ya resuelto a instantes de la jornada mexicana. */
export type BoardRange = { desde: Date; hasta: Date };

export type BoardAceptacion = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';

export type TeamBoardActivity = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  fechaMaxima: Date | null;
  bucket: BoardActivityBucket;
  /** Actividad de varios días: «Día 3 de 10 · termina vie 25 sep». */
  periodo: PeriodoDto | null;
};

export type TeamBoardOpenActivity = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  evidenceStatus: string;
  progressPct: number;
  coreKind: string | null;
  assignmentCharge: string | null;
  fechaFinalizacion: Date | null;
  indicaciones?: string | null;
  /** Emails del equipo activo: dice si un despacho ya se repartió. */
  teamEmails: string[];
  /** En despacho esta persona (LEAD) solo reparte: no es su trabajo en campo. */
  reparte: boolean;
  /** Día/hora programada (reprogramable por quien reparte). */
  fechaInicio: Date | null;
  /** Contrato C: semáforo y tiempos de cada tarjeta. */
  prioridad: Prioridad;
  semaforo: Semaforo;
  minutosPlan: number | null;
  minutosReales: number | null;
  excedida: boolean;
  /** Hora real de arranque (foto de entrada o `inicioRealAt`), no la programada. */
  inicioRealAt: Date | null;
  finRealAt: Date | null;
  asignadoPor: { id: number; nombre: string } | null;
  /** Sección B; sin sus columnas todo sale PENDIENTE. */
  aceptacion: BoardAceptacion;
  /** Actividad de varios días: sigue en la pizarra cada día hasta su fin. */
  periodo: PeriodoDto | null;
};

export type TeamBoardUser = {
  id: number;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  puesto: string | null;
  status: BoardUserStatus;
  currentActivity: TeamBoardActivity | null;
  openActivities: TeamBoardOpenActivity[];
  clockInAt: Date | null;
  workedMinutes: number | null;
  activityStartedAt: Date | null;
  activityElapsedMinutes: number | null;
  /** Atrasado: minutos pasados de la fecha máxima de lo que está haciendo. */
  currentLateMinutes: number | null;
  /** Libre: desde cuándo no tiene nada abierto. */
  idleSinceAt: Date | null;
  /** Libre: última actividad que terminó hoy y con cuánto atraso (null = sin fecha máxima). */
  lastFinished: {
    id: number;
    anNumber: string;
    titulo: string;
    finishedAt: Date;
    lateMinutes: number | null;
  } | null;
  /** Actividades suyas entregadas que nadie ha aprobado. */
  enEsperaAprobacion: number;
  /** Actividades con evidencia devuelta que está corrigiendo. */
  enCorreccion: number;
  /** Contrato C: cómo le fue en el rango consultado. */
  kpis: KpisPersona;
};

export type TeamBoardResponse = {
  scope: 'company' | 'subtree';
  /** Rango consultado, en `AAAA-MM-DD` (por omisión, hoy). */
  desde: string;
  hasta: string;
  users: TeamBoardUser[];
};

export type TeamBoardHistoryItem = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  coreKind: string | null;
  /** Subtipo de tarea (Levantamiento, Junta…) o texto libre de «Otro». */
  ticketTypeCustom: string | null;
  assignmentCharge: string | null;
  fechaAsignacion: Date;
  fechaFinalizacion: Date | null;
  /** La sacaron del equipo: sigue en su historial, no en sus KPI. */
  retirado: boolean;
  retiradoAt: Date | null;
  prioridad: Prioridad;
  semaforo: Semaforo;
  minutosPlan: number | null;
  minutosReales: number | null;
  evidence: {
    status: string;
    progressPct: number;
    entryPhotoUrl: string | null;
    evidencePhotos: string[];
    exitPhotoUrl: string | null;
    serviceSheetPdfUrl: string | null;
    serviceSheetData: unknown;
  } | null;
};

/** Contrato C: lo que el que mira repartió a su gente en el rango. */
export type AsignadaPorMiItem = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  coreKind: string | null;
  assignmentCharge: string | null;
  fechaAsignacion: Date;
  fechaMaxima: Date | null;
  fechaFinalizacion: Date | null;
  persona: { id: number; nombre: string; avatarUrl: string | null; puesto: string | null };
  prioridad: Prioridad;
  semaforo: Semaforo;
  minutosPlan: number | null;
  minutosReales: number | null;
  excedida: boolean;
  terminada: boolean;
  retirado: boolean;
  aceptacion: BoardAceptacion;
  motivoRechazo: string | null;
  periodo: PeriodoDto | null;
};

export type AsignadasPorMiResponse = {
  desde: string;
  hasta: string;
  items: AsignadaPorMiItem[];
};

type Viewer = {
  id: number;
  roleKey?: string | null;
  email?: string | null;
  isSuperAdmin?: boolean;
};

type ScopedUser = {
  id: number;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  puesto: string | null;
  managerId: number | null;
};

/**
 * Columnas de la sección B (`aceptadaAt`, `inicioRealAt`…): las añade la otra migración.
 * Se leen a mano para que la pizarra funcione igual antes y después de que aterrice.
 */
function fechaOpcional(fila: unknown, campo: string): Date | null {
  const v = (fila as Record<string, unknown> | null)?.[campo];
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function textoOpcional(fila: unknown, campo: string): string | null {
  const v = (fila as Record<string, unknown> | null)?.[campo];
  return typeof v === 'string' && v.trim() ? v : null;
}

/** `Decimal` de Prisma → número normal. */
function numero(valor: unknown): number | null {
  if (valor == null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function aceptacionDe(fila: unknown): BoardAceptacion {
  if (fechaOpcional(fila, 'rechazadaAt')) return 'RECHAZADA';
  if (fechaOpcional(fila, 'aceptadaAt')) return 'ACEPTADA';
  return 'PENDIENTE';
}

@Injectable()
export class TeamBoardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `desde`/`hasta` en `AAAA-MM-DD`; por omisión, hoy. Se resuelven en la zona de la
   * empresa: el contenedor corre en UTC y «hoy» cambiaba a las 18:00.
   */
  resolveRange(desde?: string | null, hasta?: string | null, now = new Date()): BoardRange {
    const { start, end } = workDayBounds(now);
    const valido = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
    const d = valido(desde);
    const h = valido(hasta);
    if (!d && !h) return { desde: start, hasta: end };
    const inicio = d ? parseWorkDate(d) : start;
    const fin = h ? workDayEnd(parseWorkDate(h)) : workDayEnd(inicio);
    return fin.getTime() < inicio.getTime()
      ? { desde: fin, hasta: workDayEnd(fin) }
      : { desde: inicio, hasta: fin };
  }

  async getBoard(
    viewer: Viewer,
    companyId: number | null,
    rango?: BoardRange,
  ): Promise<TeamBoardResponse> {
    const { companyWide, scoped, now } = await this.resolveScope(viewer, companyId);
    const rangoFinal = rango ?? this.resolveRange(null, null, now);
    const userIds = scoped.map((u) => u.id);
    const base = {
      scope: (companyWide ? 'company' : 'subtree') as 'company' | 'subtree',
      desde: workDateKey(rangoFinal.desde),
      hasta: workDateKey(rangoFinal.hasta),
    };
    if (userIds.length === 0) return { ...base, users: [] };
    const users = await this.buildCards(
      scoped,
      userIds,
      companyId,
      now,
      tiposVisibles(viewer),
      rangoFinal,
    );
    return { ...base, users };
  }

  async getBoardUser(
    viewer: Viewer,
    companyId: number | null,
    userId: number,
    rango?: BoardRange,
  ): Promise<TeamBoardUser> {
    const { scoped, now } = await this.resolveScope(viewer, companyId);
    const target = scoped.find((u) => u.id === userId);
    if (!target) throw new NotFoundException('Usuario fuera de tu alcance');
    const [card] = await this.buildCards(
      [target],
      [userId],
      companyId,
      now,
      tiposVisibles(viewer),
      rango ?? this.resolveRange(null, null, now),
    );
    return card;
  }

  /**
   * Historial de actividades del usuario (assignee o responsable), con evidencia propia.
   * Incluye aquellas de las que lo retiraron: si no, desaparecía media semana de trabajo.
   */
  async getUserHistory(
    viewer: Viewer,
    companyId: number | null,
    userId: number,
    take = 40,
  ): Promise<TeamBoardHistoryItem[]> {
    const { scoped, now } = await this.resolveScope(viewer, companyId);
    if (!scoped.some((u) => u.id === userId)) {
      throw new NotFoundException('Usuario fuera de tu alcance');
    }
    const assignees = await this.prisma.activityAssignee.findMany({
      where: {
        userId,
        ...(companyId != null ? { companyId } : {}),
      },
    });
    const porActividad = new Map<number, (typeof assignees)[number]>();
    for (const a of assignees) porActividad.set(a.activityId, a);
    const ids = new Set(assignees.map((a) => a.activityId));
    const asLead = await this.prisma.activity.findMany({
      where: {
        responsableId: userId,
        deletedAt: null,
        ...(companyId != null ? { companyId } : {}),
      },
      select: { id: true },
      take: 80,
    });
    for (const a of asLead) ids.add(a.id);

    const tipos = tiposVisibles(viewer);
    const activities = await this.prisma.activity.findMany({
      where: { id: { in: [...ids] }, deletedAt: null, ...(tipos ? { coreKind: { in: tipos } } : {}) },
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        estatus: true,
        prioridad: true,
        coreKind: true,
        ticketTypeCustom: true,
        assignmentCharge: true,
        fechaAsignacion: true,
        fechaMaxima: true,
        fechaFinalizacion: true,
        periodoInicio: true,
        periodoFin: true,
        activityEvidences: {
          where: { userId },
          select: {
            status: true,
            entryPhotoUrl: true,
            entryPhotoUploadedAt: true,
            evidencePhotos: true,
            exitPhotoUrl: true,
            exitPhotoUploadedAt: true,
            completedAt: true,
            serviceSheetPdfUrl: true,
            serviceSheetData: true,
          },
          take: 1,
        },
      },
      orderBy: { fechaAsignacion: 'desc' },
      take: Math.min(100, Math.max(1, take)),
    });

    return activities.map((a) => {
      const ev = a.activityEvidences[0] ?? null;
      const fila = porActividad.get(a.id) ?? null;
      const cerrada = /finalizada|completada|cancelada|aprobada/i.test(a.estatus || '');
      const tiempos = tiemposReales({
        inicioRealAt: fechaOpcional(fila, 'inicioRealAt'),
        finRealAt: fechaOpcional(fila, 'finRealAt'),
        entryPhotoUploadedAt: ev?.entryPhotoUploadedAt ?? null,
        exitPhotoUploadedAt: ev?.exitPhotoUploadedAt ?? null,
        evidenciaCompletedAt: ev?.completedAt ?? null,
        fechaFinalizacion: a.fechaFinalizacion,
        cerrada,
      });
      const calc = calculaActividad(
        {
          prioridad: a.prioridad,
          estatus: a.estatus,
          fechaMaxima: a.fechaMaxima,
          terminada: cerrada || ev?.status === 'COMPLETED',
          cancelada: /cancel/i.test(a.estatus || ''),
          rechazadaAt: fechaOpcional(fila, 'rechazadaAt'),
          retirado: fila?.retiradoAt != null,
          minutosPlan: minutosPlanDeHoras(numero(fila?.horasPlan)),
          inicio: tiempos.inicio,
          fin: tiempos.fin,
          periodo: periodoDeActividad(a),
        },
        now,
      );
      return {
        id: a.id,
        anNumber: a.anNumber,
        titulo: a.titulo,
        estatus: a.estatus,
        coreKind: a.coreKind,
        ticketTypeCustom: a.ticketTypeCustom,
        assignmentCharge: a.assignmentCharge,
        fechaAsignacion: a.fechaAsignacion,
        fechaFinalizacion: a.fechaFinalizacion,
        retirado: fila?.retiradoAt != null,
        retiradoAt: fila?.retiradoAt ?? null,
        prioridad: calc.prioridad,
        semaforo: calc.semaforo,
        minutosPlan: calc.minutosPlan,
        minutosReales: calc.minutosReales,
        evidence: ev
          ? {
              status: ev.status,
              progressPct: evidenceProgressPct(ev.status, a.coreKind),
              entryPhotoUrl: ev.entryPhotoUrl,
              evidencePhotos: ev.evidencePhotos ?? [],
              exitPhotoUrl: ev.exitPhotoUrl,
              serviceSheetPdfUrl: ev.serviceSheetPdfUrl,
              serviceSheetData: ev.serviceSheetData,
            }
          : null,
      };
    });
  }

  /**
   * Lo que repartió quien consulta, en el rango. Incluye las filas viejas sin
   * `asignadoPorId` cuando él creó la actividad (antes no se guardaba quién la pasó).
   */
  async getAssignedByMe(
    viewer: Viewer,
    companyId: number | null,
    rango?: BoardRange,
  ): Promise<AsignadasPorMiResponse> {
    const now = new Date();
    const r = rango ?? this.resolveRange(null, null, now);
    const tipos = tiposVisibles(viewer);
    const filas = await this.prisma.activityAssignee.findMany({
      where: {
        ...(companyId != null ? { companyId } : {}),
        OR: [
          { asignadoPorId: viewer.id },
          { asignadoPorId: null, activity: { creadoPorId: viewer.id } },
        ],
        activity: {
          deletedAt: null,
          ...(tipos ? { coreKind: { in: tipos } } : {}),
        },
      },
      include: {
        user: { select: { id: true, nombre: true, avatarUrl: true, puesto: true } },
        activity: {
          select: {
            id: true,
            anNumber: true,
            titulo: true,
            estatus: true,
            prioridad: true,
            coreKind: true,
            assignmentCharge: true,
            fechaAsignacion: true,
            fechaInicio: true,
            fechaMaxima: true,
            fechaFinalizacion: true,
            periodoInicio: true,
            periodoFin: true,
            activityEvidences: {
              select: {
                userId: true,
                status: true,
                entryPhotoUploadedAt: true,
                exitPhotoUploadedAt: true,
                completedAt: true,
              },
            },
          },
        },
      },
      orderBy: { asignadoAt: 'desc' },
      take: 400,
    });

    const items: AsignadaPorMiItem[] = [];
    for (const fila of filas) {
      const act = fila.activity;
      if (!act) continue;
      const ev = act.activityEvidences.find((e) => e.userId === fila.userId) ?? null;
      const cerrada = /finalizada|completada|cancelada|aprobada/i.test(act.estatus || '');
      const tiempos = tiemposReales({
        inicioRealAt: fechaOpcional(fila, 'inicioRealAt'),
        finRealAt: fechaOpcional(fila, 'finRealAt'),
        entryPhotoUploadedAt: ev?.entryPhotoUploadedAt ?? null,
        exitPhotoUploadedAt: ev?.exitPhotoUploadedAt ?? null,
        evidenciaCompletedAt: ev?.completedAt ?? null,
        fechaFinalizacion: act.fechaFinalizacion,
        cerrada,
      });
      const terminada = cerrada || ev?.status === 'COMPLETED';
      const dentro =
        enRango(
          [tiempos.inicio, tiempos.fin, act.fechaFinalizacion, act.fechaInicio, fila.asignadoAt],
          r.desde,
          r.hasta,
        ) || (!terminada && fila.asignadoAt.getTime() <= r.hasta.getTime());
      if (!dentro) continue;
      const calc = calculaActividad(
        {
          prioridad: act.prioridad,
          estatus: act.estatus,
          fechaMaxima: act.fechaMaxima,
          terminada,
          cancelada: /cancel/i.test(act.estatus || ''),
          rechazadaAt: fechaOpcional(fila, 'rechazadaAt'),
          retirado: fila.retiradoAt != null,
          minutosPlan: minutosPlanDeHoras(numero(fila.horasPlan)),
          inicio: tiempos.inicio,
          fin: tiempos.fin,
          periodo: periodoDeActividad(act),
        },
        now,
      );
      items.push({
        id: act.id,
        anNumber: act.anNumber,
        titulo: act.titulo,
        estatus: act.estatus,
        coreKind: act.coreKind,
        assignmentCharge: act.assignmentCharge,
        fechaAsignacion: fila.asignadoAt,
        fechaMaxima: act.fechaMaxima,
        fechaFinalizacion: act.fechaFinalizacion,
        persona: {
          id: fila.user.id,
          nombre: fila.user.nombre,
          avatarUrl: fila.user.avatarUrl,
          puesto: fila.user.puesto,
        },
        prioridad: calc.prioridad,
        semaforo: calc.semaforo,
        minutosPlan: calc.minutosPlan,
        minutosReales: calc.minutosReales,
        excedida: calc.excedida,
        terminada: calc.terminada,
        retirado: calc.retirado,
        aceptacion: aceptacionDe(fila),
        motivoRechazo: textoOpcional(fila, 'motivoRechazo'),
        periodo: periodoDto(act, now, terminada),
      });
    }

    return { desde: workDateKey(r.desde), hasta: workDateKey(r.hasta), items };
  }

  private async resolveScope(viewer: Viewer, companyId: number | null) {
    let email = viewer.email ?? null;
    if (!email && !viewer.isSuperAdmin && viewer.roleKey !== 'ceo') {
      const row = await this.prisma.user.findUnique({
        where: { id: viewer.id },
        select: { email: true },
      });
      email = row?.email ?? null;
    }
    const viewerResolved: Viewer = { ...viewer, email };
    const companyScope = companyId
      ? { companyMemberships: { some: { companyId } } }
      : {};
    const allActive = await this.prisma.user.findMany({
      where: { isActive: true, ...companyScope },
      select: {
        id: true,
        nombre: true,
        email: true,
        avatarUrl: true,
        puesto: true,
        managerId: true,
      },
      orderBy: { nombre: 'asc' },
    });
    const companyWide = this.isCompanyWide(viewerResolved);
    let scoped: ScopedUser[] = companyWide
      ? allActive
      : allActive.filter((u) => this.subtreeIds(viewer.id, allActive).has(u.id));

    // Peers operativos por email (no solo managerId): Luis despacha a Antonio
    // aunque Antonio reporte a Christian en el organigrama.
    if (!companyWide) {
      const extras = this.boardExtraEmails(viewerResolved.email);
      if (extras.length) {
        const have = new Set(scoped.map((u) => u.id));
        for (const u of allActive) {
          if (have.has(u.id)) continue;
          if (!extras.includes(u.email.toLowerCase())) continue;
          scoped.push(u);
          have.add(u.id);
        }
      }
    }

    // Quien no es empleado (Christian, Adam, Claudia de pruebas, cuenta demo) nunca sale en la pizarra.
    scoped = scoped.filter((u) => !isNonEmployeeEmail(u.email));

    // Company-wide (CEO/developer): pizarra = equipo ajeno.
    // Encargados/subtree: SÍ incluir al viewer para ver lo que Christian (u otros) les asignan.
    if (companyWide) {
      scoped = scoped.filter((u) => u.id !== viewer.id);
    } else {
      scoped = [
        ...scoped.filter((u) => u.id === viewer.id),
        ...scoped.filter((u) => u.id !== viewer.id),
      ];
    }

    return { companyWide, scoped, now: new Date() };
  }

  private async buildCards(
    scoped: ScopedUser[],
    userIds: number[],
    companyId: number | null,
    now: Date,
    /** Solo estos tipos de actividad (`coreKind`); `null` = todos. */
    tipos: string[] | null = null,
    rango?: BoardRange,
  ): Promise<TeamBoardUser[]> {
    // Día de México: el contenedor corre en UTC y el «hoy» cambiaba a las 18:00.
    const { desde: dayStart, hasta: dayEnd } = rango ?? this.resolveRange(null, null, now);
    const gpsSince = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const closed = (estatus: string) => {
      const s = (estatus || '').toLowerCase();
      return (
        s.includes('finalizada') ||
        s.includes('completada') ||
        s.includes('cancelada') ||
        s.includes('aprobada')
      );
    };

    const [assigneeRows, attendances, lunchBreaks, locationTrackings] = await Promise.all([
      // `include` en vez de `select`: así llegan también las columnas de la sección B
      // (`inicioRealAt`, `aceptadaAt`…) en cuanto exista su migración, sin tocar esto.
      this.prisma.activityAssignee.findMany({
        where: {
          userId: { in: userIds },
          retiradoAt: null,
          ...(companyId != null ? { companyId } : {}),
          ...(tipos ? { activity: { coreKind: { in: tipos } } } : {}),
        },
        include: {
          asignadoPor: { select: { id: true, nombre: true } },
          activity: {
            select: {
              id: true,
              anNumber: true,
              titulo: true,
              estatus: true,
              prioridad: true,
              fechaMaxima: true,
              projectId: true,
              clientId: true,
              responsableId: true,
              fechaAsignacion: true,
              fechaInicio: true,
              fechaFinalizacion: true,
              periodoInicio: true,
              periodoFin: true,
              coreKind: true,
              assignmentCharge: true,
              deletedAt: true,
              assignees: {
                where: { retiradoAt: null },
                select: { user: { select: { email: true } } },
              },
              activityEvidences: {
                where: { userId: { in: userIds } },
                select: {
                  userId: true,
                  status: true,
                  completedAt: true,
                  reviewStatus: true,
                  entryPhotoUploadedAt: true,
                  exitPhotoUploadedAt: true,
                },
              },
            },
          },
        },
      }),
      // Entradas **y** salidas: las horas trabajadas se cortan en la salida real.
      this.prisma.attendance.findMany({
        where: {
          userId: { in: userIds },
          timestamp: { gte: dayStart, lte: dayEnd },
          ...(companyId != null ? { companyId } : {}),
        },
        select: { userId: true, type: true, timestamp: true, workDate: true },
        orderBy: { timestamp: 'asc' },
      }),
      this.prisma.lunchBreak.findMany({
        where: {
          userId: { in: userIds },
          date: { gte: workDateColumn(dayStart), lte: workDateColumn(dayEnd) },
          ...(companyId != null ? { companyId } : {}),
        },
        select: { userId: true, checkinTime: true, checkoutTime: true },
      }),
      this.prisma.locationTracking.findMany({
        where: {
          usuarioId: { in: userIds },
          OR: [{ estaActivo: true }, { ultimaActualizacion: { gte: gpsSince } }],
          ...(companyId != null ? { companyId } : {}),
        },
        select: { usuarioId: true },
      }),
    ]);

    // Una jornada por persona y día: primera entrada, última salida.
    const jornadasPorUsuario = new Map<number, Map<string, Jornada>>();
    for (const a of attendances) {
      // `workDate` es `@db.Date`: Prisma la entrega a medianoche **UTC**, así que se
      // lee en UTC. Convertirla a hora de México la correría un día hacia atrás.
      const dia = a.workDate
        ? a.workDate.toISOString().slice(0, 10)
        : workDateKey(a.timestamp);
      const porDia = jornadasPorUsuario.get(a.userId) ?? new Map<string, Jornada>();
      const actual = porDia.get(dia);
      if (a.type === 'entrada') {
        if (!actual) porDia.set(dia, { entrada: a.timestamp, salida: null });
        else if (a.timestamp.getTime() < actual.entrada.getTime()) actual.entrada = a.timestamp;
      } else if (a.type === 'salida' && actual) {
        actual.salida = a.timestamp;
      }
      jornadasPorUsuario.set(a.userId, porDia);
    }
    const comidasPorUsuario = new Map<number, Comida[]>();
    for (const c of lunchBreaks) {
      const lista = comidasPorUsuario.get(c.userId) ?? [];
      lista.push({ inicio: c.checkinTime, fin: c.checkoutTime ?? null });
      comidasPorUsuario.set(c.userId, lista);
    }
    const present = new Set<number>([
      ...jornadasPorUsuario.keys(),
      ...locationTrackings.map((lt) => lt.usuarioId),
    ]);

    /** Lo calculado de cada fila (persona + actividad), para no repetir cuentas. */
    type Calculo = {
      calc: ActividadCalculada;
      inicio: Date | null;
      fin: Date | null;
      asignadoPor: { id: number; nombre: string } | null;
      aceptacion: BoardAceptacion;
      dentroDelRango: boolean;
    };
    const calculoPorFila = new Map<string, Calculo>();
    const clave = (userId: number, activityId: number) => `${userId}:${activityId}`;

    const openByUser = new Map<number, TeamBoardOpenActivity[]>();
    for (const row of assigneeRows) {
      const act = row.activity;
      if (!act || act.deletedAt) continue;
      const myEv =
        act.activityEvidences.find((e) => e.userId === row.userId) ?? act.activityEvidences[0];
      const isClosed = closed(act.estatus);
      const tiempos = tiemposReales({
        inicioRealAt: fechaOpcional(row, 'inicioRealAt'),
        finRealAt: fechaOpcional(row, 'finRealAt'),
        entryPhotoUploadedAt: myEv?.entryPhotoUploadedAt ?? null,
        exitPhotoUploadedAt: myEv?.exitPhotoUploadedAt ?? null,
        evidenciaCompletedAt: myEv?.completedAt ?? null,
        fechaFinalizacion: act.fechaFinalizacion,
        cerrada: isClosed,
      });
      const terminada = isClosed || myEv?.status === 'COMPLETED';
      const periodo = periodoDeActividad(act);
      const calc = calculaActividad(
        {
          prioridad: act.prioridad,
          estatus: act.estatus,
          fechaMaxima: act.fechaMaxima,
          terminada,
          cancelada: /cancel/i.test(act.estatus || ''),
          rechazadaAt: fechaOpcional(row, 'rechazadaAt'),
          minutosPlan: minutosPlanDeHoras(numero(row.horasPlan)),
          inicio: tiempos.inicio,
          fin: tiempos.fin,
          periodo,
        },
        now,
      );
      // Una etapa que empieza después del rango todavía no es trabajo de esos días: si no,
      // al programar un proyecto todas sus etapas saldrían hoy en la pizarra.
      const programadaDespues = !terminada && periodo != null && periodo.inicio > workDateKey(dayEnd);
      // Entra al rango lo que pasó dentro y lo que sigue abierto de antes (así una actividad
      // de varios días sale todos los días de su periodo, y después, mientras siga abierta).
      const dentroDelRango =
        !programadaDespues &&
        (enRango(
          [tiempos.inicio, tiempos.fin, act.fechaFinalizacion, act.fechaInicio, act.fechaAsignacion],
          dayStart,
          dayEnd,
        ) ||
          (!terminada && act.fechaAsignacion.getTime() <= dayEnd.getTime()));
      calculoPorFila.set(clave(row.userId, act.id), {
        calc,
        inicio: tiempos.inicio,
        fin: tiempos.fin,
        asignadoPor: row.asignadoPor ? { id: row.asignadoPor.id, nombre: row.asignadoPor.nombre } : null,
        aceptacion: aceptacionDe(row),
        dentroDelRango,
      });
      if (!dentroDelRango) continue;

      const evidenceStatus = myEv?.status ?? 'ENTRY_PHOTO';
      const item: TeamBoardOpenActivity = {
        id: act.id,
        anNumber: act.anNumber,
        titulo: act.titulo,
        estatus: act.estatus,
        evidenceStatus,
        progressPct: evidenceProgressPct(evidenceStatus, act.coreKind),
        coreKind: act.coreKind,
        assignmentCharge: act.assignmentCharge,
        fechaFinalizacion: act.fechaFinalizacion,
        indicaciones: row.indicaciones ?? null,
        teamEmails: act.assignees
          .map((m) => (m.user?.email || '').trim().toLowerCase())
          .filter(Boolean),
        reparte: act.assignmentCharge === 'despacho' && String(row.rol) === 'LEAD',
        fechaInicio: act.fechaInicio,
        prioridad: calc.prioridad,
        semaforo: calc.semaforo,
        minutosPlan: calc.minutosPlan,
        minutosReales: calc.minutosReales,
        excedida: calc.excedida,
        inicioRealAt: tiempos.inicio,
        finRealAt: tiempos.fin,
        asignadoPor: row.asignadoPor
          ? { id: row.asignadoPor.id, nombre: row.asignadoPor.nombre }
          : null,
        aceptacion: aceptacionDe(row),
        periodo: periodoDto(act, now, terminada),
      };
      const list = openByUser.get(row.userId) ?? [];
      if (!list.some((x) => x.id === item.id)) list.push(item);
      openByUser.set(row.userId, list);
    }

    return scoped.map((u) => {
      const allOpen = openByUser.get(u.id) ?? [];
      const openActivities = allOpen.slice(0, 5);
      const minutos = (ms: number) => Math.max(0, Math.floor(ms / 60_000));
      // Trabajo propio (un despacho que solo reparte no cuenta) y si esta persona ya lo terminó:
      // envió su evidencia o la actividad se cerró. Antes lo terminado seguía contando como «en curso»
      // y salía «Atrasado» aunque ya lo hubiera entregado.
      const propias = assigneeRows
        .filter((r) => r.userId === u.id && r.activity && !r.activity.deletedAt)
        .filter((r) => !(r.activity.assignmentCharge === 'despacho' && String(r.rol) === 'LEAD'))
        .map((r) => {
          const a = r.activity;
          const ev = a.activityEvidences.find((e) => e.userId === u.id) ?? null;
          const envio = ev?.status === 'COMPLETED';
          const cerrada = closed(a.estatus);
          const calculo = calculoPorFila.get(clave(u.id, a.id)) ?? null;
          return {
            a,
            calculo,
            envio,
            aprobada: ev?.reviewStatus === 'APPROVED',
            devuelta: ev?.reviewStatus === 'REJECTED',
            terminada: envio || cerrada,
            cancelada: /cancel/i.test(a.estatus || ''),
            terminoAt: envio
              ? (calculo?.fin ?? ev?.completedAt ?? a.fechaFinalizacion)
              : cerrada
                ? (calculo?.fin ?? a.fechaFinalizacion)
                : null,
          };
        });
      const enElRango = propias.filter((p) => p.calculo?.dentroDelRango);
      // En curso: primero lo que ya arrancó, luego lo que vence antes (con periodo, su fin).
      const arranco = (estatus: string) => (/proceso|validar/i.test(estatus || '') ? 0 : 1);
      const vence = (a: (typeof propias)[number]['a']) =>
        limiteDeActividad(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const enCurso =
        enElRango
          .filter((p) => !p.terminada)
          .sort((x, y) => arranco(x.a.estatus) - arranco(y.a.estatus) || vence(x.a) - vence(y.a))[0] ?? null;
      const act = enCurso?.a ?? null;
      // Entregó y nadie ha aprobado todavía / le devolvieron evidencia y la está corrigiendo.
      const enEsperaAprobacion = enElRango.filter((p) => p.envio && !p.aprobada && !p.cancelada).length;
      const enCorreccion = enElRango.filter((p) => p.devuelta && !p.terminada && !p.cancelada).length;
      let status: BoardUserStatus = 'sin_actividad';
      let currentActivity: TeamBoardActivity | null = null;
      let activityStartedAt: Date | null = null;
      let activityElapsedMinutes: number | null = null;
      let currentLateMinutes: number | null = null;
      let idleSinceAt: Date | null = null;
      let lastFinished: TeamBoardUser['lastFinished'] = null;

      if (act) {
        // Con periodo, «atrasado» es pasar el fin de su último día, no la hora citada del primero.
        const limite = limiteDeActividad(act);
        const overdue = limite != null && limite.getTime() < now.getTime();
        status = overdue ? 'atrasado' : 'activo';
        currentLateMinutes = overdue && limite ? minutos(now.getTime() - limite.getTime()) : null;
        currentActivity = {
          id: act.id,
          anNumber: act.anNumber,
          titulo: act.titulo,
          estatus: act.estatus,
          fechaMaxima: act.fechaMaxima,
          bucket: act.projectId ? 'projects' : act.clientId ? 'services' : 'daily',
          periodo: periodoDto(act, now, false),
        };
        // El inicio es el real (foto de entrada / `inicioRealAt`), no la hora a la que la citaron.
        activityStartedAt = enCurso?.calculo?.inicio ?? null;
        activityElapsedMinutes = enCurso?.calculo?.calc.minutosReales ?? null;
      } else {
        // Hoy terminó algo y no tiene nada abierto: «sin actividad desde hace…» y con cuánto atraso.
        const ultima = enElRango
          .filter(
            (p) => p.terminada && !p.cancelada && p.terminoAt != null && p.terminoAt.getTime() >= dayStart.getTime(),
          )
          .sort((x, y) => (y.terminoAt?.getTime() ?? 0) - (x.terminoAt?.getTime() ?? 0))[0];
        if (ultima?.terminoAt) {
          status = 'libre';
          idleSinceAt = ultima.terminoAt;
          const limite = limiteDeActividad(ultima.a);
          lastFinished = {
            id: ultima.a.id,
            anNumber: ultima.a.anNumber,
            titulo: ultima.a.titulo,
            finishedAt: ultima.terminoAt,
            lateMinutes: limite ? minutos(ultima.terminoAt.getTime() - limite.getTime()) : null,
          };
        }
      }
      void present; // la presencia ya no define el estado (se sigue calculando la entrada del día)

      const jornadas = [...(jornadasPorUsuario.get(u.id)?.values() ?? [])].sort(
        (a, b) => a.entrada.getTime() - b.entrada.getTime(),
      );
      const comidas = comidasPorUsuario.get(u.id) ?? [];
      const clockInAt = jornadas.length ? jornadas[jornadas.length - 1].entrada : null;
      // Antes se contaba de la entrada hasta ahora aunque ya se hubiera ido.
      const workedMinutes = minutosAsistidos(jornadas, comidas, now);
      const kpis = kpisDePersona(
        enElRango.map((p) => p.calculo!.calc),
        workedMinutes,
      );

      return {
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        avatarUrl: u.avatarUrl,
        puesto: u.puesto,
        status,
        currentActivity,
        openActivities,
        clockInAt,
        workedMinutes,
        activityStartedAt,
        activityElapsedMinutes,
        currentLateMinutes,
        idleSinceAt,
        lastFinished,
        enEsperaAprobacion,
        enCorreccion,
        kpis,
      };
    });
  }

  private isCompanyWide(viewer: Viewer): boolean {
    return esDeTodaLaEmpresa(viewer);
  }

  /** Flujo de despacho que no cuelga del organigrama (ver `equipo-alcance.ts`). */
  private boardExtraEmails(viewerEmail?: string | null): string[] {
    return extrasDeTablero(viewerEmail);
  }

  private subtreeIds(
    rootId: number,
    users: Array<{ id: number; managerId: number | null }>,
  ): Set<number> {
    return subarbolIds(rootId, users);
  }
}
