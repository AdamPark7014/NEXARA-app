import { Injectable } from '@nestjs/common';
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

@Injectable()
export class TeamBoardService {
  constructor(private readonly prisma: PrismaService) {}

  async getBoard(viewer: Viewer, companyId: number | null): Promise<TeamBoardResponse> {
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
    const scoped = companyWide
      ? allActive
      : allActive.filter((u) => this.subtreeIds(viewer.id, allActive).has(u.id));

    const now = new Date();
    const today = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD
    const dayStart = new Date(`${today}T00:00:00`);
    const dayEnd = new Date(`${today}T23:59:59.999`);
    const gpsSince = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const userIds = scoped.map((u) => u.id);
    if (userIds.length === 0) {
      return { scope: companyWide ? 'company' : 'subtree', users: [] };
    }

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
        select: { userId: true },
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

    const present = new Set<number>([
      ...attendances.map((a) => a.userId),
      ...locationTrackings.map((lt) => lt.usuarioId),
    ]);
    const activityByUser = new Map<number, (typeof activities)[number]>();
    for (const a of activities) {
      if (!activityByUser.has(a.responsableId)) activityByUser.set(a.responsableId, a);
    }

    const users: TeamBoardUser[] = scoped.map((u) => {
      const act = activityByUser.get(u.id) ?? null;
      let status: BoardUserStatus = 'sin_actividad';
      let currentActivity: TeamBoardActivity | null = null;

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
      } else if (!present.has(u.id)) {
        status = 'inactivo';
      }

      return {
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        avatarUrl: u.avatarUrl,
        puesto: u.puesto,
        status,
        currentActivity,
      };
    });

    return { scope: companyWide ? 'company' : 'subtree', users };
  }

  private isCompanyWide(viewer: Viewer): boolean {
    if (viewer.isSuperAdmin) return true;
    if (viewer.roleKey === 'ceo') return true;
    const email = (viewer.email || '').toLowerCase();
    return email === 'gerencia@nexara.com.mx' || email === 'developer@nexara.com.mx';
  }

  /** Viewer + todos los descendientes por managerId. */
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
