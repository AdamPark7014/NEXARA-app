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
import { generateViaticsReportPdf } from './viatics-report-pdf.js';

export const VIATIC_CATEGORIES = [
  'COMBUSTIBLE',
  'CASETA',
  'HOSPEDAJE',
  'ALIMENTACION',
  'TRANSPORTE',
  'OTROS',
] as const;

export type ViaticCategory = (typeof VIATIC_CATEGORIES)[number];

const CEO_NO_REQUEST = new Set<RoleKey>([ROLES.CEO, ROLES.SUPER_ADMIN]);

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
    return typeof viatico.montoSolicitado === 'object' &&
      viatico.montoSolicitado &&
      'toNumber' in (viatico.montoSolicitado as object)
      ? (viatico.montoSolicitado as { toNumber: () => number }).toNumber()
      : Number(viatico.montoSolicitado) || 0;
  }

  private assertCanRequest(actor: any) {
    const role = this.resolveActorRole(actor);
    if (actor?.isSuperAdmin || (role && CEO_NO_REQUEST.has(role))) {
      throw new ForbiddenException(
        'El dueño / CEO no solicita viáticos — solo autoriza el cierre del flujo.',
      );
    }
  }

  private normalizeCategory(raw?: string | null): ViaticCategory {
    const value = String(raw || 'OTROS')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    if ((VIATIC_CATEGORIES as readonly string[]).includes(value)) {
      return value as ViaticCategory;
    }
    return 'OTROS';
  }

  /** Resuelve SalesProject desde actividad OPS (vía OperationalProject.salesProjectId). */
  private async resolveSalesProjectId(
    actividadId?: number | null,
    projectId?: number | null,
  ): Promise<number | null> {
    if (projectId) return projectId;
    if (!actividadId) return null;
    const activity = await this.prisma.activity.findUnique({
      where: { id: actividadId },
      select: { project: { select: { salesProjectId: true } } },
    });
    return activity?.project?.salesProjectId ?? null;
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

  importMany(rows: any[]) {
    if (!Array.isArray(rows) || !rows.length) {
      throw new BadRequestException('No hay filas para importar');
    }
    throw new BadRequestException(
      'Importación masiva de viáticos deshabilitada — usa el flujo de solicitud con evidencia.',
    );
  }

  async create(dto: any, actor?: any) {
    if (actor) this.assertCanRequest(actor);
    if (!dto.ticketEvidenciaUrl) {
      throw new BadRequestException('Debes adjuntar el ticket o comprobante de gasto');
    }
    const actividadId = dto.actividadId ? Number(dto.actividadId) : null;
    let projectId = dto.projectId ? Number(dto.projectId) : null;
    projectId = await this.resolveSalesProjectId(actividadId, projectId);
    if (!actividadId && !projectId) {
      throw new BadRequestException(
        'La solicitud debe ligarse a una actividad o a un proyecto.',
      );
    }
    const vehicleId = dto.vehicleId ? Number(dto.vehicleId) : null;
    const categoria = this.normalizeCategory(dto.categoria);

    const viatico = await this.prisma['viatico'].create({
      data: {
        usuarioId: Number(dto.usuarioId),
        actividadId,
        projectId,
        vehicleId,
        categoria,
        montoSolicitado: dto.montoSolicitado,
        motivo: dto.motivo ?? null,
        ticketEvidenciaUrl: dto.ticketEvidenciaUrl,
        approvalStep: 0,
        approvalTrail: [],
        estatus: dto.estatus ?? 'Pendiente',
      },
      include: {
        User: { select: { nombre: true, id: true } },
        Activity: { select: { anNumber: true, id: true } },
        project: { select: { id: true, name: true } },
      },
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
    const include = {
      Activity: true,
      User: true,
      project: { select: { id: true, name: true } },
      vehicle: { select: { id: true, nombre: true, placas: true } },
    };
    let where: any = { deletedAt: null };

    if (currentUser?.isSuperAdmin) {
      where = { deletedAt: null };
    } else if (
      currentUser?.permissions?.includes('CONSOLE_ADMIN') ||
      currentUser?.permissions?.includes('viatics.manage')
    ) {
      const role = this.resolveActorRole(currentUser);
      if (!currentUser.departmentId || role === ROLES.CEO || role === ROLES.DIR_ADMIN || role === ROLES.CONTABILIDAD) {
        where = { deletedAt: null };
      } else {
        where = {
          deletedAt: null,
          User: {
            AND: [
              { departmentId: currentUser.departmentId },
              { role: { accesoConsoleAdmin: false } },
            ],
          },
        };
      }
    } else {
      where = { deletedAt: null, usuarioId: currentUser?.id };
    }

    const mapRow = (row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
    });

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['viatico'].findMany({
          where,
          include,
          orderBy: { fechaSolicitud: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma['viatico'].count({ where }),
      ]);
      return buildPaginatedResponse(data.map(mapRow), total, query);
    }

    const data = await this.prisma['viatico'].findMany({
      where,
      include,
      orderBy: { fechaSolicitud: 'desc' },
    });
    return data.map(mapRow);
  }

  async findByActivity(actividadId: number) {
    const data = await this.prisma['viatico'].findMany({
      where: { actividadId, deletedAt: null },
      include: { Activity: true, User: true },
      orderBy: { fechaSolicitud: 'desc' },
    });
    return data.map((row: any) => ({ ...row, actividad: row.Activity, usuario: row.User }));
  }

  async findByAllowedUsers(userIds: number[]) {
    if (!userIds?.length) return [];
    const data = await this.prisma['viatico'].findMany({
      where: { usuarioId: { in: userIds }, deletedAt: null },
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({ ...row, actividad: row.Activity, usuario: row.User }));
  }

  findOne(id: number) {
    return this.prisma['viatico'].findUnique({
      where: { id },
      include: {
        Activity: true,
        User: true,
        project: { select: { id: true, name: true } },
        vehicle: { select: { id: true, nombre: true, placas: true } },
      },
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
        include: {
          User: { select: { id: true, nombre: true } },
          Activity: { select: { anNumber: true } },
        },
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
    if (!currentViatico) throw new BadRequestException('Viático no encontrado');

    const data: Record<string, unknown> = { ...dto };
    if (dto.categoria !== undefined) data.categoria = this.normalizeCategory(dto.categoria);
    if (dto.vehicleId !== undefined) {
      data.vehicleId = dto.vehicleId ? Number(dto.vehicleId) : null;
    }
    if (dto.projectId !== undefined) {
      data.projectId = dto.projectId ? Number(dto.projectId) : null;
    }
    if (dto.actividadId !== undefined) {
      data.actividadId = dto.actividadId ? Number(dto.actividadId) : null;
    }

    const nextActividadId =
      data.actividadId !== undefined
        ? (data.actividadId as number | null)
        : currentViatico.actividadId;
    const nextProjectId =
      data.projectId !== undefined
        ? (data.projectId as number | null)
        : currentViatico.projectId;
    if (!nextActividadId && !nextProjectId) {
      throw new BadRequestException(
        'La solicitud debe ligarse a una actividad o a un proyecto.',
      );
    }

    const updatedViatico = await this.prisma['viatico'].update({
      where: { id },
      data,
      include: {
        User: { select: { nombre: true, id: true } },
        Activity: { select: { anNumber: true } },
      },
    });

    if (dto.estatus && currentViatico.estatus !== dto.estatus) {
      const amount = this.amountOf(updatedViatico);
      if (['Aprobado', 'APPROVED', 'Pagado'].includes(dto.estatus) && updatedViatico.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(
          updatedViatico.usuarioId,
          id,
          'approved',
          amount,
        );
      } else if (['Rechazado', 'REJECTED'].includes(dto.estatus) && updatedViatico.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(updatedViatico.usuarioId, id, 'rejected', 0);
      }
    }
    return updatedViatico;
  }

  remove(id: number) {
    return this.prisma['viatico'].delete({ where: { id } });
  }

  async analytics(filters: { from?: string; to?: string; projectId?: number }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.from || filters.to) {
      where.fechaSolicitud = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      };
    }

    const rows = await this.prisma['viatico'].findMany({
      where,
      include: {
        User: { select: { id: true, nombre: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { fechaSolicitud: 'desc' },
      take: 5000,
    });

    const sumMap = () => new Map<string, { name: string; total: number; count: number }>();
    const byProject = sumMap();
    const byPerson = sumMap();
    const byCategory = sumMap();
    let totalSolicitado = 0;
    let totalAprobado = 0;
    let totalPagado = 0;
    let pendientes = 0;

    for (const row of rows) {
      const amount = this.amountOf(row);
      totalSolicitado += amount;
      if (row.estatus === 'Aprobado') totalAprobado += amount;
      if (row.estatus === 'Pagado') {
        totalPagado += amount;
        totalAprobado += amount;
      }
      if (row.estatus === 'Pendiente') pendientes += 1;

      const spendStatuses = ['Aprobado', 'Pagado', 'Pendiente'];
      if (!spendStatuses.includes(row.estatus)) continue;

      const pKey = row.projectId ? String(row.projectId) : 'sin-proyecto';
      const pName = row.project?.name || 'Sin proyecto';
      const p = byProject.get(pKey) ?? { name: pName, total: 0, count: 0 };
      p.total += amount;
      p.count += 1;
      byProject.set(pKey, p);

      const uKey = String(row.usuarioId);
      const uName = row.User?.nombre || `Usuario #${row.usuarioId}`;
      const u = byPerson.get(uKey) ?? { name: uName, total: 0, count: 0 };
      u.total += amount;
      u.count += 1;
      byPerson.set(uKey, u);

      const cKey = row.categoria || 'OTROS';
      const c = byCategory.get(cKey) ?? { name: cKey, total: 0, count: 0 };
      c.total += amount;
      c.count += 1;
      byCategory.set(cKey, c);
    }

    const sortDesc = (a: { total: number }, b: { total: number }) => b.total - a.total;

    return {
      from: filters.from ?? null,
      to: filters.to ?? null,
      projectId: filters.projectId ?? null,
      totals: {
        count: rows.length,
        pendientes,
        totalSolicitado,
        totalAprobado,
        totalPagado,
      },
      byProject: [...byProject.values()].sort(sortDesc),
      byPerson: [...byPerson.values()].sort(sortDesc),
      byCategory: [...byCategory.values()].sort(sortDesc),
    };
  }

  async reportPdf(
    filters: { from?: string; to?: string; projectId?: number },
    preparedBy?: string | null,
  ) {
    const analytics = await this.analytics(filters);
    const where: Record<string, unknown> = { deletedAt: null };
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.from || filters.to) {
      where.fechaSolicitud = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
      };
    }
    const rows = await this.prisma['viatico'].findMany({
      where,
      include: {
        User: { select: { nombre: true } },
        project: { select: { name: true } },
      },
      orderBy: { fechaSolicitud: 'desc' },
      take: 200,
    });

    const periodLabel =
      filters.from || filters.to
        ? `Periodo: ${filters.from || '…'} → ${filters.to || '…'}`
        : 'Periodo: todos los registros';

    return generateViaticsReportPdf({
      title: 'Control de viáticos',
      periodLabel,
      generatedAt: new Date().toLocaleString('es-MX'),
      preparedBy,
      currency: 'MXN',
      totalSolicitado: analytics.totals.totalSolicitado,
      totalAprobado: analytics.totals.totalAprobado,
      totalPagado: analytics.totals.totalPagado,
      byProject: analytics.byProject,
      byPerson: analytics.byPerson,
      byCategory: analytics.byCategory,
      rows: rows.map((r) => ({
        id: r.id,
        fecha: r.fechaSolicitud
          ? new Date(r.fechaSolicitud).toLocaleDateString('es-MX')
          : '—',
        solicitante: r.User?.nombre || '—',
        proyecto: r.project?.name || '—',
        categoria: r.categoria || 'OTROS',
        monto: this.amountOf(r),
        estatus: r.estatus,
        contabilidadRef: r.contabilidadRef || '—',
        motivo: r.motivo || '',
      })),
    });
  }
}
