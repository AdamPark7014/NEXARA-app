import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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

export type TeamBoardUser = {
  id: number;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  puesto: string | null;
  status: BoardUserStatus;
  currentActivity: TeamBoardActivity | null;
  clockInAt: Date | null;
  workedMinutes: number | null;
  activityStartedAt: Date | null;
  activityElapsedMinutes: number | null;
};

export type TeamBoardResponse = {
  scope: 'company' | 'subtree';
  users: TeamBoardUser[];
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
    const scoped: ScopedUser[] = companyWide
      ? allActive
      : allActive.filter((u) => this.subtreeIds(viewer.id, allActive).has(u.id));
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

    const [activities, attendances, locationTrackings] = await Promise.all([
      this.prisma.activity.findMany({
        where: {
          responsableId: { in: userIds },
          deletedAt: null,
          ...(companyId != null ? { companyId } : {}),
          NOT: {
            OR: [
              { estatus: { contains: 'finalizada', mode: 'insensitive' } },
              { estatus: { contains: 'completada', mode: 'insensitive' } },
              { estatus: { contains: 'cancelada', mode: 'insensitive' } },
            ],
          },
        },
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
        },
        orderBy: { fechaAsignacion: 'desc' },
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
    const activityByUser = new Map<number, (typeof activities)[number]>();
    for (const a of activities) {
      if (!activityByUser.has(a.responsableId)) activityByUser.set(a.responsableId, a);
    }

    return scoped.map((u) => {
      const act = activityByUser.get(u.id) ?? null;
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
