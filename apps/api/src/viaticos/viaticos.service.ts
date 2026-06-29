import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { AutoApprovalService } from '../workflow/auto-approval.service.js';
import {
  appendTrail,
  buildApprovalChain,
  canActOnStep,
  isTerminalApproved,
  stepRoleAt,
  type TrailEntry,
} from '../common/rbac/hierarchical-approval.js';
import { ROLES, type RoleKey } from '../common/rbac/roles.v2.js';

@Injectable()
export class ViaticosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly autoApproval: AutoApprovalService,
  ) {}

  private resolveActorRole(actor: any): RoleKey | null {
    if (actor?.isSuperAdmin) return ROLES.SUPER_ADMIN;
    const key = actor?.roleKey ?? actor?.role?.orgRoleKey;
    return key ?? null;
  }

  private amountOf(viatico: { montoSolicitado: unknown }) {
    return typeof viatico.montoSolicitado === 'object' && viatico.montoSolicitado && 'toNumber' in (viatico.montoSolicitado as object)
      ? (viatico.montoSolicitado as { toNumber: () => number }).toNumber()
      : Number(viatico.montoSolicitado) || 0;
  }

  toCSV(viatics: any[]): string {
    if (!viatics.length) return '';
    const fields = Object.keys(viatics[0]);
    const csvRows = [fields.join(',')];
    for (const row of viatics) {
      csvRows.push(
        fields
          .map((f) => {
            let val = row[f];
            if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
            if (typeof val === 'string' && val.includes(',')) val = '"' + val.replace(/"/g, '""') + '"';
            return val ?? '';
          })
          .join(','),
      );
    }
    return csvRows.join('\n');
  }

  importMany(_json: any[]): never {
    throw new Error('Modelo viatico no existe en Prisma.');
  }

  async create(dto: any) {
    if (!dto.ticketEvidenciaUrl) {
      throw new BadRequestException('Debes adjuntar el ticket o comprobante de gasto');
    }
    const viatico = await this.prisma['viatico'].create({
      data: {
        ...dto,
        approvalStep: 0,
        approvalTrail: [],
        estatus: dto.estatus ?? 'Pendiente',
      },
      include: { User: { select: { nombre: true, id: true } }, Activity: { select: { anNumber: true, id: true } } },
    });

    const amount = this.amountOf(viatico);
    if (viatico.usuarioId && viatico.User) {
      await this.notificationHierarchy.notifyViaticRequested(
        viatico.usuarioId,
        viatico.id,
        viatico.User.nombre || 'Usuario',
        amount,
      );
      this.autoApproval
        .evaluate({
          entityType: 'VIATIC',
          entityId: viatico.id,
          userId: viatico.usuarioId,
          payload: { amount, outOfPolicy: Boolean(dto?.outOfPolicy) },
        })
        .catch(() => undefined);
    }
    return viatico;
  }

  async findAll(currentUser?: any, query?: PaginationQueryDto) {
    const include = { Activity: true, User: true };
    let where: any = undefined;

    if (currentUser?.isSuperAdmin) {
      where = undefined;
    } else if (
      currentUser?.permissions?.includes('CONSOLE_ADMIN') ||
      currentUser?.permissions?.includes('viatics.manage')
    ) {
      where = {
        User: {
          AND: [
            { departmentId: currentUser.departmentId },
            { role: { accesoConsoleAdmin: false } },
          ],
        },
      };
    } else {
      where = { usuarioId: currentUser?.id };
    }

    const mapRow = (row: any) => ({ ...row, actividad: row.Activity, usuario: row.User });

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['viatico'].findMany({ where, include, orderBy: { fechaSolicitud: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma['viatico'].count({ where }),
      ]);
      return buildPaginatedResponse(data.map(mapRow), total, query);
    }

    const data = await this.prisma['viatico'].findMany({ where, include });
    return data.map(mapRow);
  }

  async findByDepartment(departmentId: number) {
    const data = await this.prisma['viatico'].findMany({
      where: { User: { departmentId } },
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({ ...row, actividad: row.Activity, usuario: row.User }));
  }

  async findByUser(userId: number) {
    const data = await this.prisma['viatico'].findMany({
      where: { usuarioId: userId },
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({ ...row, actividad: row.Activity, usuario: row.User }));
  }

  async findByAllowedUsers(userIds: number[]) {
    if (!userIds?.length) return [];
    const data = await this.prisma['viatico'].findMany({
      where: { usuarioId: { in: userIds } },
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({ ...row, actividad: row.Activity, usuario: row.User }));
  }

  findOne(id: number) {
    return this.prisma['viatico'].findUnique({
      where: { id },
      include: { Activity: true, User: true },
    });
  }

  async approveOrReject(id: number, actor: any, action: 'approve' | 'reject', note?: string) {
    const viatico = await this.findOne(id);
    if (!viatico) throw new BadRequestException('Viático no encontrado');
    if (['Rechazado', 'Aprobado', 'Pagado'].includes(viatico.estatus)) {
      throw new BadRequestException('Este viático ya fue cerrado');
    }

    const amount = this.amountOf(viatico);
    const chain = buildApprovalChain('viaticos', amount);
    const step = viatico.approvalStep ?? 0;
    const actorRole = this.resolveActorRole(actor);
    const canAct = actor?.isSuperAdmin || canActOnStep(actorRole, step, chain);

    if (!canAct) {
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
    const trail = appendTrail(viatico.approvalTrail as TrailEntry[] | null, trailEntry);

    if (action === 'reject') {
      const updated = await this.prisma['viatico'].update({
        where: { id },
        data: { estatus: 'Rechazado', approvalTrail: trail },
        include: { User: { select: { id: true, nombre: true } } },
      });
      if (updated.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(updated.usuarioId, id, 'rejected', 0);
      }
      return updated;
    }

    const nextStep = step + 1;
    if (isTerminalApproved(nextStep, chain)) {
      const contabilidadRef = `VIAT-${id}-${new Date().toISOString().slice(0, 10)}`;
      const updated = await this.prisma['viatico'].update({
        where: { id },
        data: {
          approvalStep: nextStep,
          approvalTrail: trail,
          estatus: 'Aprobado',
          contabilidadRef,
        },
        include: { User: { select: { id: true, nombre: true } }, Activity: { select: { anNumber: true } } },
      });
      if (updated.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(updated.usuarioId, id, 'approved', amount);
      }
      return updated;
    }

    return this.prisma['viatico'].update({
      where: { id },
      data: { approvalStep: nextStep, approvalTrail: trail, estatus: 'Pendiente' },
      include: { User: { select: { id: true, nombre: true } } },
    });
  }

  async markPagado(id: number) {
    const viatico = await this.findOne(id);
    if (!viatico || viatico.estatus !== 'Aprobado') {
      throw new BadRequestException('Solo viáticos aprobados por CEO pueden marcarse como pagados');
    }
    return this.prisma['viatico'].update({
      where: { id },
      data: { estatus: 'Pagado' },
    });
  }

  async update(id: number, dto: any) {
    const currentViatico = await this.findOne(id);
    const updatedViatico = await this.prisma['viatico'].update({
      where: { id },
      data: dto,
      include: { User: { select: { nombre: true, id: true } }, Activity: { select: { anNumber: true } } },
    });

    if (currentViatico && dto.estatus && currentViatico.estatus !== dto.estatus) {
      const amount = this.amountOf(updatedViatico);
      if (['Aprobado', 'APPROVED', 'Pagado'].includes(dto.estatus) && updatedViatico.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(updatedViatico.usuarioId, id, 'approved', amount);
      } else if (['Rechazado', 'REJECTED'].includes(dto.estatus) && updatedViatico.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(updatedViatico.usuarioId, id, 'rejected', 0);
      }
    }
    return updatedViatico;
  }

  remove(id: number) {
    return this.prisma['viatico'].delete({ where: { id } });
  }
}
