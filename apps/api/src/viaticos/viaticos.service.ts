import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service.js';
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
import { AccountingService } from '../accounting/accounting.service.js';
import { AuditService } from '../audit/audit.service.js';
import { assertCompanyAccess, resolveRequiredCompanyId, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

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
    private readonly domainEvents: DomainEventBusService,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
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

  /** Scope de listado/detalle/reportes según rol del actor. */
  private buildListWhere(currentUser?: any, companyId?: number | null): Record<string, unknown> {
    const tenant = companyWhere(companyId ?? null);
    if (!currentUser || currentUser.isSuperAdmin) {
      return { deletedAt: null, ...tenant };
    }
    if (
      currentUser.permissions?.includes('CONSOLE_ADMIN') ||
      currentUser.permissions?.includes('viatics.manage')
    ) {
      const role = this.resolveActorRole(currentUser);
      if (!currentUser.departmentId || role === ROLES.CEO || role === ROLES.DIR_ADMIN || role === ROLES.CONTABILIDAD) {
        return { deletedAt: null, ...tenant };
      }
      return {
        deletedAt: null,
        ...tenant,
        User: {
          AND: [
            { departmentId: currentUser.departmentId },
            { role: { accesoConsoleAdmin: false } },
          ],
        },
      };
    }
    return { deletedAt: null, usuarioId: currentUser.id, ...tenant };
  }

  private assertCanRequest(actor: any) {
    const role = this.resolveActorRole(actor);
    if (actor?.isSuperAdmin || (role && CEO_NO_REQUEST.has(role))) {
      throw new ForbiddenException(
        'El CEO no solicita viáticos — solo autoriza el cierre del flujo.',
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

  importMany(rows: any[], companyId?: number | null) {
    requireCompanyId(companyId);
    if (!Array.isArray(rows) || !rows.length) {
      throw new BadRequestException('No hay filas para importar');
    }
    throw new BadRequestException(
      'Importación masiva de viáticos deshabilitada — usa el flujo de solicitud con evidencia.',
    );
  }

  async create(dto: any, actor?: any, companyId?: number | null) {
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
    const resolvedCompanyId = await resolveRequiredCompanyId(
      this.prisma,
      companyId ?? (dto.companyId ? Number(dto.companyId) : null),
    );

    const viatico = await this.prisma['viatico'].create({
      data: {
        usuarioId: Number(dto.usuarioId),
        actividadId,
        projectId,
        vehicleId,
        companyId: resolvedCompanyId,
        categoria,
        origen: 'SOLICITUD',
        montoSolicitado: dto.montoSolicitado,
        motivo: dto.motivo ?? null,
        ticketEvidenciaUrl: dto.ticketEvidenciaUrl,
        approvalStep: 0,
        approvalTrail: [],
        estatus: 'Pendiente',
      },
      include: {
        User: { select: { nombre: true, id: true } },
        Activity: { select: { anNumber: true, id: true } },
        project: { select: { id: true, name: true } },
      },
    });

    const amount = this.amountOf(viatico);
    this.domainEvents.publishEntityLifecycle('created', {
      entityType: 'VIATIC',
      entityId: viatico.id,
      companyId: viatico.companyId ?? resolvedCompanyId,
      userId: viatico.usuarioId ?? undefined,
      payload: {
        estatus: viatico.estatus,
        categoria: viatico.categoria,
        montoSolicitado: amount,
        actividadId: viatico.actividadId,
        projectId: viatico.projectId,
      },
    });

    if (viatico.usuarioId && viatico.User) {
      await this.notificationHierarchy.notifyViaticRequested(
        viatico.usuarioId,
        viatico.id,
        viatico.User.nombre || 'Usuario',
        amount,
      );
      this.domainEvents.requestAutoApproval({
        entityType: 'VIATIC',
        entityId: viatico.id,
        userId: viatico.usuarioId,
        companyId: viatico.companyId ?? resolvedCompanyId,
        payload: { amount, outOfPolicy: Boolean(dto?.outOfPolicy) },
      });
    }
    return viatico;
  }

  /**
   * Asigna un viático a un usuario para una actividad/proyecto.
   * No requiere evidencia (presupuesto anticipado); entra al mismo flujo de aprobación.
   */
  async assign(dto: any, actor: any, companyId?: number | null) {
    if (!actor?.id) {
      throw new ForbiddenException('Se requiere autenticación para asignar viáticos');
    }
    const usuarioId = Number(dto.usuarioId);
    if (!usuarioId) {
      throw new BadRequestException('Debes indicar el usuario beneficiario');
    }
    const actividadId = dto.actividadId ? Number(dto.actividadId) : null;
    let projectId = dto.projectId ? Number(dto.projectId) : null;
    projectId = await this.resolveSalesProjectId(actividadId, projectId);
    if (!actividadId && !projectId) {
      throw new BadRequestException(
        'La asignación debe ligarse a una actividad o a un proyecto.',
      );
    }

    const beneficiary = await this.prisma.user.findUnique({
      where: { id: usuarioId },
      select: { id: true, nombre: true, isActive: true },
    });
    if (!beneficiary || beneficiary.isActive === false) {
      throw new BadRequestException('El usuario beneficiario no existe o está inactivo');
    }

    const vehicleId = dto.vehicleId ? Number(dto.vehicleId) : null;
    const categoria = this.normalizeCategory(dto.categoria);
    const resolvedCompanyId = await resolveRequiredCompanyId(
      this.prisma,
      companyId ?? (dto.companyId ? Number(dto.companyId) : null),
    );
    const motivo =
      dto.motivo ??
      dto.concepto ??
      `Viático asignado${actividadId ? ` · OT #${actividadId}` : ''}`;

    const viatico = await this.prisma['viatico'].create({
      data: {
        usuarioId,
        actividadId,
        projectId,
        vehicleId,
        companyId: resolvedCompanyId,
        categoria,
        origen: 'ASIGNACION',
        asignadoPorId: Number(actor.id),
        montoSolicitado: dto.montoSolicitado,
        motivo,
        ticketEvidenciaUrl: null,
        approvalStep: 0,
        approvalTrail: [],
        estatus: 'Pendiente',
      },
      include: {
        User: { select: { nombre: true, id: true } },
        Activity: { select: { anNumber: true, id: true } },
        project: { select: { id: true, name: true } },
        asignadoPor: { select: { id: true, nombre: true } },
      },
    });

    const amount = this.amountOf(viatico);
    const assignerName = actor?.nombre || 'Administración';
    await this.notificationHierarchy.notifyViaticAssignedToUser(
      usuarioId,
      viatico.id,
      assignerName,
      amount,
      motivo,
    );
    await this.notificationHierarchy.notifyViaticRequested(
      usuarioId,
      viatico.id,
      `${beneficiary.nombre} (asignado por ${assignerName})`,
      amount,
    );
    this.domainEvents.requestAutoApproval({
      entityType: 'VIATIC',
      entityId: viatico.id,
      userId: usuarioId,
      companyId: viatico.companyId ?? resolvedCompanyId,
      payload: { amount, outOfPolicy: false, origen: 'ASIGNACION' },
    });

    return viatico;
  }

  async findAll(currentUser?: any, query?: PaginationQueryDto, companyId?: number | null) {
    const include = {
      Activity: true,
      User: true,
      project: { select: { id: true, name: true } },
      vehicle: { select: { id: true, nombre: true, placas: true } },
    };
    const where = this.buildListWhere(currentUser, companyId);

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

  async findOne(id: number, currentUser?: any, companyId?: number | null) {
    const where = { id, ...this.buildListWhere(currentUser, companyId) };
    const row = await this.prisma['viatico'].findFirst({
      where,
      include: {
        Activity: true,
        User: true,
        project: { select: { id: true, name: true } },
        vehicle: { select: { id: true, nombre: true, placas: true } },
      },
    });
    if (!row && currentUser) {
      const exists = await this.prisma['viatico'].findUnique({ where: { id }, select: { id: true } });
      if (exists) throw new ForbiddenException('No tienes acceso a este viático');
    }
    if (row) assertCompanyAccess(row, companyId, 'Viático');
    return row;
  }

  async approveOrReject(
    id: number,
    actor: any,
    action: 'approve' | 'reject',
    note?: string,
    companyId?: number | null,
  ) {
    const viatico = await this.findOne(id, undefined, companyId);
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

    // Reclama el registro condicionado a su estatus/paso ya leídos: si otra
    // aprobación/rechazo concurrente ya lo movió, esta actualización afecta 0
    // filas en vez de aplicarse igual sobre un estado obsoleto y duplicar el
    // avance del flujo (p. ej. dos clics rápidos en "Aprobar").
    const claimWhere = { id, estatus: viatico.estatus, approvalStep: viatico.approvalStep };

    if (action === 'reject') {
      const claim = await this.prisma['viatico'].updateMany({
        where: claimWhere,
        data: { estatus: 'Rechazado', approvalTrail: trail },
      });
      if (claim.count === 0) throw new BadRequestException('Este viático ya fue actualizado por otra solicitud');
      const updated = await this.prisma['viatico'].findUnique({
        where: { id },
        include: { User: { select: { id: true, nombre: true } } },
      });
      if (updated?.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(updated.usuarioId, id, 'rejected', 0);
      }
      await this.audit
        .log({ entityType: 'Viatico', entityId: id, action: 'REJECT', changes: { note } }, actor?.id)
        .catch(() => undefined);
      return updated;
    }

    const nextStep = step + 1;
    if (isTerminalApproved(nextStep, chain)) {
      const contabilidadRef = `VIAT-${id}-${new Date().toISOString().slice(0, 10)}`;
      const claim = await this.prisma['viatico'].updateMany({
        where: claimWhere,
        data: {
          approvalStep: nextStep,
          approvalTrail: trail,
          estatus: 'Aprobado',
          contabilidadRef,
        },
      });
      if (claim.count === 0) throw new BadRequestException('Este viático ya fue actualizado por otra solicitud');
      const updated = await this.prisma['viatico'].findUnique({
        where: { id },
        include: {
          User: { select: { id: true, nombre: true } },
          Activity: { select: { anNumber: true } },
        },
      });
      if (updated?.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(updated.usuarioId, id, 'approved', amount);
      }
      await this.audit
        .log({ entityType: 'Viatico', entityId: id, action: 'APPROVE', changes: { contabilidadRef } }, actor?.id)
        .catch(() => undefined);
      return updated;
    }

    const claim = await this.prisma['viatico'].updateMany({
      where: claimWhere,
      data: { approvalStep: nextStep, approvalTrail: trail, estatus: 'Pendiente' },
    });
    if (claim.count === 0) throw new BadRequestException('Este viático ya fue actualizado por otra solicitud');
    await this.audit
      .log(
        { entityType: 'Viatico', entityId: id, action: 'APPROVE_STEP', changes: { nextStep } },
        actor?.id,
      )
      .catch(() => undefined);
    return this.prisma['viatico'].findUnique({
      where: { id },
      include: { User: { select: { id: true, nombre: true } } },
    });
  }

  async markPagado(id: number, actorId?: number, companyId?: number | null) {
    const viatico = await this.findOne(id, undefined, companyId);
    if (!viatico || viatico.estatus !== 'Aprobado') {
      throw new BadRequestException('Solo viáticos aprobados por CEO pueden marcarse como pagados');
    }

    let journalEntryId = viatico.journalEntryId as number | null | undefined;
    let contabilidadRef = viatico.contabilidadRef as string | null | undefined;
    if (!journalEntryId && actorId) {
      const entry = await this.accounting.postOperationalDisbursement({
        kind: 'viatic',
        entityId: id,
        amount: this.amountOf(viatico),
        date: viatico.fechaSolicitud,
        description: `Pago viático #${id}: ${viatico.motivo || viatico.categoria || 'Viático'}`,
        userId: actorId,
      });
      journalEntryId = entry.id;
      contabilidadRef = entry.entryNumber;
    }

    const updated = await this.prisma['viatico'].update({
      where: { id },
      data: {
        estatus: 'Pagado',
        journalEntryId: journalEntryId ?? undefined,
        contabilidadRef: contabilidadRef || `VIAT-${id}-${new Date().toISOString().slice(0, 10)}`,
      },
      include: { User: { select: { id: true, nombre: true } }, journalEntry: true },
    });
    await this.audit
      .log(
        {
          entityType: 'Viatico',
          entityId: id,
          action: 'MARK_PAID',
          changes: { journalEntryId, contabilidadRef },
        },
        actorId,
      )
      .catch(() => undefined);
    return updated;
  }

  async update(id: number, dto: any, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const currentViatico = await this.prisma['viatico'].findFirst({
      where: { id, deletedAt: null, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(currentViatico, tenantId, 'Viático');

    // Solo campos editables — estatus/approval/usuarioId solo vía approve/pagado.
    const allowed = [
      'categoria',
      'motivo',
      'montoSolicitado',
      'ticketEvidenciaUrl',
      'projectId',
      'actividadId',
      'vehicleId',
    ] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (dto[key] !== undefined) data[key] = dto[key];
    }
    if (data.categoria !== undefined) {
      data.categoria = this.normalizeCategory(data.categoria as string | null | undefined);
    }
    if (data.vehicleId !== undefined) {
      data.vehicleId = data.vehicleId ? Number(data.vehicleId) : null;
    }
    if (data.projectId !== undefined) {
      data.projectId = data.projectId ? Number(data.projectId) : null;
    }
    if (data.actividadId !== undefined) {
      data.actividadId = data.actividadId ? Number(data.actividadId) : null;
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

    return this.prisma['viatico'].update({
      where: { id },
      data,
      include: {
        User: { select: { nombre: true, id: true } },
        Activity: { select: { anNumber: true } },
      },
    });
  }

  async remove(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const existing = await this.prisma['viatico'].findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(existing, tenantId, 'Viático');
    return this.prisma['viatico'].delete({ where: { id } });
  }

  async analytics(filters: { from?: string; to?: string; projectId?: number }, currentUser?: any) {
    const where: Record<string, unknown> = { ...this.buildListWhere(currentUser) };
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
    currentUser?: any,
  ) {
    const analytics = await this.analytics(filters, currentUser);
    const where: Record<string, unknown> = { ...this.buildListWhere(currentUser) };
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

  /** Aprobación vía workflow — idempotente si ya no está pendiente. */
  async onWorkflowApproved(id: number, companyId: number, actorId?: number) {
    const viatico = await this.prisma['viatico'].findFirst({
      where: { id, estatus: 'Pendiente', ...companyWhere(companyId) },
    });
    if (!viatico) return;

    const contabilidadRef = `VIAT-${id}-${new Date().toISOString().slice(0, 10)}`;
    const claim = await this.prisma['viatico'].updateMany({
      where: { id, estatus: 'Pendiente' },
      data: { estatus: 'Aprobado', contabilidadRef },
    });
    if (claim.count === 0) return;

    const updated = await this.prisma['viatico'].findUnique({
      where: { id },
      include: { User: { select: { id: true, nombre: true } } },
    });
    if (updated?.usuarioId) {
      const amount = this.amountOf(updated);
      await this.notificationHierarchy.notifyViaticReview(updated.usuarioId, id, 'approved', amount);
    }
    await this.audit
      .log({ entityType: 'Viatico', entityId: id, action: 'APPROVE_WORKFLOW' }, actorId)
      .catch(() => undefined);
  }

  async onWorkflowRejected(id: number, companyId: number, actorId?: number, note?: string) {
    const viatico = await this.findOne(id, undefined, companyId);
    if (!viatico || ['Rechazado', 'Aprobado', 'Pagado'].includes(viatico.estatus)) return;

    const trailEntry: TrailEntry = {
      role: 'workflow',
      userId: actorId ?? 0,
      userName: 'Workflow',
      action: 'reject',
      at: new Date().toISOString(),
      note: note?.trim() || 'Rechazado en flujo de aprobación',
    };
    const trail = appendTrail(viatico.approvalTrail as TrailEntry[] | null, trailEntry);

    const claim = await this.prisma['viatico'].updateMany({
      where: { id, estatus: viatico.estatus },
      data: { estatus: 'Rechazado', approvalTrail: trail },
    });
    if (claim.count === 0) return;

    if (viatico.usuarioId) {
      void this.notificationHierarchy
        .notifyViaticReview(viatico.usuarioId, id, 'rejected', 0)
        .catch(() => undefined);
    }
    await this.audit
      .log({ entityType: 'Viatico', entityId: id, action: 'REJECT', changes: { note } }, actorId)
      .catch(() => undefined);
  }
}
