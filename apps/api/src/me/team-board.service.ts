import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { evidenceProgressPct } from '../activities/evidence/evidence-flow.helpers.js';

export type BoardActivityBucket = 'daily' | 'projects' | 'services';
export type BoardUserStatus = 'activo' | 'inactivo' | 'atrasado' | 'sin_actividad';

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
    const today = now.toLocaleDateString('sv-SE');
    const dayStart = new Date(`${today}T00:00:00`);
    const dayEnd = new Date(`${today}T23:59:59.999`);
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
              activityEvidences: {
                where: { userId: { in: userIds } },
                select: { userId: true, status: true },
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
      };
      const list = openByUser.get(row.userId) ?? [];
      if (!list.some((x) => x.id === item.id)) list.push(item);
      openByUser.set(row.userId, list);
    }

    return scoped.map((u) => {
      const openActivities = (openByUser.get(u.id) ?? []).slice(0, 5);
      const act = openActivities[0]
        ? assigneeRows.find((r) => r.userId === u.id && r.activity?.id === openActivities[0].id)
            ?.activity
        : null;
      let status: BoardUserStatus = 'sin_actividad';
      let currentActivity: TeamBoardActivity | null = null;
      let activityStartedAt: Date | null = null;
      let activityElapsedMinutes: number | null = null;

      if (act) {
        const overdue = act.fechaMaxima != null && act.fechaMaxima.getTime() < now.getTime();
        status = overdue ? 'atrasado' : 'activo';
        currentActivity = {
          id: act.id,
          anNumber: act.anNumber,
          titulo: act.titulo,
          estatus: act.estatus,
          fechaMaxima: act.fechaMaxima,
          bucket: act.projectId ? 'projects' : act.clientId ? 'services' : 'daily',
        };
        activityStartedAt = act.fechaInicio ?? act.fechaAsignacion ?? null;
        if (activityStartedAt) {
          activityElapsedMinutes = Math.max(
            0,
            Math.floor((now.getTime() - activityStartedAt.getTime()) / 60_000),
          );
        }
      } else if (!present.has(u.id)) {
        status = 'inactivo';
      }

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
