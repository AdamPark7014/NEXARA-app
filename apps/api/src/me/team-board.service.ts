import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { evidenceProgressPct } from '../activities/evidence/evidence-flow.helpers.js';
import { workDayBounds } from '../common/time/workday.js';

export type BoardActivityBucket = 'daily' | 'projects' | 'services';
/**
 * activo/atrasado: tiene algo abierto (atrasado = pasó la fecha máxima).
 * libre: hoy terminó su actividad y no tiene otra abierta. sin_actividad: hoy no tuvo nada.
 * inactivo: ya no se asigna (clientes viejos).
 */
export type BoardUserStatus = 'activo' | 'inactivo' | 'atrasado' | 'libre' | 'sin_actividad';

export type TeamBoardActivity = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  fechaMaxima: Date | null;
  bucket: BoardActivityBucket;
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
};

export type TeamBoardResponse = {
  scope: 'company' | 'subtree';
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

@Injectable()
export class TeamBoardService {
  constructor(private readonly prisma: PrismaService) {}

  async getBoard(viewer: Viewer, companyId: number | null): Promise<TeamBoardResponse> {
    const { companyWide, scoped, now } = await this.resolveScope(viewer, companyId);
    const userIds = scoped.map((u) => u.id);
    if (userIds.length === 0) {
      return { scope: companyWide ? 'company' : 'subtree', users: [] };
    }
    const users = await this.buildCards(scoped, userIds, companyId, now);
    return { scope: companyWide ? 'company' : 'subtree', users };
  }

  async getBoardUser(
    viewer: Viewer,
    companyId: number | null,
    userId: number,
  ): Promise<TeamBoardUser> {
    const { scoped, now } = await this.resolveScope(viewer, companyId);
    const target = scoped.find((u) => u.id === userId);
    if (!target) throw new NotFoundException('Usuario fuera de tu alcance');
    const [card] = await this.buildCards([target], [userId], companyId, now);
    return card;
  }

  /** Historial de actividades del usuario (assignee o responsable), con evidencia propia. */
  async getUserHistory(
    viewer: Viewer,
    companyId: number | null,
    userId: number,
    take = 40,
  ): Promise<TeamBoardHistoryItem[]> {
    const { scoped } = await this.resolveScope(viewer, companyId);
    if (!scoped.some((u) => u.id === userId)) {
      throw new NotFoundException('Usuario fuera de tu alcance');
    }
    const assignees = await this.prisma.activityAssignee.findMany({
      where: {
        userId,
        retiradoAt: null,
        ...(companyId != null ? { companyId } : {}),
      },
      select: { activityId: true },
    });
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

    const activities = await this.prisma.activity.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        estatus: true,
        coreKind: true,
        ticketTypeCustom: true,
        assignmentCharge: true,
        fechaAsignacion: true,
        fechaFinalizacion: true,
        activityEvidences: {
          where: { userId },
          select: {
            status: true,
            entryPhotoUrl: true,
            evidencePhotos: true,
            exitPhotoUrl: true,
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

    // Nunca mostrar al CEO Christian en la pizarra de nadie.
    scoped = scoped.filter((u) => u.email.toLowerCase() !== 'gerencia@nexara.com.mx');

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
  ): Promise<TeamBoardUser[]> {
    // Día de México: el contenedor corre en UTC y el «hoy» cambiaba a las 18:00.
    const { start: dayStart, end: dayEnd } = workDayBounds(now);
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

    const [assigneeRows, attendances, locationTrackings] = await Promise.all([
      this.prisma.activityAssignee.findMany({
        where: {
          userId: { in: userIds },
          retiradoAt: null,
          ...(companyId != null ? { companyId } : {}),
        },
        select: {
          userId: true,
          rol: true,
          indicaciones: true,
          activity: {
            select: {
              id: true,
              anNumber: true,
              titulo: true,
              estatus: true,
              fechaMaxima: true,
              projectId: true,
              clientId: true,
              responsableId: true,
              fechaAsignacion: true,
              fechaInicio: true,
              fechaFinalizacion: true,
              coreKind: true,
              assignmentCharge: true,
              deletedAt: true,
              assignees: {
                where: { retiradoAt: null },
                select: { user: { select: { email: true } } },
              },
              activityEvidences: {
                where: { userId: { in: userIds } },
                select: { userId: true, status: true, completedAt: true, reviewStatus: true },
              },
            },
          },
        },
      }),
      this.prisma.attendance.findMany({
        where: {
          userId: { in: userIds },
          type: 'entrada',
          timestamp: { gte: dayStart, lte: dayEnd },
          ...(companyId != null ? { companyId } : {}),
        },
        select: { userId: true, timestamp: true },
        orderBy: { timestamp: 'asc' },
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

    const clockInByUser = new Map<number, Date>();
    for (const a of attendances) {
      if (!clockInByUser.has(a.userId)) clockInByUser.set(a.userId, a.timestamp);
    }
    const present = new Set<number>([
      ...clockInByUser.keys(),
      ...locationTrackings.map((lt) => lt.usuarioId),
    ]);

    const openByUser = new Map<number, TeamBoardOpenActivity[]>();
    for (const row of assigneeRows) {
      const act = row.activity;
      if (!act || act.deletedAt) continue;
      const isClosed = closed(act.estatus);
      const finishedBeforeToday =
        isClosed &&
        act.fechaFinalizacion != null &&
        act.fechaFinalizacion.getTime() < dayStart.getTime();
      if (finishedBeforeToday) continue;

      const myEv =
        act.activityEvidences.find((e) => e.userId === row.userId) ??
        act.activityEvidences[0];
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
          return {
            a,
            envio,
            aprobada: ev?.reviewStatus === 'APPROVED',
            devuelta: ev?.reviewStatus === 'REJECTED',
            terminada: envio || cerrada,
            cancelada: /cancel/i.test(a.estatus || ''),
            terminoAt: envio ? (ev?.completedAt ?? a.fechaFinalizacion) : cerrada ? a.fechaFinalizacion : null,
          };
        });
      // En curso: primero lo que ya arrancó, luego lo que vence antes.
      const arranco = (estatus: string) => (/proceso|validar/i.test(estatus || '') ? 0 : 1);
      const act =
        propias
          .filter((p) => !p.terminada)
          .sort(
            (x, y) =>
              arranco(x.a.estatus) - arranco(y.a.estatus) ||
              (x.a.fechaMaxima?.getTime() ?? Number.MAX_SAFE_INTEGER) -
                (y.a.fechaMaxima?.getTime() ?? Number.MAX_SAFE_INTEGER),
          )[0]?.a ?? null;
      // Entregó y nadie ha aprobado todavía / le devolvieron evidencia y la está corrigiendo.
      const enEsperaAprobacion = propias.filter((p) => p.envio && !p.aprobada && !p.cancelada).length;
      const enCorreccion = propias.filter((p) => p.devuelta && !p.terminada && !p.cancelada).length;
      let status: BoardUserStatus = 'sin_actividad';
      let currentActivity: TeamBoardActivity | null = null;
      let activityStartedAt: Date | null = null;
      let activityElapsedMinutes: number | null = null;
      let currentLateMinutes: number | null = null;
      let idleSinceAt: Date | null = null;
      let lastFinished: TeamBoardUser['lastFinished'] = null;

      if (act) {
        const overdue = act.fechaMaxima != null && act.fechaMaxima.getTime() < now.getTime();
        status = overdue ? 'atrasado' : 'activo';
        currentLateMinutes =
          overdue && act.fechaMaxima ? minutos(now.getTime() - act.fechaMaxima.getTime()) : null;
        currentActivity = {
          id: act.id,
          anNumber: act.anNumber,
          titulo: act.titulo,
          estatus: act.estatus,
          fechaMaxima: act.fechaMaxima,
          bucket: act.projectId ? 'projects' : act.clientId ? 'services' : 'daily',
        };
        // fechaInicio es la hora programada: solo cuenta como «en actividad» si ya arrancó.
        activityStartedAt = /proceso|validar/i.test(act.estatus || '')
          ? act.fechaInicio ?? act.fechaAsignacion ?? null
          : null;
        if (activityStartedAt) {
          activityElapsedMinutes = Math.max(
            0,
            Math.floor((now.getTime() - activityStartedAt.getTime()) / 60_000),
          );
        }
      } else {
        // Hoy terminó algo y no tiene nada abierto: «sin actividad desde hace…» y con cuánto atraso.
        const ultima = propias
          .filter(
            (p) => p.terminada && !p.cancelada && p.terminoAt != null && p.terminoAt.getTime() >= dayStart.getTime(),
          )
          .sort((x, y) => (y.terminoAt?.getTime() ?? 0) - (x.terminoAt?.getTime() ?? 0))[0];
        if (ultima?.terminoAt) {
          status = 'libre';
          idleSinceAt = ultima.terminoAt;
          lastFinished = {
            id: ultima.a.id,
            anNumber: ultima.a.anNumber,
            titulo: ultima.a.titulo,
            finishedAt: ultima.terminoAt,
            lateMinutes: ultima.a.fechaMaxima
              ? minutos(ultima.terminoAt.getTime() - ultima.a.fechaMaxima.getTime())
              : null,
          };
        }
      }
      void present; // la presencia ya no define el estado (se sigue calculando la entrada del día)

      const clockInAt = clockInByUser.get(u.id) ?? null;
      const workedMinutes = clockInAt
        ? Math.max(0, Math.floor((now.getTime() - clockInAt.getTime()) / 60_000))
        : null;

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
      };
    });
  }

  private isCompanyWide(viewer: Viewer): boolean {
    if (viewer.isSuperAdmin) return true;
    if (viewer.roleKey === 'ceo') return true;
    const email = (viewer.email || '').toLowerCase();
    return email === 'gerencia@nexara.com.mx' || email === 'developer@nexara.com.mx';
  }

  /**
   * Gente que debe verse en pizarra aunque managerId no los cuelgue del viewer.
   * Luis (coord. servicios) → Antonio + soporte; Antonio → Carolina/Alejandro.
   */
  private boardExtraEmails(viewerEmail?: string | null): string[] {
    const email = (viewerEmail || '').trim().toLowerCase();
    if (email === 'direccion.operaciones@nexara.com.mx') {
      return [
        'jose.ramirez@nexara.com.mx',
        'soporte@nexara.com.mx',
        'alejandro.gonzalez@nexara.com.mx',
      ];
    }
    if (email === 'jose.ramirez@nexara.com.mx') {
      return ['soporte@nexara.com.mx', 'alejandro.gonzalez@nexara.com.mx'];
    }
    // David: instaladores de campo (por si managerId local no coincide con el seed)
    if (email === 'operaciones@nexara.com.mx') {
      return [
        'joan.sanchez@nexara.com.mx',
        'israel.ramos@nexara.com.mx',
        'juan.gonzalez@nexara.com.mx',
      ];
    }
    return [];
  }

  private subtreeIds(
    rootId: number,
    users: Array<{ id: number; managerId: number | null }>,
  ): Set<number> {
    const children = new Map<number, number[]>();
    for (const u of users) {
      if (u.managerId == null) continue;
      const list = children.get(u.managerId) ?? [];
      list.push(u.id);
      children.set(u.managerId, list);
    }
    const out = new Set<number>([rootId]);
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const child of children.get(id) ?? []) {
        if (out.has(child)) continue;
        out.add(child);
        queue.push(child);
      }
    }
    return out;
  }
}
