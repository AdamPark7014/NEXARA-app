import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import {
  appendTrail,
  buildApprovalChain,
  canActOnStep,
  isTerminalApproved,
  stepRoleAt,
  type TrailEntry,
} from '../common/rbac/hierarchical-approval.js';
import { ROLES, type RoleKey } from '../common/rbac/roles.v2.js';

export interface CreateFineDto {
  usuarioId: number;
  tipo: 'actividad' | 'vehiculo' | 'asistencia' | 'herramienta';
  razon: string;
  descripcion?: string;
  monto: number;
  referenciaId?: number;
}

export interface UpdateFineDto {
  razon?: string;
  descripcion?: string;
  monto?: number;
  estatusPago?: string;
  notas?: string;
}

@Injectable()
export class FinesService {
  constructor(
    private prisma: PrismaService,
    private notificationHierarchy: NotificationHierarchyService,
  ) {}

  private resolveActorRole(actor: any): RoleKey | null {
    if (actor?.isSuperAdmin) return ROLES.SUPER_ADMIN;
    return actor?.roleKey ?? actor?.role?.orgRoleKey ?? null;
  }

  private amountOf(fine: { monto: unknown }) {
    return typeof fine.monto === 'object' && fine.monto && 'toNumber' in (fine.monto as object)
      ? (fine.monto as { toNumber: () => number }).toNumber()
      : Number(fine.monto) || 0;
  }

  async create(data: CreateFineDto) {
    const fine = await this.prisma.fine.create({
      data: {
        usuarioId: data.usuarioId,
        tipo: data.tipo,
        razon: data.razon,
        descripcion: data.descripcion,
        monto: data.monto,
        referenciaId: data.referenciaId,
        estatusPago: 'Pendiente',
        estatusAprobacion: 'Pendiente',
        approvalStep: 0,
        approvalTrail: [],
      },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });

    // La notificación al usuario se envía cuando el CEO aprueba la multa (approveOrReject).

    return fine;
  }

  async findAll(currentUser?: any, query?: PaginationQueryDto) {
    const include = {
      usuario: {
        select: {
          id: true,
          nombre: true,
          email: true,
          departmentId: true,
          role: {
            select: {
              id: true,
              nombre: true,
              accesoConsoleAdmin: true,
            },
          },
        },
      },
    };

    let where: any = undefined;

    if (currentUser?.isSuperAdmin) {
      where = undefined;
    } else if (
      currentUser?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) ||
      currentUser?.permissions?.includes(PERMISSIONS.ACTIVITIES_MANAGE)
    ) {
      // Legacy admin or v2 OPS manager: team scope within same department
      where = {
        usuario: {
          AND: [
            { departmentId: currentUser.departmentId },
            { role: { accesoConsoleAdmin: false } },
          ],
        },
      };
    } else {
      return [];
    }

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.fine.findMany({ where, include, orderBy: { fechaCreacion: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.fine.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }

    return this.prisma.fine.findMany({ where, include, orderBy: { fechaCreacion: 'desc' } });
  }

  async findByUser(usuarioId: number) {
    return this.prisma.fine.findMany({
      where: { usuarioId },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });
  }

  async findByType(tipo: string) {
    return this.prisma.fine.findMany({
      where: { tipo },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });
  }

  async findByUserAndType(usuarioId: number, tipo: string) {
    return this.prisma.fine.findMany({
      where: { usuarioId, tipo },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });
  }

  async update(id: number, data: UpdateFineDto) {
    return this.prisma.fine.update({
      where: { id },
      data,
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  async approveOrReject(id: number, actor: any, action: 'approve' | 'reject', note?: string) {
    const fine = await this.prisma.fine.findUnique({ where: { id } });
    if (!fine) throw new BadRequestException('Multa no encontrada');
    if (['Rechazado', 'Aprobado'].includes(fine.estatusAprobacion)) {
      throw new BadRequestException('Esta multa ya fue cerrada');
    }

    const amount = this.amountOf(fine);
    const chain = buildApprovalChain('multas', amount);
    const step = fine.approvalStep ?? 0;
    const actorRole = this.resolveActorRole(actor);
    if (!actor?.isSuperAdmin && !canActOnStep(actorRole, step, chain)) {
      throw new ForbiddenException('No tienes permisos para autorizar en este paso del flujo');
    }

    const trailEntry: TrailEntry = {
      role: stepRoleAt(chain, step) ?? actorRole ?? 'unknown',
      userId: actor.id,
      userName: actor.nombre,
      action,
      at: new Date().toISOString(),
      note: note?.trim() || undefined,
    };
    const trail = appendTrail(fine.approvalTrail as TrailEntry[] | null, trailEntry);

    if (action === 'reject') {
      return this.prisma.fine.update({
        where: { id },
        data: { estatusAprobacion: 'Rechazado', approvalTrail: trail },
        include: { usuario: { select: { id: true, nombre: true, email: true } } },
      });
    }

    const nextStep = step + 1;
    if (isTerminalApproved(nextStep, chain)) {
      const updated = await this.prisma.fine.update({
        where: { id },
        data: { approvalStep: nextStep, approvalTrail: trail, estatusAprobacion: 'Aprobado' },
        include: { usuario: { select: { id: true, nombre: true, email: true } } },
      });
      await this.notificationHierarchy.notifyFineCreated(
        fine.usuarioId,
        id,
        fine.razon,
        amount,
        fine.tipo,
      );
      return updated;
    }

    return this.prisma.fine.update({
      where: { id },
      data: { approvalStep: nextStep, approvalTrail: trail, estatusAprobacion: 'Pendiente' },
      include: { usuario: { select: { id: true, nombre: true, email: true } } },
    });
  }

  async delete(id: number) {
    return this.prisma.fine.delete({
      where: { id },
    });
  }

  async getTotalByUser(usuarioId: number, tipo?: string) {
    const fines = await this.prisma.fine.findMany({
      where: {
        usuarioId,
        ...(tipo && { tipo }),
      },
      select: {
        monto: true,
      },
    });
    return fines.reduce((sum, fine) => sum + Number(fine.monto), 0);
  }

  async getCountByUser(usuarioId: number, tipo?: string) {
    return this.prisma.fine.count({
      where: {
        usuarioId,
        ...(tipo && { tipo }),
      },
    });
  }
}
