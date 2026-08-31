import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service.js';
import { PdfGeneratorService } from './pdf-generator.service.js';
import { generateSalesReportPdf } from './sales-report-pdf.js';
import fs from 'fs/promises';
import path from 'path';
import { CreateSalesClientDto } from './dto/create-sales-client.dto.js';
import { UpdateSalesClientDto } from './dto/update-sales-client.dto.js';
import { CreateSalesLeadDto } from './dto/create-sales-lead.dto.js';
import { UpdateSalesLeadDto } from './dto/update-sales-lead.dto.js';
import { CreateSalesOpportunityDto } from './dto/create-sales-opportunity.dto.js';
import { UpdateSalesOpportunityDto } from './dto/update-sales-opportunity.dto.js';
import { CreateSalesOpportunityNoteDto } from './dto/create-sales-opportunity-note.dto.js';
import { CreateSalesOpportunityQuoteDto } from './dto/create-sales-opportunity-quote.dto.js';
import { CreateSalesProjectDto } from './dto/create-sales-project.dto.js';
import { UpdateSalesProjectDto } from './dto/update-sales-project.dto.js';
import { CreateOrderTemplateDto } from './dto/create-order-template.dto.js';
import { UpdateOrderTemplateDto } from './dto/update-order-template.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isSalesTeamLeadUser } from '../common/org-roles.js';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service.js';
import { opsPatchFromSales } from '../common/project-handoff.js';
import { assertCompanyAccess, companyWhere, requireCompanyId, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';
import { appUrls } from '../common/app-urls.js';
import { AuditService } from '../audit/audit.service.js';
import { ServiceClientsService } from '../service-clients/service-clients.service.js';

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CotizacionesService)) private readonly cotizacionesService: CotizacionesService,
    private readonly pdfGeneratorService: PdfGeneratorService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly notificationsService: NotificationsService,
    private readonly domainEvents: DomainEventBusService,
    private readonly serviceClientsService: ServiceClientsService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private isSuperAdminUser(user?: any) {
    return Boolean(user?.isSuperAdmin);
  }

  private isConsoleAdminUser(user?: any) {
    return isSalesTeamLeadUser(user);
  }

  /**
   * Devuelve true si el usuario debe ver métricas del equipo completo.
   * Cubre tanto roles legacy (v1) como v2 (roleKey).
   * - SuperAdmin / Console admin / Sales team lead → team view
   * - v2 tier >= 70 (coord_ventas, coordinadores, directores, CEO) → team view
   * - Resto (vendedor, etc.) → solo sus propios registros
   */
  private isSalesTeamManager(user?: any): boolean {
    if (!user) return false;
    if (this.isSuperAdminUser(user)) return true;
    if (this.isConsoleAdminUser(user)) return true;
    // v2 role check: coord_ventas y cualquier rol de tier >= 70
    const V2_MANAGER_ROLES = new Set([
      'ceo', 'dir_admin', 'dir_operaciones', 'arquitecto',
      'coord_ventas', 'coord_operaciones', 'coord_admin',
    ]);
    if (user.roleKey && V2_MANAGER_ROLES.has(user.roleKey)) return true;
    return false;
  }

  private canAccessOwner(user: any, ownerId?: number | null) {
    if (!ownerId) return true;
    if (this.isSuperAdminUser(user)) return true;
    if (this.isConsoleAdminUser(user)) return true;
    return user?.id === ownerId;
  }

  private assertOwnerAccess(ownerId: number | null | undefined, user: any, resource = 'recurso') {
    if (!this.canAccessOwner(user, ownerId)) {
      throw new ForbiddenException(`No tienes acceso a este ${resource}`);
    }
  }

  private resolveOwnerForWrite(desiredOwnerId: number | null | undefined, user: any, currentOwnerId?: number | null) {
    if (this.isSuperAdminUser(user)) return desiredOwnerId ?? currentOwnerId ?? null;
    const candidate = desiredOwnerId ?? currentOwnerId ?? user?.id ?? null;
    if (candidate && candidate !== user?.id) {
      throw new ForbiddenException('No puedes asignar este recurso a otro usuario');
    }
    return candidate;
  }

  private buildOwnerWhere(user?: any) {
    if (this.isSuperAdminUser(user) || this.isConsoleAdminUser(user)) return {};
    return user?.id ? { ownerId: user.id } : {};
  }

  private buildProjectOwnerWhere(user?: any) {
    if (this.isSuperAdminUser(user) || this.isConsoleAdminUser(user)) return {};
    return user?.id ? { opportunity: { ownerId: user.id } } : {};
  }

  private buildScopedOwnerWhere(user?: any, ownerId?: number) {
    const base = this.buildOwnerWhere(user);
    if (!ownerId || Number.isNaN(ownerId)) return base;
    if (!this.canAccessOwner(user, ownerId)) {
      throw new ForbiddenException('No tienes acceso al vendedor seleccionado');
    }
    return { ...(base as any), ownerId };
  }

  private buildScopedProjectOwnerWhere(user?: any, ownerId?: number) {
    const base = this.buildProjectOwnerWhere(user);
    if (!ownerId || Number.isNaN(ownerId)) return base;
    if (!this.canAccessOwner(user, ownerId)) {
      throw new ForbiddenException('No tienes acceso al vendedor seleccionado');
    }
    if (this.isSuperAdminUser(user) || this.isConsoleAdminUser(user)) {
      return { opportunity: { ownerId } };
    }
    return base;
  }

  private getPeriodStart(period: 'week' | 'month' | 'year') {
    const now = new Date();
    const startDate = new Date(now);
    if (period === 'week') {
      startDate.setDate(now.getDate() - now.getDay());
    } else if (period === 'month') {
      startDate.setDate(1);
    } else if (period === 'year') {
      startDate.setMonth(0, 1);
    }
    startDate.setHours(0, 0, 0, 0);
    return startDate;
  }

  private getPeriodRange(period: 'week' | 'month' | 'year') {
    const start = this.getPeriodStart(period);
    const end = new Date();
    return { start, end };
  }

  private toDate(value?: string | Date | null) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  private normalizeDateTimeInput(value: string | Date | null | undefined, fieldName: string) {
    if (value === undefined) return undefined;
    if (value === null) return null;

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new BadRequestException(`Formato inválido para ${fieldName}. Usa fecha ISO-8601`);
      }
      return value;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Formato inválido para ${fieldName}. Usa fecha ISO-8601`);
    }

    return parsed;
  }

  private validateNextActionPlan(
    stage: string | undefined,
    description?: string | null,
    expectedCloseDate?: string | Date | null,
  ) {
    const currentStage = stage || 'DISCOVERY';
    if (currentStage === 'WON' || currentStage === 'LOST') return;

    const summary = (description || '').trim();
    if (summary.length < 10) {
      throw new BadRequestException('Debes definir la próxima acción con al menos 10 caracteres');
    }

    const actionDate = this.toDate(expectedCloseDate);
    if (!actionDate) {
      throw new BadRequestException('Debes definir la fecha de próxima acción para oportunidades activas');
    }
  }

  private async getQuotaMap(period: 'week' | 'month' | 'year', ownerIds: number[]) {
    if (ownerIds.length === 0) return new Map<number, { targetRevenue: number; targetOpportunities: number }>();
    const { start } = this.getPeriodRange(period);
    const events = await this.prisma.auditLog.findMany({
      where: {
        action: 'quota.set',
        source: 'sales',
        createdAt: { gte: start },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        changes: true,
      },
    });

    const quotaMap = new Map<number, { targetRevenue: number; targetOpportunities: number }>();
    for (const event of events) {
      const metadata = (event?.changes || {}) as any;
      if (metadata?.period !== period) continue;
      const ownerId = Number(metadata?.ownerId || 0);
      if (!ownerId || !ownerIds.includes(ownerId)) continue;
      if (quotaMap.has(ownerId)) continue;

      quotaMap.set(ownerId, {
        targetRevenue: Number(metadata?.targetRevenue || 0),
        targetOpportunities: Number(metadata?.targetOpportunities || 0),
      });
    }

    return quotaMap;
  }

  async createAuditEvent(payload: {
    action: string;
    entityType: string;
    entityId?: number | null;
    actorId?: number | null;
    metadata?: unknown;
    companyId?: number | null;
  }) {
    // Iter 10: AuditLog es la fuente de verdad; SalesAuditEvent queda solo lectura legacy.
    const logged = await this.audit?.log(
      {
        entityType: `Sales:${payload.entityType}`,
        entityId: Number(payload.entityId || 0),
        action: payload.action,
        changes: payload.metadata,
        companyId: payload.companyId ?? null,
        source: 'sales',
      },
      payload.actorId ?? undefined,
    );

    if (process.env.SALES_AUDIT_DUAL_WRITE === 'true') {
      const salesAuditEvent = (this.prisma as any).salesAuditEvent;
      await salesAuditEvent.create({
        data: {
          action: payload.action,
          entityType: payload.entityType,
          entityId: payload.entityId ?? null,
          actorId: payload.actorId ?? null,
          metadata: payload.metadata as any,
        },
      });
    }

    return logged ?? { ok: true, action: payload.action };
  }

  async listAuditEvents(
    period: 'week' | 'month' | 'year' = 'month',
    limit = 50,
    user?: any,
    companyId?: number | null,
  ) {
    const startDate = this.getPeriodStart(period);
    const safeLimit = Math.min(Math.max(limit || 50, 1), 300);
    const where: any = {
      createdAt: { gte: startDate },
      source: 'sales',
      ...companyWhere(companyId ?? null),
      ...(this.isSuperAdminUser(user) ? {} : user?.id ? { userId: user.id } : {}),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      include: {
        user: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
    // Compat UI legacy (SalesAuditEvent.actor)
    return rows.map((r) => ({
      ...r,
      actor: r.user,
      metadata: r.changes,
      entityType: String(r.entityType || '').replace(/^Sales:/, ''),
    }));
  }

  async createClient(dto: CreateSalesClientDto, user?: any, companyId?: number | null) {
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user);
    const resolvedCompanyId = await resolveRequiredCompanyId(this.prisma, companyId);
    const created = await this.prisma.salesClient.create({
      data: {
        name: dto.name,
        legalName: dto.legalName || null,
        taxId: dto.taxId || null,
        fiscalAddress: dto.fiscalAddress || null,
        fiscalZipCode: dto.fiscalZipCode?.trim() || null,
        fiscalRegime: dto.fiscalRegime?.trim() || null,
        billingEmail: dto.billingEmail || null,
        billingPhone: dto.billingPhone || null,
        industry: dto.industry || null,
        website: dto.website || null,
        status: dto.status || null,
        notes: dto.notes || null,
        ownerId,
        serviceClientId: dto.serviceClientId ?? null,
        companyId: resolvedCompanyId,
      },
      include: { documents: true, opportunities: true, serviceClient: { select: { id: true, name: true, isActive: true, accountCode: true } } },
    });
    if (user?.id) {
      const actorName = String(user.nombre || 'Usuario').trim() || 'Usuario';
      void this.notificationHierarchy
        .notifySalesClientCreated(user.id, created.id, created.name, actorName)
        .catch(() => undefined);
    }

    this.domainEvents.publishEntityLifecycle('created', {
      entityType: 'SALES_CLIENT',
      entityId: created.id,
      companyId: created.companyId,
      userId: user?.id,
      payload: {
        name: created.name,
        status: created.status,
        ownerId: created.ownerId,
        serviceClientId: created.serviceClientId,
      },
    });

    // P0-E: todo cliente comercial queda vinculado a operación/portal
    if (!created.serviceClientId) {
      try {
        const provisioned = await this.provisionServiceClient(created.id, user, resolvedCompanyId);
        return provisioned.salesClient;
      } catch {
        // No bloquear alta comercial si falla OPS; se puede provisionar después
        return created;
      }
    }
    return created;
  }

  async listClients(user?: any, ownerId?: number, query?: PaginationQueryDto, companyId?: number | null) {
    const where = { ...this.buildScopedOwnerWhere(user, ownerId), ...companyWhere(companyId ?? null) };
    const include = {
      documents: true,
      opportunities: true,
      serviceClient: { select: { id: true, name: true, isActive: true, accountCode: true } },
    };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.salesClient.findMany({ where, orderBy: { updatedAt: 'desc' }, include, skip: query.skip, take: query.take }),
        this.prisma.salesClient.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.salesClient.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include,
    });
  }

  async getClient(id: number, user?: any, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const client = await this.prisma.salesClient.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: { documents: true, opportunities: true, serviceClient: { select: { id: true, name: true, isActive: true, accountCode: true } } },
    });
    assertCompanyAccess(client, tenantId, 'Cliente');
    this.assertOwnerAccess(client!.ownerId, user, 'cliente');
    return client!;
  }

  /** Facturas CFDI vinculadas al cliente comercial (ERP ↔ CRM). */
  async listClientInvoices(clientId: number, user?: any, companyId?: number | null) {
    await this.getClient(clientId, user, companyId);
    return this.prisma.invoice.findMany({
      where: { clientId, deletedAt: null },
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        issueDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        currency: true,
        cfdiUuid: true,
        pdfUrl: true,
        salesProjectOrder: {
          select: {
            orderId: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  /** Vista 360° CRM: agrega operación, finanzas y soporte vía service client vinculado. */
  async getClientSnapshot(id: number, user?: any, companyId?: number | null) {
    const salesClient = await this.getClient(id, user, companyId);
    const opportunities = salesClient.opportunities ?? [];
    const emptyStats = {
      branches: 0,
      activities: 0,
      operationalProjects: 0,
      maintenanceContracts: 0,
      ticketRequests: 0,
      activitiesLast90d: 0,
      activitiesOpen: 0,
      opportunitiesOpen: opportunities.filter((o: any) => o.stage !== 'WON' && o.stage !== 'LOST').length,
      pipelineValue: opportunities
        .filter((o: any) => o.stage !== 'WON' && o.stage !== 'LOST')
        .reduce((acc: number, o: any) => acc + Number(o.value || 0), 0),
      activeContracts: 0,
      monthlyContractRevenue: 0,
      pendingInvoices: 0,
      totalSalesProjects: 0,
    };

    if (!salesClient.serviceClientId) {
      return {
        salesClient,
        linked: false,
        client: null,
        stats: emptyStats,
        activities: [],
        operationalProjects: [],
        salesProjects: [],
        maintenanceContracts: [],
        ticketRequests: [],
        quotes: [],
        opportunities,
        invoices: [],
      };
    }

    const snapshot = await this.serviceClientsService.clientSnapshot(
      salesClient.serviceClientId,
      companyId,
    );
    return { salesClient, linked: true, ...snapshot };
  }

  async updateClient(id: number, dto: UpdateSalesClientDto, user?: any, companyId?: number | null) {
    const existing = await this.getClient(id, user, companyId);
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user, existing.ownerId);
    const updated = await this.prisma.salesClient.update({
      where: { id },
      data: {
        name: dto.name,
        legalName: dto.legalName,
        taxId: dto.taxId,
        fiscalAddress: dto.fiscalAddress,
        fiscalZipCode: dto.fiscalZipCode?.trim() ?? undefined,
        fiscalRegime: dto.fiscalRegime?.trim() ?? undefined,
        billingEmail: dto.billingEmail,
        billingPhone: dto.billingPhone,
        industry: dto.industry,
        website: dto.website,
        status: dto.status,
        notes: dto.notes,
        ownerId,
        serviceClientId: dto.serviceClientId,
      },
      include: { documents: true, opportunities: true, serviceClient: { select: { id: true, name: true, isActive: true, accountCode: true } } },
    });

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'SALES_CLIENT',
      entityId: updated.id,
      companyId: updated.companyId,
      userId: user?.id,
      payload: {
        name: updated.name,
        status: updated.status,
        ownerId: updated.ownerId,
        serviceClientId: updated.serviceClientId,
      },
    });

    return updated;
  }

  async deleteClient(id: number, user?: any, companyId?: number | null) {
    await this.getClient(id, user, companyId);
    return this.prisma.salesClient.delete({ where: { id } });
  }

  /** Crea o devuelve el ServiceClient operativo vinculado a un cliente comercial. */
  async provisionServiceClient(id: number, user?: any, companyId?: number | null) {
    const salesClient = await this.getClient(id, user, companyId);
    if (salesClient.serviceClientId) {
      const existing = await this.prisma.serviceClient.findUnique({
        where: { id: salesClient.serviceClientId },
      });
      if (existing) {
        return { salesClient, serviceClient: existing, created: false };
      }
    }

    const accountCode = salesClient.taxId?.trim() || `SC-${salesClient.id}`;
    const resolvedCompanyId = await resolveRequiredCompanyId(this.prisma, salesClient.companyId);
    const serviceClient = await this.prisma.serviceClient.create({
      data: {
        name: salesClient.legalName?.trim() || salesClient.name,
        contactName: salesClient.name,
        contactEmail: salesClient.billingEmail,
        contactPhone: salesClient.billingPhone,
        address: salesClient.fiscalAddress,
        accountCode,
        isActive: true,
        companyId: resolvedCompanyId,
      },
    });

    const updated = await this.prisma.salesClient.update({
      where: { id },
      data: { serviceClientId: serviceClient.id },
      include: {
        documents: true,
        opportunities: true,
        serviceClient: { select: { id: true, name: true, isActive: true, accountCode: true } },
      },
    });

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'SALES_CLIENT',
      entityId: updated.id,
      companyId: updated.companyId,
      userId: user?.id,
      payload: {
        name: updated.name,
        status: updated.status,
        ownerId: updated.ownerId,
        serviceClientId: updated.serviceClientId,
        provisioned: true,
        serviceClientAccountCode: serviceClient.accountCode,
      },
    });

    return { salesClient: updated, serviceClient, created: true };
  }

  async addClientDocuments(clientId: number, type: string, files: Array<{ url: string; name?: string }>, user?: any, companyId?: number | null) {
    const client = await this.getClient(clientId, user, companyId);
    const existingCount = await this.prisma.salesClientDocument.count({
      where: { clientId, type },
    });
    const docs = files.map((file, index) => ({
      clientId,
      type,
      fileUrl: file.url,
      fileName: file.name || null,
      version: existingCount + index + 1,
      uploadedById: user?.id || null,
    }));
    await this.prisma.salesClientDocument.createMany({ data: docs });
    return this.prisma.salesClientDocument.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLead(dto: CreateSalesLeadDto, user?: any, companyId?: number | null) {
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user);
    const resolvedCompanyId = await resolveRequiredCompanyId(this.prisma, companyId);
    const created = await this.prisma.salesLead.create({
      data: {
        name: dto.name || null,
        company: dto.company || null,
        email: dto.email || null,
        phone: dto.phone || null,
        source: dto.source || null,
        status: dto.status,
        score: dto.score ?? 0,
        notes: dto.notes || null,
        clientId: dto.clientId ?? null,
        createdById: user?.id || null,
        ownerId,
        companyId: resolvedCompanyId,
      },
    });
    if (user?.id) {
      const label =
        (created.company && String(created.company).trim()) ||
        (created.name && String(created.name).trim()) ||
        `Lead #${created.id}`;
      const actorName = String(user.nombre || 'Usuario').trim() || 'Usuario';
      void this.notificationHierarchy
        .notifySalesLeadCreated(user.id, created.id, label, actorName)
        .catch(() => undefined);
    }
    return created;
  }

  async listLeads(user?: any, ownerId?: number, query?: PaginationQueryDto, companyId?: number | null) {
    const where = { ...this.buildScopedOwnerWhere(user, ownerId), ...companyWhere(companyId ?? null) };
    const include = { client: true, opportunities: true };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.salesLead.findMany({ where, orderBy: { updatedAt: 'desc' }, include, skip: query.skip, take: query.take }),
        this.prisma.salesLead.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.salesLead.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include,
    });
  }

  async getLead(id: number, user?: any, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const lead = await this.prisma.salesLead.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: { client: true, opportunities: true },
    });
    assertCompanyAccess(lead, tenantId, 'Lead');
    this.assertOwnerAccess(lead!.ownerId, user, 'lead');
    return lead!;
  }

  async updateLead(id: number, dto: UpdateSalesLeadDto, user?: any, companyId?: number | null) {
    const existing = await this.getLead(id, user, companyId);
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user, existing.ownerId);
    return this.prisma.salesLead.update({
      where: { id },
      data: {
        name: dto.name,
        company: dto.company,
        email: dto.email,
        phone: dto.phone,
        source: dto.source,
        status: dto.status,
        score: dto.score,
        notes: dto.notes,
        clientId: dto.clientId,
        ownerId,
      },
    });
  }

  async deleteLead(id: number, user?: any, companyId?: number | null) {
    await this.getLead(id, user, companyId);
    return this.prisma.salesLead.delete({ where: { id } });
  }

  async createOpportunity(dto: CreateSalesOpportunityDto, user?: any, companyId?: number | null) {
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user);
    const stage = dto.stage || 'DISCOVERY';
    const expectedCloseDate = this.normalizeDateTimeInput(dto.expectedCloseDate, 'expectedCloseDate');
    this.validateNextActionPlan(stage, dto.description, expectedCloseDate);
    const resolvedCompanyId =
      companyId ??
      (
        await this.prisma.companyProfile.findFirst({
          where: { isPrimary: true, isActive: true },
          select: { id: true },
        })
      )?.id;
    if (resolvedCompanyId == null) {
      throw new BadRequestException('Empresa requerida para crear oportunidad');
    }
    const created = await this.prisma.salesOpportunity.create({
      data: {
        title: dto.title,
        description: dto.description || null,
        stage,
        value: dto.value ?? 0,
        probability: dto.probability ?? 0,
        expectedCloseDate: expectedCloseDate ?? null,
        clientId: dto.clientId ?? null,
        leadId: dto.leadId ?? null,
        ownerId,
        companyId: resolvedCompanyId,
      },
      include: { client: true, lead: true },
    });
    if (user?.id) {
      const actorName = String(user.nombre || 'Usuario').trim() || 'Usuario';
      void this.notificationHierarchy
        .notifySalesOpportunityCreated(user.id, created.id, created.title, actorName)
        .catch(() => undefined);
    }
    return created;
  }

  async listOpportunities(user?: any, ownerId?: number, query?: PaginationQueryDto, companyId?: number | null) {
    const where = { ...this.buildScopedOwnerWhere(user, ownerId), ...companyWhere(companyId ?? null) };
    const include = { client: true, lead: true, notes: true, evidences: true, quotes: true };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.salesOpportunity.findMany({ where, orderBy: { updatedAt: 'desc' }, include, skip: query.skip, take: query.take }),
        this.prisma.salesOpportunity.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.salesOpportunity.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include,
    });
  }

  async getOpportunity(id: number, user?: any, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const opp = await this.prisma.salesOpportunity.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: {
        client: true,
        lead: true,
        notes: true,
        evidences: true,
        quotes: true,
        projects: { select: { id: true, name: true, status: true, budget: true } },
      },
    });
    assertCompanyAccess(opp, tenantId, 'Oportunidad');
    this.assertOwnerAccess(opp!.ownerId, user, 'oportunidad');
    return opp!;
  }

  async updateOpportunity(id: number, dto: UpdateSalesOpportunityDto, user?: any, companyId?: number | null) {
    const existing = await this.getOpportunity(id, user, companyId);
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user, existing.ownerId);
    const mergedStage = dto.stage || existing.stage;
    const mergedDescription = dto.description ?? existing.description;
    const normalizedExpectedCloseDate = this.normalizeDateTimeInput(dto.expectedCloseDate, 'expectedCloseDate');
    const normalizedClosedAt = this.normalizeDateTimeInput(dto.closedAt, 'closedAt');
    const mergedExpectedCloseDate = normalizedExpectedCloseDate ?? existing.expectedCloseDate;
    this.validateNextActionPlan(mergedStage, mergedDescription, mergedExpectedCloseDate);

    const updated = await this.prisma.salesOpportunity.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        stage: dto.stage,
        value: dto.value,
        probability: dto.probability,
        expectedCloseDate: normalizedExpectedCloseDate,
        closedAt: normalizedClosedAt,
        clientId: dto.clientId,
        leadId: dto.leadId,
        ownerId,
      },
      include: { client: true, lead: true, notes: true, evidences: true, quotes: true },
    });

    if (user?.id && dto.stage !== undefined && dto.stage !== existing.stage) {
      const actorName = String(user.nombre || 'Usuario').trim() || 'Usuario';
      void this.notificationHierarchy
        .notifySalesOpportunityStageChanged(
          user.id,
          updated.id,
          updated.title,
          String(existing.stage),
          String(updated.stage),
          actorName,
        )
        .catch(() => undefined);
    }

    if (updated.stage === 'WON' && existing.stage !== 'WON') {
      void this.autoEnsureSalesProjectFromWonOpportunity(updated.id, user?.id).catch(() => undefined);
      this.domainEvents.publishEntityLifecycle('updated', {
        entityType: 'SALES_OPPORTUNITY',
        entityId: updated.id,
        companyId: updated.companyId,
        userId: user?.id,
        payload: {
          stage: 'WON',
          opportunityId: updated.id,
          title: updated.title,
          value: Number(updated.value || 0),
          clientId: updated.clientId,
          ownerId: updated.ownerId,
        },
      });
    }
    if (updated.stage === 'LOST' && existing.stage !== 'LOST') {
      this.domainEvents.publishEntityLifecycle('updated', {
        entityType: 'SALES_OPPORTUNITY',
        entityId: updated.id,
        companyId: updated.companyId,
        userId: user?.id,
        payload: {
          stage: 'LOST',
          opportunityId: updated.id,
          title: updated.title,
          value: Number(updated.value || 0),
          clientId: updated.clientId,
          ownerId: updated.ownerId,
        },
      });
    }

    return updated;
  }

  async deleteOpportunity(id: number, user?: any, companyId?: number | null) {
    await this.getOpportunity(id, user, companyId);
    return this.prisma.salesOpportunity.delete({ where: { id } });
  }

  async addOpportunityNote(
    opportunityId: number,
    dto: CreateSalesOpportunityNoteDto,
    user?: any,
    companyId?: number | null,
  ) {
    await this.getOpportunity(opportunityId, user, companyId);
    return this.prisma.salesOpportunityNote.create({
      data: {
        opportunityId,
        message: dto.message,
        createdById: user?.id || null,
      },
    });
  }

  async addOpportunityEvidence(
    opportunityId: number,
    files: Array<{ url: string; name?: string; kind?: string }>,
    user?: any,
    companyId?: number | null,
  ) {
    await this.getOpportunity(opportunityId, user, companyId);
    const data = files.map((file) => ({
      opportunityId,
      fileUrl: file.url,
      fileName: file.name || null,
      kind: file.kind || null,
      createdById: user?.id || null,
    }));
    await this.prisma.salesOpportunityEvidence.createMany({ data });
    return this.prisma.salesOpportunityEvidence.findMany({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addOpportunityQuote(
    opportunityId: number,
    dto: CreateSalesOpportunityQuoteDto,
    user?: any,
    companyId?: number | null,
  ) {
    await this.getOpportunity(opportunityId, user, companyId);
    const existingCount = await this.prisma.salesOpportunityQuote.count({
      where: { opportunityId },
    });
    let pdfUrl = dto.pdfUrl || null;
    if (dto.cotizacionId && !pdfUrl) {
      const stored = await this.cotizacionesService.generatePdfFile(dto.cotizacionId);
      pdfUrl = stored.pdfUrl;
    }
    return this.prisma.salesOpportunityQuote.create({
      data: {
        opportunityId,
        cotizacionId: dto.cotizacionId ?? null,
        versionLabel: dto.versionLabel || `V${existingCount + 1}`,
        pdfUrl,
        createdById: user?.id || null,
      },
    });
  }

  async listOpportunityQuotes(opportunityId: number, user?: any, companyId?: number | null) {
    await this.getOpportunity(opportunityId, user, companyId);
    return this.prisma.salesOpportunityQuote.findMany({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' },
      include: { cotizacion: true },
    });
  }

  private calculateProjectMargin(dto: { budget?: number; costProducts?: number; costViaticos?: number; costOperativo?: number }) {
    const budget = Number(dto.budget || 0);
    const costProducts = Number(dto.costProducts || 0);
    const costViaticos = Number(dto.costViaticos || 0);
    const costOperativo = Number(dto.costOperativo || 0);
    return budget - (costProducts + costViaticos + costOperativo);
  }

  async createProject(dto: CreateSalesProjectDto, user?: any, companyId?: number | null) {
    const opp = await this.getOpportunity(dto.opportunityId, user, companyId);
    const tenantId = opp.companyId ?? requireCompanyId(companyId);
    const margin = this.calculateProjectMargin(dto);
    const created = await this.prisma.salesProject.create({
      data: {
        companyId: tenantId,
        opportunityId: dto.opportunityId,
        name: dto.name,
        projectType: dto.projectType ?? 'OTRO',
        scopeSummary: dto.scopeSummary?.trim() || null,
        siteCount: dto.siteCount ?? null,
        budget: dto.budget ?? 0,
        costProducts: dto.costProducts ?? 0,
        costViaticos: dto.costViaticos ?? 0,
        costOperativo: dto.costOperativo ?? 0,
        margin,
        status: dto.status,
        startDate: dto.startDate || null,
        endDate: dto.endDate || null,
      },
      include: { opportunity: true },
    });

    if (user?.id) {
      // Workflow: proyectos > $500k requieren visto bueno Dir. Comercial + Ops + CEO.
      this.domainEvents.requestAutoApproval({
        entityType: 'SALES_PROJECT',
        entityId: created.id,
        userId: user.id,
        companyId: tenantId,
        payload: {
          budget: Number(created.budget ?? 0),
          margin: Number(created.margin ?? 0),
          projectType: created.projectType,
          opportunityId: created.opportunityId,
        },
      });
    }

    void this.ensureProjectSalesOrder(created.id, user, tenantId).catch(() => undefined);
    void this.tryAutoProvisionOperational(created.id, user, tenantId).catch(() => undefined);

    return created;
  }

  /**
   * Al ganar una oportunidad: crea proyecto comercial + orden si faltan,
   * e intenta activar proyecto operativo cuando el cliente ya está en OPS.
   */
  async autoEnsureSalesProjectFromWonOpportunity(opportunityId: number, actorId?: number) {
    const opportunity = await this.prisma.salesOpportunity.findUnique({
      where: { id: opportunityId },
      include: { projects: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!opportunity || opportunity.stage !== 'WON') return null;

    const actorUser = actorId ? { id: actorId } : undefined;

    if (opportunity.clientId) {
      void this.provisionServiceClient(opportunity.clientId, actorUser).catch(() => undefined);
    }

    let project = opportunity.projects[0] ?? null;

    if (!project) {
      project = await this.createProject(
        {
          opportunityId,
          name: opportunity.title,
          budget: Number(opportunity.value ?? 0),
          scopeSummary: opportunity.description ?? undefined,
          status: 'PLANNED',
        },
        actorUser,
        opportunity.companyId,
      );

      if (actorId) {
        await this.prisma.salesOpportunityNote.create({
          data: {
            opportunityId,
            message: `Proyecto comercial "${project.name}" creado automáticamente al ganar la oportunidad.`,
            createdById: actorId,
          },
        });
      }
    } else {
      void this.ensureProjectSalesOrder(project.id, actorUser, opportunity.companyId).catch(() => undefined);
      void this.tryAutoProvisionOperational(project.id, actorUser, opportunity.companyId).catch(() => undefined);
    }

    return project;
  }

  private async tryAutoProvisionOperational(projectId: number, user?: any, companyId?: number | null) {
    try {
      const result = await this.provisionOperationalProject(projectId, user, companyId);
      if (result.created && user?.id) {
        await this.prisma.salesOpportunityNote.create({
          data: {
            opportunityId: result.salesProject.opportunityId,
            message: `Proyecto operativo activado automáticamente: ${result.operationalProject.title}.`,
            createdById: user.id,
          },
        }).catch(() => undefined);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo activar operaciones';
      if (user?.id) {
        const project = await this.prisma.salesProject.findFirst({
          where: {
            id: projectId,
            ...(companyId != null && Number(companyId) > 0 ? companyWhere(companyId) : {}),
          },
          select: { opportunityId: true },
        });
        if (project?.opportunityId) {
          await this.prisma.salesOpportunityNote.create({
            data: {
              opportunityId: project.opportunityId,
              message: `Provisión operativa pendiente: ${message}`,
              createdById: user.id,
            },
          }).catch(() => undefined);
        }
      }
      throw error;
    }
  }

  async listProjects(user?: any, ownerId?: number, query?: PaginationQueryDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const where = { ...this.buildScopedProjectOwnerWhere(user, ownerId), ...companyWhere(tenantId) };
    const include = {
      opportunity: true,
      operationalProject: { select: { id: true, title: true, status: true, clientId: true } },
    };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.salesProject.findMany({ where, orderBy: { updatedAt: 'desc' }, include, skip: query.skip, take: query.take }),
        this.prisma.salesProject.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.salesProject.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include,
    });
  }

  private async loadSalesProject(id: number, companyId?: number | null, include?: any): Promise<any> {
    const tenantId = requireCompanyId(companyId);
    const project = await this.prisma.salesProject.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: include ?? { opportunity: true, operationalProject: true },
    });
    assertCompanyAccess(project, tenantId, 'Proyecto');
    return project!;
  }

  async updateProject(id: number, dto: UpdateSalesProjectDto, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(id, companyId);
    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');
    const margin = this.calculateProjectMargin(dto);
    const updated = await this.prisma.salesProject.update({
      where: { id },
      data: {
        name: dto.name,
        projectType: dto.projectType,
        scopeSummary: dto.scopeSummary?.trim() || undefined,
        siteCount: dto.siteCount,
        budget: dto.budget,
        costProducts: dto.costProducts,
        costViaticos: dto.costViaticos,
        costOperativo: dto.costOperativo,
        margin,
        status: dto.status,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
      include: { opportunity: true, operationalProject: true },
    });

    // Propagar identidad + status al proyecto OPS vinculado (misma entrega).
    if (updated.operationalProject) {
      const patch = opsPatchFromSales({
        name: updated.name,
        projectType: updated.projectType,
        scopeSummary: updated.scopeSummary,
        siteCount: updated.siteCount,
        startDate: updated.startDate,
        endDate: updated.endDate,
        status: updated.status,
      });
      await this.prisma.operationalProject.update({
        where: { id: updated.operationalProject.id },
        data: {
          title: patch.title,
          projectType: patch.projectType,
          scopeSummary: patch.scopeSummary,
          siteCount: patch.siteCount,
          startDate: patch.startDate,
          endDate: patch.endDate,
          status: patch.status,
          ...(patch.status === 'COMPLETED' ? { actualEndDate: new Date() } : {}),
        },
      }).catch(() => undefined);
    }

    const requesterId = user?.id ?? project.opportunity?.ownerId ?? undefined;
    if (requesterId) {
      // Si el budget sube y rebasa el umbral, dispara workflow. Idempotente:
      // no crea instancias duplicadas si ya existe una abierta.
      this.domainEvents.requestAutoApproval({
        entityType: 'SALES_PROJECT',
        entityId: updated.id,
        userId: requesterId,
        companyId: project.companyId ?? companyId,
        payload: {
          budget: Number(updated.budget ?? 0),
          margin: Number(updated.margin ?? 0),
          projectType: updated.projectType,
        },
      });
    }

    return updated;
  }

  /** Crea proyecto operativo en campo vinculado a un proyecto comercial ganado. */
  async provisionOperationalProject(id: number, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(id, companyId ?? user?.companyId, {
      opportunity: {
        include: {
          client: true,
          owner: true,
        },
      },
    });
    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    const existing = await this.prisma.operationalProject.findUnique({
      where: { salesProjectId: id },
    });
    if (existing) {
      // Re-provision: refrescar identidad compartida desde CRM (SoT comercial).
      const patch = opsPatchFromSales({
        name: project.name,
        projectType: project.projectType,
        scopeSummary: project.scopeSummary,
        siteCount: project.siteCount,
        startDate: project.startDate,
        endDate: project.endDate,
        status: project.status,
      });
      const refreshed = await this.prisma.operationalProject.update({
        where: { id: existing.id },
        data: {
          title: patch.title,
          description: project.scopeSummary || project.opportunity?.description || existing.description,
          projectType: patch.projectType,
          scopeSummary: patch.scopeSummary,
          siteCount: patch.siteCount,
          startDate: patch.startDate,
          endDate: patch.endDate,
          status: patch.status,
        },
        include: {
          client: { select: { id: true, name: true } },
          vendor: { select: { id: true, nombre: true, email: true } },
        },
      });
      return { salesProject: project, operationalProject: refreshed, created: false };
    }

    let salesClient = project.opportunity?.client;
    if (!salesClient) {
      throw new BadRequestException(
        'El proyecto comercial no tiene cliente. Asigna un cliente a la oportunidad antes de desplegar en campo.',
      );
    }
    if (!salesClient.serviceClientId) {
      const provisioned = await this.provisionServiceClient(salesClient.id, user);
      salesClient = provisioned.salesClient as typeof salesClient;
    }
    if (!salesClient.serviceClientId) {
      throw new BadRequestException('No se pudo crear la cuenta operativa del cliente.');
    }

    const vendorId = project.opportunity?.ownerId || user?.id;
    if (!vendorId) throw new BadRequestException('No se pudo determinar el responsable comercial del proyecto');

    const patch = opsPatchFromSales({
      name: project.name,
      projectType: project.projectType,
      scopeSummary: project.scopeSummary,
      siteCount: project.siteCount,
      startDate: project.startDate,
      endDate: project.endDate,
      status: project.status === 'PLANNED' ? 'IN_PROGRESS' : project.status,
    });

    // Al desplegar a campo, el comercial pasa a IN_PROGRESS si seguía en PLANNED.
    if (project.status === 'PLANNED') {
      await this.prisma.salesProject.update({
        where: { id: project.id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    const opsCompanyId = await resolveRequiredCompanyId(
      this.prisma,
      companyId ?? (salesClient as any).companyId ?? project.companyId ?? project.opportunity?.companyId,
    );
    const operationalProject = await this.prisma.operationalProject.create({
      data: {
        title: patch.title,
        description: project.scopeSummary || project.opportunity?.description || null,
        projectType: patch.projectType,
        scopeSummary: patch.scopeSummary,
        siteCount: patch.siteCount,
        salesProjectId: project.id,
        vendorId,
        clientId: salesClient.serviceClientId,
        startDate: patch.startDate,
        endDate: patch.endDate,
        status: patch.status,
        companyId: opsCompanyId,
      },
      include: {
        client: { select: { id: true, name: true } },
        vendor: { select: { id: true, nombre: true, email: true } },
      },
    });

    return { salesProject: project, operationalProject, created: true };
  }

  private parseReportRange(range?: { start?: string; end?: string }) {
    if (!range?.start || !range?.end) return null;
    const start = new Date(range.start);
    const end = new Date(range.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { start, end };
  }

  private buildRangeWhere(range?: { start: Date; end: Date }) {
    if (!range) return {};
    return { createdAt: { gte: range.start, lte: range.end } };
  }

  async buildReportSummary(range?: { start?: string; end?: string }, user?: any) {
    const parsedRange = this.parseReportRange(range);
    const rangeWhere = this.buildRangeWhere(parsedRange || undefined);
    const ownerFilter = user?.isSuperAdmin ? undefined : user?.id ? { ownerId: user.id } : undefined;

    const [leads, opportunities, projects, quotes] = await Promise.all([
      this.prisma.salesLead.findMany({ where: { ...rangeWhere, ...(ownerFilter || {}) } }),
      this.prisma.salesOpportunity.findMany({
        where: { ...rangeWhere, ...(ownerFilter || {}) },
        include: { client: true },
      }),
      this.prisma.salesProject.findMany({
        where: {
          ...rangeWhere,
          ...(ownerFilter ? { opportunity: { ownerId: user.id } } : {}),
        },
        include: { opportunity: true },
      }),
      this.prisma.salesOpportunityQuote.findMany({
        where: {
          ...rangeWhere,
          ...(ownerFilter ? { opportunity: { ownerId: user.id } } : {}),
        },
        include: { opportunity: true },
      }),
    ]);

    const clients = await this.prisma.salesClient.count({
      where: { ...rangeWhere, ...(ownerFilter || {}) },
    });

    const stageMap = new Map<string, { count: number; value: number }>();
    const monthMap = new Map<string, { value: number; wonValue: number; count: number }>();
    let pipelineValue = 0;
    let expectedValue = 0;
    let won = 0;
    let lost = 0;

    opportunities.forEach((opp) => {
      const stage = opp.stage;
      const value = Number(opp.value || 0);
      const probability = Number(opp.probability || 0) / 100;
      if (stage !== 'LOST') {
        pipelineValue += value;
      }
      expectedValue += value * probability;
      if (stage === 'WON') won += 1;
      if (stage === 'LOST') lost += 1;

      const stageEntry = stageMap.get(stage) || { count: 0, value: 0 };
      stageEntry.count += 1;
      stageEntry.value += value;
      stageMap.set(stage, stageEntry);

      if (opp.createdAt) {
        const key = opp.createdAt.toISOString().slice(0, 7);
        const monthEntry = monthMap.get(key) || { value: 0, wonValue: 0, count: 0 };
        monthEntry.value += value;
        if (stage === 'WON') monthEntry.wonValue += value;
        monthEntry.count += 1;
        monthMap.set(key, monthEntry);
      }
    });

    const leadSourceMap = new Map<string, number>();
    leads.forEach((lead) => {
      const source = (lead.source || 'Sin fuente').trim();
      leadSourceMap.set(source, (leadSourceMap.get(source) || 0) + 1);
    });

    const marginByStatus = new Map<string, number>();
    let totalMargin = 0;
    projects.forEach((project) => {
      const status = project.status;
      const margin = Number(project.margin || 0);
      totalMargin += margin;
      marginByStatus.set(status, (marginByStatus.get(status) || 0) + margin);
    });

    const topOpportunities = [...opportunities]
      .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
      .slice(0, 6)
      .map((opp) => ({
        title: opp.title,
        value: Number(opp.value || 0),
        stage: opp.stage,
        probability: Number(opp.probability || 0),
        clientName: opp.client?.name || null,
      }));

    const byStage = Array.from(stageMap.entries()).map(([stage, data]) => ({
      stage,
      count: data.count,
      value: data.value,
    }));

    const byLeadSource = Array.from(leadSourceMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    const byProjectStatus = Array.from(marginByStatus.entries()).map(([status, margin]) => ({
      status,
      margin,
    }));

    const monthly = Array.from(monthMap.entries())
      .map(([month, data]) => ({ month, opportunities: data.count, value: data.value, wonValue: data.wonValue }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const rangeLabel = parsedRange
      ? `${parsedRange.start.toLocaleDateString('es-MX')} - ${parsedRange.end.toLocaleDateString('es-MX')}`
      : 'Ultimo periodo';

    return {
      range: parsedRange,
      rangeLabel,
      totals: {
        leads: leads.length,
        opportunities: opportunities.length,
        won,
        lost,
        pipelineValue,
        expectedValue,
        projects: projects.length,
        totalMargin,
        quotes: quotes.length,
        clients,
      },
      byStage,
      byLeadSource,
      marginByStatus: byProjectStatus,
      topOpportunities,
      monthly,
    };
  }

  async generateReportPdf(range?: { start?: string; end?: string }, user?: any) {
    const summary = await this.buildReportSummary(range, user);
    const pdf = await generateSalesReportPdf({
      generatedAt: new Date(),
      rangeLabel: summary.rangeLabel,
      totals: summary.totals,
      byStage: summary.byStage,
      byLeadSource: summary.byLeadSource,
      marginByStatus: summary.marginByStatus,
      topOpportunities: summary.topOpportunities,
    });

    const dir = path.resolve(process.cwd(), 'uploads', 'sales-reports');
    const filename = `reporte-ventas-${Date.now()}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outPath, pdf);
    const reportUrl = `/uploads/sales-reports/${filename}`;

    return { pdf, reportUrl };
  }

  // ===== COSTEO AUTOMÁTICO Y GESTIÓN DE PROYECTOS =====

  private async computeProjectActualCosts(salesProjectId: number) {
    const opProject = await this.prisma.operationalProject.findUnique({
      where: { salesProjectId },
      select: { id: true, title: true },
    });

    if (!opProject) {
      return {
        hasOperationalLink: false as const,
        operationalProjectId: null,
        activityCount: 0,
        completedActivities: 0,
        actualProducts: 0,
        actualViaticos: 0,
        actualOperativo: 0,
        actualTotal: 0,
      };
    }

    const activities = await this.prisma.activity.findMany({
      where: { projectId: opProject.id, deletedAt: null },
      select: { id: true, estatus: true },
    });
    const activityIds = activities.map((a) => a.id);
    const completedActivities = activities.filter((a) =>
      /finaliz|complet|cerrad/i.test(String(a.estatus || '')),
    ).length;

    const [expenseAgg, viaticoActivityAgg, viaticoProjectAgg] = await Promise.all([
      activityIds.length
        ? this.prisma.expense.aggregate({
            where: { actividadId: { in: activityIds }, deletedAt: null },
            _sum: { montoSolicitado: true },
          })
        : Promise.resolve({ _sum: { montoSolicitado: null } }),
      activityIds.length
        ? this.prisma.viatico.aggregate({
            where: { actividadId: { in: activityIds } },
            _sum: { montoSolicitado: true },
          })
        : Promise.resolve({ _sum: { montoSolicitado: null } }),
      this.prisma.viatico.aggregate({
        where: { projectId: salesProjectId },
        _sum: { montoSolicitado: true },
      }),
    ]);

    const actualOperativo = Number(expenseAgg._sum.montoSolicitado || 0);
    const actualViaticos =
      Number(viaticoActivityAgg._sum.montoSolicitado || 0) +
      Number(viaticoProjectAgg._sum.montoSolicitado || 0);

    return {
      hasOperationalLink: true as const,
      operationalProjectId: opProject.id,
      operationalProjectTitle: opProject.title,
      activityCount: activityIds.length,
      completedActivities,
      actualProducts: 0,
      actualViaticos,
      actualOperativo,
      actualTotal: actualViaticos + actualOperativo,
    };
  }

  /**
   * Calcula costos totales y margen de un proyecto
   */
  async calculateProjectCosts(projectId: number, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      opportunity: true,
    });

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    const costProducts = Number(project.costProducts) || 0;
    const costViaticos = Number(project.costViaticos) || 0;
    const costOperativo = Number(project.costOperativo) || 0;
    const totalCost = costProducts + costViaticos + costOperativo;
    const budget = Number(project.budget) || 0;
    const margin = budget - totalCost;
    const marginPercent = budget > 0 ? (margin / budget) * 100 : 0;
    const isOverBudget = totalCost > budget;

    const actual = await this.computeProjectActualCosts(projectId);
    const actualTotalWithProducts = Number(project.costProducts) + actual.actualTotal;
    const marginActual = budget - actualTotalWithProducts;
    const marginActualPercent = budget > 0 ? (marginActual / budget) * 100 : 0;

    return {
      costProducts,
      costViaticos,
      costOperativo,
      totalCost,
      budget,
      margin,
      marginPercent: Number(marginPercent.toFixed(2)),
      isOverBudget,
      actual: {
        ...actual,
        actualTotalWithProducts,
        marginActual: Number(marginActual.toFixed(2)),
        marginActualPercent: Number(marginActualPercent.toFixed(2)),
        isOverBudgetActual: actualTotalWithProducts > budget,
      },
    };
  }

  /**
   * Sincroniza costos de campo (viáticos + gastos OT) al proyecto comercial.
   */
  async syncActualCostsFromField(projectId: number, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      opportunity: true,
    });
    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    const actual = await this.computeProjectActualCosts(projectId);
    const costViaticos = actual.actualViaticos;
    const costOperativo = actual.actualOperativo;
    const totalCost = Number(project.costProducts) + costViaticos + costOperativo;
    const margin = Math.max(0, Number(project.budget) - totalCost);

    await this.prisma.salesProject.update({
      where: { id: projectId },
      data: { costViaticos, costOperativo, margin },
    });

    return this.calculateProjectCosts(projectId, user, companyId ?? user?.companyId);
  }

  /**
   * Actualiza costos de un proyecto y recalcula margen automáticamente
   */
  async updateProjectCosts(
    projectId: number,
    data: {
      costProducts?: number;
      costViaticos?: number;
      costOperativo?: number;
    },
    user?: any,
    companyId?: number | null,
  ) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      opportunity: true,
    });

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    // Preparar data para actualizar
    const updateData: any = {};
    if (data.costProducts !== undefined) {
      updateData.costProducts = Math.max(0, data.costProducts);
    }
    if (data.costViaticos !== undefined) {
      updateData.costViaticos = Math.max(0, data.costViaticos);
    }
    if (data.costOperativo !== undefined) {
      updateData.costOperativo = Math.max(0, data.costOperativo);
    }

    // Calcular margen automáticamente si hay actualizaciones
    if (Object.keys(updateData).length > 0) {
      const newCostProducts = (data.costProducts ?? Number(project.costProducts)) || 0;
      const newCostViaticos = (data.costViaticos ?? Number(project.costViaticos)) || 0;
      const newCostOperativo = (data.costOperativo ?? Number(project.costOperativo)) || 0;
      const totalCost = newCostProducts + newCostViaticos + newCostOperativo;
      const newMargin = Number(project.budget) - totalCost;

      updateData.margin = Math.max(0, newMargin);
    }

    return this.prisma.salesProject.update({
      where: { id: projectId },
      data: updateData,
      include: { opportunity: { include: { client: true } } },
    });
  }

  /**
   * Valida que los costos no excedan el presupuesto
   */
  async validateProjectBudget(projectId: number, user?: any, companyId?: number | null) {
    const costs = await this.calculateProjectCosts(projectId, user, companyId ?? user?.companyId);

    if (costs.isOverBudget) {
      return {
        valid: false,
        message: `Exceso de presupuesto: Costs $${costs.totalCost.toFixed(2)} > Budget $${costs.budget.toFixed(2)}. Diferencia: $${(costs.totalCost - costs.budget).toFixed(2)}`,
      };
    }

    return {
      valid: true,
      message: `Presupuesto OK. Costos: $${costs.totalCost.toFixed(2)}, Margen: $${costs.margin.toFixed(2)} (${costs.marginPercent}%)`,
    };
  }

  /**
    * Sincroniza viaticos del proyecto con costViaticos
   */
  async syncViaticosToProject(projectId: number, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      viaticos: true,
      opportunity: true,
    });

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    // Sumar todos los viaticos
    const totalViaticos = project.viaticos.reduce((sum: number, v: any) => {
      return sum + (Number(v.montoSolicitado) || 0);
    }, 0);

    // Actualizar proyecto con los costos sincronizados
    await this.updateProjectCosts(projectId, {
      costViaticos: totalViaticos,
    }, user, companyId ?? user?.companyId);

    return this.calculateProjectCosts(projectId, user, companyId ?? user?.companyId);
  }

  private pickBestOpportunityQuote(
    quotes: Array<{
      id: number;
      cotizacion?: { status: string; items?: unknown[] } | null;
    }> | undefined,
  ) {
    const list = quotes ?? [];
    const approved = list.find(
      (q) => q.cotizacion?.status === 'APPROVED' && (q.cotizacion.items?.length ?? 0) > 0,
    );
    if (approved) return approved;
    return list.find((q) => (q.cotizacion?.items?.length ?? 0) > 0) ?? list[0] ?? null;
  }

  private async copyQuoteItemsToOrderLines(orderId: number, items: any[]) {
    if (!items.length) return;
    await this.prisma.salesProjectOrderLine.createMany({
      data: items.map((item, index) => ({
        orderId,
        productId: item.productId,
        sortOrder: index,
        category: item.category,
        name: item.name,
        description: item.description,
        scope: item.scope,
        brand: item.brand,
        model: item.model,
        sku: item.sku,
        partNumber: item.partNumber,
        batchReference: item.batchReference,
        unit: item.unit,
        qty: item.qty,
        unitPrice: item.unitPrice,
        discount: item.discount,
        tax: item.tax,
        ieps: item.ieps,
        retention: item.retention,
        laborHours: item.laborHours,
        laborRate: item.laborRate,
        warrantyMonths: item.warrantyMonths,
        deliveryTime: item.deliveryTime,
        countryOrigin: item.countryOrigin,
        notes: item.notes,
        lineTotal: item.lineTotal,
      })),
    });
  }

  /**
   * Orden de venta al crear proyecto (estilo Odoo Sales Order confirmada).
   * Copia líneas de la cotización firmada o la más reciente vinculada.
   */
  async ensureProjectSalesOrder(projectId: number, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      opportunity: {
        include: {
          quotes: {
            orderBy: { createdAt: 'desc' },
            include: { cotizacion: { include: { items: true } } },
          },
        },
      },
    });
    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    const orderTenant = companyWhere(project.companyId);
    const existing = await this.prisma.salesProjectOrder.findFirst({
      where: { projectId: project.id, ...orderTenant },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (existing) return existing;

    const quoteLink = this.pickBestOpportunityQuote(project.opportunity?.quotes);
    const quoteItems = quoteLink?.cotizacion?.items ?? [];
    const orderId = `ORD-${Date.now()}-${projectId}`;

    const order = await this.prisma.salesProjectOrder.create({
      data: {
        projectId: project.id,
        orderId,
        quoteId: quoteLink?.id ?? null,
        status: 'CONFIRMED',
        createdById: user?.id ?? null,
        companyId: project.companyId,
      },
    });

    await this.copyQuoteItemsToOrderLines(order.id, quoteItems);

    await this.prisma.salesProject.update({
      where: { id: project.id },
      data: { closureOrderId: order.id },
    });

    void this.notificationsService.notifyOrderCreated(project.id, orderId).catch(() => undefined);

    return this.prisma.salesProjectOrder.findFirst({
      where: { id: order.id, projectId: project.id, ...orderTenant },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, quote: true, createdBy: true },
    });
  }

  async closeProject(projectId: number, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      opportunity: {
        include: {
          client: true,
          quotes: { orderBy: { createdAt: 'desc' }, take: 1, include: { cotizacion: { include: { items: true } } } },
          owner: true,
        },
      },
      closureOrder: true,
    });

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    const validation = await this.validateProjectBudget(projectId, user, companyId ?? user?.companyId);
    if (!validation.valid) {
      throw new BadRequestException(`Cannot close project: ${validation.message}`);
    }

    let order = project.closureOrder;
    if (!order) {
      order = await this.ensureProjectSalesOrder(projectId, user, companyId ?? user?.companyId) as any;
    }

    const tenantId = requireCompanyId(companyId ?? user?.companyId);
    const orderScope = { id: order!.id, ...companyWhere(tenantId) };

    if (project.status === 'CLOSED' && order) {
      const closed = await this.prisma.salesProjectOrder.findFirst({
        where: orderScope,
        include: { project: true, quote: true, createdBy: true, lines: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!closed) throw new NotFoundException('Orden de proyecto no encontrada');
      return closed;
    }

    const lastQuote = project.opportunity.quotes?.[0];
    const client = project.opportunity.client;

    let orderPdfBuffer: Buffer;
    try {
      orderPdfBuffer = await this.pdfGeneratorService.generateOrderPdf(projectId);
    } catch {
      const { generateSalesOrderPdf } = await import('./sales-order-pdf.js');
      orderPdfBuffer = generateSalesOrderPdf({
        orderId: order!.orderId,
        orderDate: new Date(),
        projectName: project.name,
        clientName: client?.name,
        clientCompany: client?.legalName ?? undefined,
        clientEmail: client?.billingEmail ?? undefined,
        clientPhone: client?.billingPhone ?? undefined,
        clientAddress: client?.fiscalAddress ?? undefined,
        budget: Number(project.budget),
        costProducts: Number(project.costProducts),
        costViaticos: Number(project.costViaticos),
        costOperativo: Number(project.costOperativo),
        margin: Number(project.margin),
        deliveryDate: project.endDate ?? undefined,
        quoteNumber: lastQuote?.versionLabel ?? undefined,
      });
    }

    const dir = path.resolve(process.cwd(), 'uploads', 'sales-orders');
    const filename = `orden-${order!.orderId}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outPath, orderPdfBuffer);
    const orderPdfUrl = `/uploads/sales-orders/${filename}`;

    const scopedOrder = await this.prisma.salesProjectOrder.findFirst({
      where: orderScope,
      select: { id: true },
    });
    if (!scopedOrder) throw new NotFoundException('Orden de proyecto no encontrada');

    await this.prisma.salesProjectOrder.update({
      where: { id: scopedOrder.id },
      data: {
        orderPdfUrl,
        status: 'CLOSED',
      },
    });

    await this.prisma.salesProject.update({
      where: { id: projectId },
      data: {
        status: 'CLOSED',
        closureOrderId: scopedOrder.id,
        endDate: new Date(),
      },
    });

    const updated = await this.prisma.salesProjectOrder.findFirst({
      where: orderScope,
      include: { project: true, quote: true, createdBy: true, lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!updated) throw new NotFoundException('Orden de proyecto no encontrada');
    return updated;
  }

  /**
   * Genera un PDF dinámico de cotización embebiendo datos del cliente
   */
  async generateQuotePdfDynamic(opportunityQuoteId: number, clientId: number, templateId?: number, user?: any) {
    const quote = await this.prisma.salesOpportunityQuote.findUnique({
      where: { id: opportunityQuoteId },
      include: { opportunity: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    this.assertOwnerAccess(quote.opportunity?.ownerId, user, 'cotización de oportunidad');

    const pdfBuffer = await this.pdfGeneratorService.generateQuotePdf(opportunityQuoteId, clientId, templateId);

    // Guardar PDF en servidor
    const dir = path.resolve(process.cwd(), 'uploads', 'quotes');
    const filename = `cotizacion-${opportunityQuoteId}-${Date.now()}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outPath, pdfBuffer);
    const quoteUrl = `/uploads/quotes/${filename}`;

    return {
      pdfUrl: quoteUrl,
      fileName: filename,
      size: pdfBuffer.length,
      pdfBuffer,
    };
  }

  async getProjectOrder(projectId: number, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      opportunity: { include: { client: true } },
    });
    const order = await this.prisma.salesProjectOrder.findFirst({
      where: { projectId: project.id, ...companyWhere(project.companyId) },
      include: {
        project: { include: { opportunity: { include: { client: true } } } },
        quote: true,
        createdBy: true,
        lines: {
          orderBy: { sortOrder: 'asc' },
          include: {
            product: { select: { id: true, sku: true, name: true, satProductKey: true, satUnitKey: true } },
            invoiceItem: {
              select: {
                id: true,
                invoiceId: true,
                invoice: { select: { id: true, invoiceNumber: true, status: true } },
              },
            },
          },
        },
        invoices: {
          select: { id: true, invoiceNumber: true, status: true, totalAmount: true, cfdiUuid: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!order) return null;
    assertCompanyAccess(order.project, project.companyId, 'Proyecto');
    this.assertOwnerAccess(order.project?.opportunity?.ownerId, user, 'proyecto');
    return order;
  }

  /**
   * Vista unificada de un proyecto comercial — incluye comercial, operación,
   * orden, factura y costos reales en un solo payload para detalle ejecutivo.
   */
  async getProjectSummary(projectId: number, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      opportunity: {
        include: {
          client: { select: { id: true, name: true, taxId: true, legalName: true } },
          owner: { select: { id: true, nombre: true, email: true } },
        },
      },
      closureOrder: {
        include: {
          lines: { orderBy: { sortOrder: 'asc' }, include: { invoiceItem: { select: { id: true } } } },
          invoices: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              totalAmount: true,
              paidAmount: true,
              cfdiUuid: true,
              cfdiStampDate: true,
              isCancelled: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
      operationalProject: {
        include: {
          engineers: { include: { engineer: { select: { id: true, nombre: true, email: true } } } },
        },
      },
    });

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    const opProject = project.operationalProject;

    let activityStats: { total: number; completed: number; inProgress: number; pending: number } | null = null;
    if (opProject?.id) {
      const acts = await this.prisma.activity.findMany({
        where: { projectId: opProject.id, deletedAt: null },
        select: { estatus: true },
      });
      const completed = acts.filter((a) => /finaliz|complet|cerrad/i.test(String(a.estatus || ''))).length;
      const inProgress = acts.filter((a) => /proceso|progres|curso|asign/i.test(String(a.estatus || ''))).length;
      activityStats = {
        total: acts.length,
        completed,
        inProgress,
        pending: Math.max(0, acts.length - completed - inProgress),
      };
    }

    const costs = await this.calculateProjectCosts(projectId, user);

    return {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        projectType: project.projectType,
        scopeSummary: project.scopeSummary,
        siteCount: project.siteCount,
        startDate: project.startDate,
        endDate: project.endDate,
        budget: Number(project.budget),
        margin: Number(project.margin),
      },
      opportunity: project.opportunity
        ? {
            id: project.opportunity.id,
            title: project.opportunity.title,
            stage: project.opportunity.stage,
            owner: project.opportunity.owner,
            client: project.opportunity.client,
          }
        : null,
      operational: opProject
        ? {
            id: opProject.id,
            title: opProject.title,
            status: opProject.status,
            engineers: opProject.engineers?.map((e: any) => e.engineer) || [],
            activityStats,
            progressPercent: activityStats?.total
              ? Math.round((activityStats.completed / activityStats.total) * 100)
              : 0,
          }
        : null,
      order: project.closureOrder
        ? {
            id: project.closureOrder.id,
            orderId: project.closureOrder.orderId,
            status: project.closureOrder.status,
            lineCount: project.closureOrder.lines.length,
            invoicedLineCount: project.closureOrder.lines.filter((l: any) => l.invoiceItem).length,
            invoices: project.closureOrder.invoices,
          }
        : null,
      costs,
    };
  }

  async findCotizacionesForVentas(clientName?: string, status?: string, startDate?: string, endDate?: string) {
    const where: any = {};

    if (clientName) {
      where.OR = [{ clientName: { contains: clientName, mode: 'insensitive' } }, { clientCompany: { contains: clientName, mode: 'insensitive' } }];
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.issueDate = {};
      if (startDate) where.issueDate.gte = new Date(startDate);
      if (endDate) where.issueDate.lte = new Date(endDate);
    }

    return this.prisma.cotizacion.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      include: { items: true, createdBy: true, salesQuotes: true },
    });
  }

  async getCotizacionDetail(cotizacionId: number) {
    const cot = await this.prisma.cotizacion.findUnique({
      where: { id: cotizacionId },
      include: { items: true, createdBy: true, salesQuotes: { include: { opportunity: true } } },
    });

    if (!cot) {
      throw new NotFoundException(`Cotización with ID ${cotizacionId} not found`);
    }

    return cot;
  }

  async linkCotizacionToOpportunity(
    cotizacionId: number,
    opportunityId: number,
    user?: any,
    versionLabel?: string,
    companyId?: number | null,
  ) {
    // Verify opportunity exists and ownership
    await this.getOpportunity(opportunityId, user, companyId);

    // Verify cotization exists
    const cot = await this.prisma.cotizacion.findUnique({
      where: { id: cotizacionId },
    });

    if (!cot) {
      throw new NotFoundException(`Cotización with ID ${cotizacionId} not found`);
    }

    // Create quote version linked to both
    const quote = await this.prisma.salesOpportunityQuote.create({
      data: {
        opportunityId,
        cotizacionId,
        versionLabel: versionLabel || `v${Date.now()}`,
        pdfUrl: `/uploads/cotizaciones/cotizacion-${cotizacionId}.pdf`,
        createdById: user?.id,
      },
      include: { opportunity: true, cotizacion: true, createdBy: true },
    });

    return quote;
  }

  async getProjectViaticos(projectId: number, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      opportunity: true,
    });

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    return this.prisma.viatico.findMany({
      where: { projectId },
      include: { User: true },
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  async assignViaticosToProject(projectId: number, viaticIds: number[], user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      opportunity: true,
    });

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    // Link viaticos to project
    const updatePromises = viaticIds.map(viaticId =>
      this.prisma.viatico.update({
        where: { id: viaticId },
        data: { projectId },
      })
    );

    await Promise.all(updatePromises);

    // Get all project viaticos and recalculate total cost
    const viaticos = await this.prisma.viatico.findMany({
      where: { projectId },
    });

    const totalViaticoCost = viaticos.reduce(
      (sum, v) => sum + Number(v.montoSolicitado || 0),
      0
    );

    // Update project with new viatico cost
    const updatedProject = await this.prisma.salesProject.update({
      where: { id: projectId },
      data: {
        costViaticos: totalViaticoCost,
        margin: this.calculateProjectMargin({
          budget: Number(project.budget),
          costProducts: Number(project.costProducts),
          costViaticos: totalViaticoCost,
          costOperativo: Number(project.costOperativo),
        }),
      },
      include: { viaticos: { include: { User: true } }, opportunity: true },
    });

    return updatedProject;
  }

  async unassignViaticFromProject(viaticId: number, user?: any) {
    const viatico = await this.prisma.viatico.findUnique({
      where: { id: viaticId },
    });
    if (!viatico) throw new NotFoundException('Viático no encontrado');

    const projectId = viatico.projectId;

    // Unlink viatico
    await this.prisma.viatico.update({
      where: { id: viaticId },
      data: { projectId: null },
    });

    // Recalculate project costs if it was linked to a project
    if (projectId) {
      const project = await this.loadSalesProject(projectId, user?.companyId, {
        opportunity: true,
      });

      this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

      const viaticos = await this.prisma.viatico.findMany({
        where: { projectId },
      });

      const totalViaticoCost = viaticos.reduce(
        (sum, v) => sum + Number(v.montoSolicitado || 0),
        0
      );

      return this.prisma.salesProject.update({
        where: { id: projectId },
        data: {
          costViaticos: totalViaticoCost,
          margin: this.calculateProjectMargin({
            budget: Number(project.budget),
            costProducts: Number(project.costProducts),
            costViaticos: totalViaticoCost,
            costOperativo: Number(project.costOperativo),
          }),
        },
        include: { viaticos: { include: { User: true } }, opportunity: true },
      });
    }
  }

  async getProjectExpensesSummary(projectId: number, user?: any, companyId?: number | null) {
    const project = await this.loadSalesProject(projectId, companyId ?? user?.companyId, {
      viaticos: true,
      opportunity: true,
    });

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    const viaticosCount = project.viaticos.length;
    const totalViaticoCost = project.viaticos.reduce(
      (sum: number, v: any) => sum + Number(v.montoSolicitado || 0),
      0
    );

    return {
      projectId,
      projectName: project.name,
      budget: Number(project.budget),
      costs: {
        products: Number(project.costProducts),
        viaticos: totalViaticoCost,
        operativo: Number(project.costOperativo),
        total: Number(project.costProducts) + totalViaticoCost + Number(project.costOperativo),
      },
      viaticosCount,
      margin: Number(project.margin),
      status: project.status,
      actual: await this.computeProjectActualCosts(projectId),
    };
  }

  // ==================== ORDER TEMPLATES ====================

  private getDefaultTemplateSections() {
    return {
      showClientInfo: true,
      showProjectScope: true,
      showItemsTable: true,
      showTotals: true,
      showTerms: true,
      showNotes: true,
      showPreparedBy: true,
      showValidity: true,
      showPaymentTerms: true,
      showFooterBrand: true,
    };
  }

  private normalizeHexColor(value: string | undefined, fallback: string) {
    const safe = (value || '').trim();
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(safe) ? safe : fallback;
  }

  private normalizeTemplateSections(value: unknown) {
    const base = this.getDefaultTemplateSections();
    if (!value || typeof value !== 'object') return base;
    const current = value as Record<string, unknown>;
    return {
      ...base,
      ...Object.fromEntries(
        Object.keys(base).map((key) => [key, Boolean(current[key])]),
      ),
    };
  }

  async createOrderTemplate(dto: CreateOrderTemplateDto, userId?: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const existingCount = await this.prisma.orderTemplate.count({ where: companyWhere(tenantId) });
    const shouldBeDefault = dto.isDefault ?? existingCount === 0;

    if (shouldBeDefault) {
      await this.prisma.orderTemplate.updateMany({
        where: { isDefault: true, ...companyWhere(tenantId) },
        data: { isDefault: false },
      });
    }

    return this.prisma.orderTemplate.create({
      data: {
        companyId: tenantId,
        name: dto.name,
        description: dto.description || null,
        isDefault: shouldBeDefault,
        headerLogo: dto.headerLogo || null,
        headerText: dto.headerText || 'Propuesta Comercial',
        companyName: dto.companyName || null,
        companyEmail: dto.companyEmail || null,
        companyPhone: dto.companyPhone || null,
        footerText: dto.footerText || null,
        footerAlignment: ['left', 'center', 'right'].includes((dto.footerAlignment || '').toLowerCase())
          ? (dto.footerAlignment || 'center').toLowerCase()
          : 'center',
        primaryColor: this.normalizeHexColor(dto.primaryColor, '#0f6ad6'),
        secondaryColor: this.normalizeHexColor(dto.secondaryColor, '#f5f5f5'),
        textColor: this.normalizeHexColor(dto.textColor, '#000000'),
        sections: this.normalizeTemplateSections(dto.sections) as any,
        customCss: dto.customCss || null,
        createdById: userId || null,
      },
      include: { createdBy: true },
    });
  }

  async listOrderTemplates(query?: PaginationQueryDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const where = companyWhere(tenantId);
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.orderTemplate.findMany({ where, orderBy: { createdAt: 'desc' }, include: { createdBy: true }, skip: query.skip, take: query.take }),
        this.prisma.orderTemplate.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.orderTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true },
    });
  }

  async getOrderTemplate(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const template = await this.prisma.orderTemplate.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: { createdBy: true },
    });
    assertCompanyAccess(template, tenantId, 'Template');
    return template!;
  }

  async updateOrderTemplate(id: number, dto: UpdateOrderTemplateDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const existing = await this.getOrderTemplate(id, tenantId);

    if (dto.isDefault) {
      await this.prisma.orderTemplate.updateMany({
        where: { isDefault: true, id: { not: id }, ...companyWhere(tenantId) },
        data: { isDefault: false },
      });
    }

    return this.prisma.orderTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        isDefault: dto.isDefault,
        headerLogo: dto.headerLogo,
        headerText: dto.headerText,
        companyName: dto.companyName,
        companyEmail: dto.companyEmail,
        companyPhone: dto.companyPhone,
        footerText: dto.footerText,
        footerAlignment: dto.footerAlignment
          ? (['left', 'center', 'right'].includes(dto.footerAlignment.toLowerCase()) ? dto.footerAlignment.toLowerCase() : 'center')
          : undefined,
        primaryColor: dto.primaryColor ? this.normalizeHexColor(dto.primaryColor, existing.primaryColor || '#0f6ad6') : undefined,
        secondaryColor: dto.secondaryColor ? this.normalizeHexColor(dto.secondaryColor, existing.secondaryColor || '#f5f5f5') : undefined,
        textColor: dto.textColor ? this.normalizeHexColor(dto.textColor, existing.textColor || '#000000') : undefined,
        sections: dto.sections !== undefined
          ? (this.normalizeTemplateSections(dto.sections) as any)
          : undefined,
        customCss: dto.customCss,
      },
      include: { createdBy: true },
    });
  }

  async deleteOrderTemplate(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const target = await this.getOrderTemplate(id, tenantId);
    const deleted = await this.prisma.orderTemplate.delete({ where: { id } });

    if (target.isDefault) {
      const fallback = await this.prisma.orderTemplate.findFirst({
        where: companyWhere(tenantId),
        orderBy: { updatedAt: 'desc' },
      });
      if (fallback) {
        await this.prisma.orderTemplate.update({
          where: { id: fallback.id },
          data: { isDefault: true },
        });
      }
    }

    return deleted;
  }

  async getDefaultOrderTemplate(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.orderTemplate.findFirst({
      where: { isDefault: true, ...companyWhere(tenantId) },
      include: { createdBy: true },
    });
  }

  async setOrderTemplateAsDefault(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.getOrderTemplate(id, tenantId);

    // Unset all previous defaults within tenant
    await this.prisma.orderTemplate.updateMany({
      where: { isDefault: true, ...companyWhere(tenantId) },
      data: { isDefault: false },
    });

    // Set this one as default
    return this.prisma.orderTemplate.update({
      where: { id },
      data: { isDefault: true },
      include: { createdBy: true },
    });
  }

  // ===== REPORTING METHODS =====

  async getMetricsByPeriod(period: 'week' | 'month' | 'year', user?: any) {
    const now = new Date();
    let startDate = new Date();

    if (period === 'week') {
      startDate.setDate(now.getDate() - now.getDay());
    } else if (period === 'month') {
      startDate.setDate(1);
    } else if (period === 'year') {
      startDate.setMonth(0, 1);
    }

    // Managers y roles de jerarquía superior ven métricas del equipo completo.
    // Vendedores individuales (v2: 'vendedor') ven solo sus propios registros.
    const isManager = this.isSalesTeamManager(user);
    const ownerFilter = !isManager && user?.id ? { owner: { id: user.id } } : undefined;

    const projects = await this.prisma.salesProject.findMany({
      where: {
        createdAt: { gte: startDate },
        ...(ownerFilter ? { opportunity: ownerFilter } : {}),
      },
      include: { opportunity: { include: { owner: true } } },
    });

    const opportunities = await this.prisma.salesOpportunity.findMany({
      where: {
        createdAt: { gte: startDate },
        ...(ownerFilter || {}),
      },
    });

    const closedProjects = projects.filter((p) => p.status === 'CLOSED').length;
    const totalRevenue = opportunities.reduce((sum, opp) => sum + Number(opp.value || 0), 0);
    const avgMargin = projects.length ? projects.reduce((sum, p) => sum + Number(p.margin || 0), 0) / projects.length : 0;
    const conversionRate = opportunities.length
      ? (closedProjects / opportunities.length) * 100
      : 0;

    // Get pipeline value
    const activeOpportunities = opportunities.filter((o) => o.closedAt === null);
    const pipelineValue = activeOpportunities.reduce((sum, o) => sum + Number(o.value || 0), 0);

    // Get unique clients
    const clients = await this.prisma.salesClient.findMany({
      where: {
        createdAt: { gte: startDate },
        ...(!isManager && user?.id ? { ownerId: user.id } : {}),
      },
    });

    return {
      totalRevenue: Number(totalRevenue),
      opportunityCount: opportunities.length,
      projectCount: projects.length,
      averageMargin: Number(avgMargin),
      conversionRate: Number(conversionRate.toFixed(2)),
      pipelineValue: Number(pipelineValue),
      closedProjects,
      activeClients: clients.length,
    };
  }

  async getVendorStatsByPeriod(period: 'week' | 'month' | 'year', user?: any, companyId?: number | null) {
    const now = new Date();
    let startDate = new Date();

    if (period === 'week') {
      startDate.setDate(now.getDate() - now.getDay());
    } else if (period === 'month') {
      startDate.setDate(1);
    } else if (period === 'year') {
      startDate.setMonth(0, 1);
    }

    const canViewAllSellers = this.isSuperAdminUser(user) || this.isConsoleAdminUser(user);

    if (!canViewAllSellers) {
      const metrics = await this.getMetricsByPeriod(period, user);
      const performance = Math.min(100, (metrics.totalRevenue / 1000000) * 100 + metrics.conversionRate);
      const quotaMap = await this.getQuotaMap(period, user?.id ? [user.id] : []);
      const quota = user?.id ? quotaMap.get(user.id) : undefined;
      const targetRevenue = Number(quota?.targetRevenue || 0);
      const targetOpportunities = Number(quota?.targetOpportunities || 0);
      const attainmentRevenue = targetRevenue > 0 ? (metrics.totalRevenue / targetRevenue) * 100 : 0;
      const attainmentOpportunities = targetOpportunities > 0 ? (metrics.opportunityCount / targetOpportunities) * 100 : 0;
      const status = attainmentRevenue >= 100 ? 'on-track' : attainmentRevenue >= 70 ? 'risk' : 'off-track';
      return [
        {
          userId: user?.id,
          userName: user?.nombre || 'Tu',
          revenue: Number(metrics.totalRevenue),
          opportunities: metrics.opportunityCount,
          projects: metrics.projectCount,
          margin: Number(metrics.averageMargin),
          conversionRate: Number(metrics.conversionRate),
          performance: Number(performance.toFixed(0)),
          targetRevenue,
          targetOpportunities,
          attainmentRevenue: Number(attainmentRevenue.toFixed(2)),
          attainmentOpportunities: Number(attainmentOpportunities.toFixed(2)),
          revenueGap: Number((targetRevenue - Number(metrics.totalRevenue || 0)).toFixed(2)),
          status,
        },
      ];
    }

    // Get seller users (must have sales panel access configured in role)
    const tenantId = requireCompanyId(companyId);
    const protectedEmails = ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'];
    const users = await this.prisma.user.findMany({
      where: {
        role: { accesoPanelVentas: true },
        companyMemberships: { some: { companyId: tenantId } },
        NOT: { role: { accesoConsoleAdmin: true } },
        email: { notIn: protectedEmails },
      },
      include: {
        role: true,
        salesOpportunitiesOwned: {
          where: { createdAt: { gte: startDate } },
        },
      },
    });

    const vendorStats = await Promise.all(
      users.map(async (user) => {
        const opportunities = user.salesOpportunitiesOwned;
        const projects = await this.prisma.salesProject.findMany({
          where: {
            opportunity: {
              owner: { id: user.id },
              createdAt: { gte: startDate },
            },
          },
        });

        const totalRevenue = opportunities.reduce((sum, opp) => sum + Number(opp.value || 0), 0);
        const closedProjects = projects.filter((p) => p.status === 'CLOSED').length;
        const avgMargin = projects.length
          ? projects.reduce((sum, p) => sum + Number(p.margin || 0), 0) / projects.length
          : 0;
        const conversionRate = opportunities.length
          ? (closedProjects / opportunities.length) * 100
          : 0;

        // Performance score: 0-100
        const performanceScore = Math.min(100, (totalRevenue / 1000000) * 100 + conversionRate);

        return {
          userId: user.id,
          userName: user.nombre,
          revenue: Number(totalRevenue),
          opportunities: opportunities.length,
          projects: projects.length,
          margin: Number(avgMargin),
          conversionRate: Number(conversionRate.toFixed(2)),
          performance: Number(performanceScore.toFixed(0)),
        };
      })
    );

    const quotaMap = await this.getQuotaMap(period, vendorStats.map((vendor) => vendor.userId));

    const withQuotas = vendorStats.map((vendor) => {
      const quota = quotaMap.get(vendor.userId);
      const targetRevenue = Number(quota?.targetRevenue || 0);
      const targetOpportunities = Number(quota?.targetOpportunities || 0);
      const attainmentRevenue = targetRevenue > 0 ? (vendor.revenue / targetRevenue) * 100 : 0;
      const attainmentOpportunities = targetOpportunities > 0 ? (vendor.opportunities / targetOpportunities) * 100 : 0;
      const status = attainmentRevenue >= 100 ? 'on-track' : attainmentRevenue >= 70 ? 'risk' : 'off-track';

      return {
        ...vendor,
        targetRevenue,
        targetOpportunities,
        attainmentRevenue: Number(attainmentRevenue.toFixed(2)),
        attainmentOpportunities: Number(attainmentOpportunities.toFixed(2)),
        revenueGap: Number((targetRevenue - vendor.revenue).toFixed(2)),
        status,
      };
    });

    return withQuotas.sort((a, b) => b.revenue - a.revenue);
  }

  async setSalesQuota(
    period: 'week' | 'month' | 'year',
    targetRevenue: number,
    targetOpportunities: number,
    ownerId: number | undefined,
    user?: any,
  ) {
    const resolvedOwnerId = ownerId || user?.id;
    if (!resolvedOwnerId) throw new BadRequestException('ownerId requerido para configurar cuota');
    if (!this.isSuperAdminUser(user) && resolvedOwnerId !== user?.id) {
      throw new ForbiddenException('Solo super admin puede configurar cuotas de otros vendedores');
    }

    const payload = {
      ownerId: resolvedOwnerId,
      period,
      targetRevenue: Math.max(0, Number(targetRevenue || 0)),
      targetOpportunities: Math.max(0, Number(targetOpportunities || 0)),
      configuredAt: new Date().toISOString(),
    };

    const event = await this.createAuditEvent({
      action: 'quota.set',
      entityType: 'quota',
      actorId: user?.id,
      metadata: payload,
    });

    return {
      id: (event as any)?.id ?? 0,
      ...payload,
    };
  }

  async getSalesQuotaProgress(period: 'week' | 'month' | 'year', user?: any, companyId?: number | null) {
    return this.getVendorStatsByPeriod(period, user, companyId);
  }

  async getExecutiveInsights(period: 'week' | 'month' | 'year', user?: any, companyId?: number | null) {
    const startDate = this.getPeriodStart(period);
    const isManager = this.isSalesTeamManager(user);
    const ownerFilter = !isManager && user?.id ? { ownerId: user.id } : undefined;
    const now = new Date();
    const recentActivityStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [metrics, opportunities, auditEventsRaw, vendorStats, notesActivity] = await Promise.all([
      this.getMetricsByPeriod(period, user),
      this.prisma.salesOpportunity.findMany({
        where: {
          createdAt: { gte: startDate },
          ...(ownerFilter || {}),
        },
        select: {
          id: true,
          stage: true,
          value: true,
          probability: true,
          createdAt: true,
          updatedAt: true,
          ownerId: true,
          closedAt: true,
          expectedCloseDate: true,
          description: true,
        },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: {
          createdAt: { gte: startDate },
          source: 'sales',
          ...(this.isSuperAdminUser(user) ? {} : user?.id ? { userId: user.id } : {}),
        },
        _count: { action: true },
      }),
      this.getVendorStatsByPeriod(period, user, companyId),
      this.prisma.salesOpportunityNote.groupBy({
        by: ['opportunityId'],
        where: {
          createdAt: { gte: recentActivityStart },
          ...(ownerFilter ? { opportunity: ownerFilter } : {}),
        },
        _count: { opportunityId: true },
      }),
    ]);

    const auditEvents = (auditEventsRaw ?? []) as Array<{ action: string; _count: { action: number } }>;
    const notesByOpportunity = new Map<number, number>();
    (notesActivity || []).forEach((entry: any) => {
      notesByOpportunity.set(entry.opportunityId, Number(entry?._count?.opportunityId || 0));
    });

    const stageDistribution = opportunities.reduce<Record<string, number>>((acc, opportunity) => {
      const key = opportunity.stage || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const weightedForecast = opportunities
      .filter((opportunity) => opportunity.stage !== 'WON' && opportunity.stage !== 'LOST')
      .reduce((sum, opportunity) => {
        const value = Number(opportunity.value || 0);
        const probability = Number(opportunity.probability || 0);
        return sum + value * (probability / 100);
      }, 0);

    const closed = opportunities.filter((opportunity) => Boolean(opportunity.closedAt));
    const avgCycleDays = closed.length
      ? closed.reduce((sum, opportunity) => {
          const diff = new Date(opportunity.closedAt as Date).getTime() - new Date(opportunity.createdAt).getTime();
          return sum + diff / (1000 * 60 * 60 * 24);
        }, 0) / closed.length
      : 0;

    const forecastCoverage = metrics.pipelineValue > 0
      ? (weightedForecast / metrics.pipelineValue) * 100
      : 0;

    const activeOpportunities = opportunities.filter((opportunity) => opportunity.stage !== 'WON' && opportunity.stage !== 'LOST');

    const pipelineAgingByStage = activeOpportunities.reduce<Record<string, { count: number; avgDays: number }>>((acc, opportunity) => {
      const key = opportunity.stage || 'UNKNOWN';
      const current = acc[key] || { count: 0, avgDays: 0 };
      const ageDays = (now.getTime() - new Date(opportunity.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      current.avgDays = ((current.avgDays * current.count) + ageDays) / (current.count + 1);
      current.count += 1;
      acc[key] = current;
      return acc;
    }, {});

    const agingBuckets = activeOpportunities.reduce(
      (acc, opportunity) => {
        const ageDays = (now.getTime() - new Date(opportunity.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays <= 7) acc.bucket0to7 += 1;
        else if (ageDays <= 30) acc.bucket8to30 += 1;
        else if (ageDays <= 60) acc.bucket31to60 += 1;
        else acc.bucket60plus += 1;
        return acc;
      },
      { bucket0to7: 0, bucket8to30: 0, bucket31to60: 0, bucket60plus: 0 },
    );

    const overdueNextActions = activeOpportunities.filter((opportunity) => {
      const due = this.toDate(opportunity.expectedCloseDate);
      return Boolean(due && due.getTime() < now.getTime());
    }).length;

    const opportunitiesWithActionPlan = activeOpportunities.filter((opportunity) => {
      const summary = (opportunity.description || '').trim();
      const due = this.toDate(opportunity.expectedCloseDate);
      return summary.length >= 10 && Boolean(due);
    }).length;

    const staleOpportunities14d = activeOpportunities.filter((opportunity) => {
      const ageFromUpdate = (now.getTime() - new Date(opportunity.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      return ageFromUpdate > 14;
    }).length;

    const staleOpportunities30d = activeOpportunities.filter((opportunity) => {
      const ageFromUpdate = (now.getTime() - new Date(opportunity.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      return ageFromUpdate > 30;
    }).length;

    const opportunitiesWithoutRecentActivity = activeOpportunities.filter((opportunity) => {
      const notesCount = notesByOpportunity.get(opportunity.id) || 0;
      return notesCount === 0;
    }).length;

    const highValueLowProbability = activeOpportunities.filter((opportunity) => {
      const value = Number(opportunity.value || 0);
      const probability = Number(opportunity.probability || 0);
      return value >= 100000 && probability < 30;
    }).length;

    const hygienePenalty =
      overdueNextActions * 8 +
      staleOpportunities14d * 4 +
      opportunitiesWithoutRecentActivity * 3 +
      highValueLowProbability * 2;
    const hygieneScore = Math.max(0, Math.min(100, 100 - hygienePenalty));

    const actionPlanCoverage = activeOpportunities.length > 0
      ? (opportunitiesWithActionPlan / activeOpportunities.length) * 100
      : 100;

    const commitForecast = activeOpportunities
      .filter((opportunity) => Number(opportunity.probability || 0) >= 70)
      .reduce((sum, opportunity) => sum + Number(opportunity.value || 0), 0);

    const bestCaseForecast = activeOpportunities
      .reduce((sum, opportunity) => {
        const value = Number(opportunity.value || 0);
        const probability = Math.max(Number(opportunity.probability || 0), 60);
        return sum + value * (probability / 100);
      }, 0);

    const worstCaseForecast = activeOpportunities
      .reduce((sum, opportunity) => {
        const value = Number(opportunity.value || 0);
        const probability = Math.min(Number(opportunity.probability || 0), 35);
        return sum + value * (probability / 100);
      }, 0);

    const avgTouchesPerOpportunity = activeOpportunities.length > 0
      ? activeOpportunities.reduce((sum, opportunity) => sum + (notesByOpportunity.get(opportunity.id) || 0), 0) / activeOpportunities.length
      : 0;

    const repRiskSummary = (vendorStats || []).reduce(
      (acc: { onTrack: number; risk: number; offTrack: number }, vendor: any) => {
        if (vendor.status === 'on-track') acc.onTrack += 1;
        else if (vendor.status === 'risk') acc.risk += 1;
        else acc.offTrack += 1;
        return acc;
      },
      { onTrack: 0, risk: 0, offTrack: 0 },
    );

    const riskAlerts: Array<{ level: 'high' | 'medium' | 'low'; message: string }> = [];
    if (forecastCoverage < 60) {
      riskAlerts.push({ level: 'high', message: 'Cobertura de forecast por debajo de 60% del pipeline.' });
    } else if (forecastCoverage < 85) {
      riskAlerts.push({ level: 'medium', message: 'Cobertura de forecast por debajo de 85%; revisar etapas críticas.' });
    }
    if (overdueNextActions > 0) {
      riskAlerts.push({ level: 'high', message: `Hay ${overdueNextActions} oportunidades con próxima acción vencida.` });
    }
    if (agingBuckets.bucket60plus > 0) {
      riskAlerts.push({ level: 'medium', message: `Existen ${agingBuckets.bucket60plus} oportunidades con más de 60 días en pipeline.` });
    }

    const vendorStatus = (vendorStats || []).map((vendor: any) => ({
      userId: vendor.userId,
      userName: vendor.userName,
      status: vendor.status || 'off-track',
      attainmentRevenue: Number(vendor.attainmentRevenue || 0),
      targetRevenue: Number(vendor.targetRevenue || 0),
      revenue: Number(vendor.revenue || 0),
    }));

    // ── Customer intelligence (LTV / churn / cohortes) ──────────────
    const clients = await this.prisma.salesClient.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        opportunities: {
          select: { stage: true, value: true, closedAt: true, createdAt: true },
        },
      },
      take: 500,
    });

    const customerRows = clients.map((c) => {
      const won = c.opportunities.filter((o) => o.stage === 'WON');
      const lost = c.opportunities.filter((o) => o.stage === 'LOST');
      const ltv = won.reduce((s, o) => s + Number(o.value || 0), 0);
      const lastWon = won
        .map((o) => o.closedAt)
        .filter(Boolean)
        .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] as Date | undefined;
      const inactive180 =
        !lastWon || now.getTime() - lastWon.getTime() > 180 * 86_400_000;
      return {
        id: c.id,
        nombre: c.name,
        ltv,
        wonDeals: won.length,
        lostDeals: lost.length,
        lastWonAt: lastWon?.toISOString() ?? null,
        churnRisk: inactive180 && won.length > 0,
        cohortMonth: c.createdAt.toISOString().slice(0, 7),
      };
    });

    const activeCustomers = customerRows.filter((c) => c.wonDeals > 0);
    const churnRisk = activeCustomers.filter((c) => c.churnRisk);
    const avgLtv = activeCustomers.length
      ? activeCustomers.reduce((s, c) => s + c.ltv, 0) / activeCustomers.length
      : 0;

    const cohortMap: Record<string, { customers: number; revenue: number }> = {};
    for (const c of customerRows) {
      if (!cohortMap[c.cohortMonth]) cohortMap[c.cohortMonth] = { customers: 0, revenue: 0 };
      cohortMap[c.cohortMonth].customers += 1;
      cohortMap[c.cohortMonth].revenue += c.ltv;
    }
    const cohorts = Object.entries(cohortMap)
      .map(([month, v]) => ({
        month,
        customers: v.customers,
        revenue: Math.round(v.revenue * 100) / 100,
        avgLtv: v.customers ? Math.round((v.revenue / v.customers) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12);

    const topLtv = [...customerRows]
      .sort((a, b) => b.ltv - a.ltv)
      .slice(0, 10)
      .map((c) => ({ id: c.id, nombre: c.nombre, ltv: c.ltv, wonDeals: c.wonDeals }));

    return {
      forecast: {
        weightedForecast: Number(weightedForecast.toFixed(2)),
        forecastCoverage: Number(forecastCoverage.toFixed(2)),
        commitForecast: Number(commitForecast.toFixed(2)),
        bestCaseForecast: Number(bestCaseForecast.toFixed(2)),
        worstCaseForecast: Number(worstCaseForecast.toFixed(2)),
      },
      efficiency: {
        avgCycleDays: Number(avgCycleDays.toFixed(2)),
        conversionRate: Number(metrics.conversionRate || 0),
        averageMargin: Number(metrics.averageMargin || 0),
      },
      stageDistribution,
      pipelineAging: {
        byStage: Object.entries(pipelineAgingByStage).map(([stage, data]) => ({
          stage,
          count: data.count,
          avgDays: Number(data.avgDays.toFixed(1)),
        })),
        buckets: agingBuckets,
      },
      nextActionCompliance: {
        activeOpportunities: activeOpportunities.length,
        opportunitiesWithActionPlan,
        actionPlanCoverage: Number(actionPlanCoverage.toFixed(2)),
        overdueNextActions,
      },
      pipelineHygiene: {
        score: Number(hygieneScore.toFixed(0)),
        staleOpportunities14d,
        staleOpportunities30d,
        opportunitiesWithoutRecentActivity,
        highValueLowProbability,
      },
      cadenceExecution: {
        opportunitiesWithoutRecentActivity,
        avgTouchesPerOpportunity: Number(avgTouchesPerOpportunity.toFixed(2)),
      },
      customers: {
        avgLtv: Math.round(avgLtv * 100) / 100,
        activeWithWins: activeCustomers.length,
        churnRiskCount: churnRisk.length,
        churnRiskPct: activeCustomers.length
          ? Math.round((churnRisk.length / activeCustomers.length) * 1000) / 10
          : 0,
        topLtv,
        cohorts,
      },
      repRiskSummary,
      vendorStatus,
      riskAlerts: [
        ...riskAlerts,
        ...(churnRisk.length
          ? [{ level: 'medium' as const, message: `${churnRisk.length} cliente(s) con riesgo de churn (sin win 180d)` }]
          : []),
      ],
      topActions: auditEvents
        .map((entry) => ({ action: entry.action, count: entry._count.action }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    };
  }

  async getManagerCockpit(period: 'week' | 'month' | 'year', user?: any, companyId?: number | null) {
    const startDate = this.getPeriodStart(period);
    const isManager = this.isSalesTeamManager(user);
    const ownerFilter = !isManager && user?.id ? { ownerId: user.id } : undefined;
    const now = new Date();
    const recentActivityStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [opportunities, vendorStats, notesActivity] = await Promise.all([
      this.prisma.salesOpportunity.findMany({
        where: {
          createdAt: { gte: startDate },
          ...(ownerFilter || {}),
        },
        select: {
          id: true,
          title: true,
          stage: true,
          value: true,
          probability: true,
          ownerId: true,
          expectedCloseDate: true,
          updatedAt: true,
          description: true,
        },
      }),
      this.getVendorStatsByPeriod(period, user, companyId),
      this.prisma.salesOpportunityNote.groupBy({
        by: ['opportunityId'],
        where: {
          createdAt: { gte: recentActivityStart },
          ...(ownerFilter ? { opportunity: ownerFilter } : {}),
        },
        _count: { opportunityId: true },
      }),
    ]);

    const vendorMap = new Map<number, string>();
    (vendorStats || []).forEach((vendor: any) => {
      vendorMap.set(Number(vendor.userId), vendor.userName || `Vendedor ${vendor.userId}`);
    });

    const notesByOpportunity = new Map<number, number>();
    (notesActivity || []).forEach((entry: any) => {
      notesByOpportunity.set(entry.opportunityId, Number(entry?._count?.opportunityId || 0));
    });

    const activeOpportunities = opportunities.filter((opportunity) => opportunity.stage !== 'WON' && opportunity.stage !== 'LOST');

    const coachingPriorities = activeOpportunities
      .map((opportunity) => {
        const due = this.toDate(opportunity.expectedCloseDate);
        const overdue = Boolean(due && due.getTime() < now.getTime());
        const staleDays = (now.getTime() - new Date(opportunity.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        const withoutRecentActivity = (notesByOpportunity.get(opportunity.id) || 0) === 0;
        const lowProbabilityHighValue = Number(opportunity.value || 0) >= 100000 && Number(opportunity.probability || 0) < 30;

        let riskScore = 0;
        if (overdue) riskScore += 50;
        if (staleDays > 14) riskScore += 30;
        if (withoutRecentActivity) riskScore += 20;
        if (lowProbabilityHighValue) riskScore += 10;

        return {
          opportunityId: opportunity.id,
          title: opportunity.title,
          ownerId: opportunity.ownerId,
          ownerName: vendorMap.get(Number(opportunity.ownerId || 0)) || 'Sin asignar',
          stage: opportunity.stage,
          value: Number(opportunity.value || 0),
          riskScore,
          overdue,
          staleDays: Number(staleDays.toFixed(1)),
          withoutRecentActivity,
          recommendation: overdue
            ? 'Reprogramar próxima acción hoy y registrar contacto.'
            : staleDays > 14
              ? 'Actualizar estado y ejecutar seguimiento esta semana.'
              : withoutRecentActivity
                ? 'Registrar touchpoint en las próximas 24h.'
                : 'Mantener ritmo actual.',
        };
      })
      .filter((item) => item.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    const capacityBySellerMap = new Map<number, { ownerId: number; ownerName: string; activePipeline: number; targetCapacity: number }>();
    activeOpportunities.forEach((opportunity) => {
      const ownerId = Number(opportunity.ownerId || 0);
      if (!ownerId) return;
      const current = capacityBySellerMap.get(ownerId) || {
        ownerId,
        ownerName: vendorMap.get(ownerId) || `Vendedor ${ownerId}`,
        activePipeline: 0,
        targetCapacity: 25,
      };
      current.activePipeline += 1;
      capacityBySellerMap.set(ownerId, current);
    });

    const capacityBySeller = Array.from(capacityBySellerMap.values())
      .map((item) => ({
        ...item,
        utilization: Number(((item.activePipeline / item.targetCapacity) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.utilization - a.utilization);

    const leaderboard = [...(vendorStats || [])]
      .sort((a: any, b: any) => Number(b.performance || 0) - Number(a.performance || 0))
      .slice(0, 5)
      .map((vendor: any) => ({
        userId: vendor.userId,
        userName: vendor.userName,
        performance: Number(vendor.performance || 0),
        revenue: Number(vendor.revenue || 0),
        status: vendor.status || 'off-track',
      }));

    return {
      summary: {
        activeOpportunities: activeOpportunities.length,
        coachingQueue: coachingPriorities.length,
        overdueActions: coachingPriorities.filter((item) => item.overdue).length,
      },
      coachingPriorities,
      capacityBySeller,
      leaderboard,
    };
  }

  async generateDynamicReportPdf(period: 'week' | 'month' | 'year', user?: any, includeVendorStats = false, logoUrl?: string) {
    const end = new Date();
    const start = new Date(end);

    if (period === 'week') {
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
    }

    const summary = await this.buildReportSummary(
      {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      user,
    );

    const topOpportunities = includeVendorStats
      ? summary.topOpportunities
      : summary.topOpportunities.slice(0, 4);

    const pdfBuffer = await generateSalesReportPdf({
      generatedAt: new Date(),
      rangeLabel: summary.rangeLabel,
      totals: summary.totals,
      byStage: summary.byStage,
      byLeadSource: summary.byLeadSource,
      marginByStatus: summary.marginByStatus,
      topOpportunities,
      logoUrl,
    });

    return pdfBuffer;
  }

  /** Workflow > $500k aprobado — activa ejecución del proyecto comercial. */
  async onWorkflowProjectApproved(projectId: number, companyId: number, actorId?: number) {
    const project = await this.prisma.salesProject.findFirst({
      where: { id: projectId, ...companyWhere(companyId) },
      include: { opportunity: { select: { ownerId: true } } },
    });
    if (!project) return;

    if (project.status === 'PLANNED' || project.status === 'ON_HOLD') {
      await this.prisma.salesProject.updateMany({
        where: { id: projectId, ...companyWhere(companyId) },
        data: { status: 'IN_PROGRESS' },
      });
    }

    const notifyUserId = actorId ?? project.opportunity?.ownerId;
    if (notifyUserId) {
      void this.notificationsService
        .createNotification({
          userId: notifyUserId,
          type: 'SALES_PROJECT_APPROVED',
          category: 'sales',
          title: '✅ Proyecto aprobado',
          message: `El proyecto "${project.name}" fue autorizado y puede iniciar ejecución.`,
          entityType: 'SALES_PROJECT',
          relatedEntityId: project.id,
          relatedUrl: appUrls.crmProject(project.id),
        } as any)
        .catch(() => undefined);
    }

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'SALES_PROJECT',
      entityId: projectId,
      companyId,
      userId: actorId ?? notifyUserId ?? undefined,
      payload: {
        status: 'IN_PROGRESS',
        projectApproved: true,
        name: project.name,
        budget: Number(project.budget ?? 0),
      },
    });
  }

  /** Workflow rechazado — proyecto en pausa hasta revisión. */
  async onWorkflowProjectRejected(
    projectId: number,
    companyId: number,
    actorId?: number,
    comments?: string,
  ) {
    const project = await this.prisma.salesProject.findFirst({
      where: { id: projectId, ...companyWhere(companyId) },
      include: { opportunity: { select: { ownerId: true } } },
    });
    if (!project) return;

    await this.prisma.salesProject.updateMany({
      where: { id: projectId, ...companyWhere(companyId) },
      data: { status: 'ON_HOLD' },
    });

    const notifyUserId = actorId ?? project.opportunity?.ownerId;
    if (notifyUserId) {
      const msg = comments?.trim()
        ? `El proyecto "${project.name}" no fue aprobado: ${comments.trim()}`
        : `El proyecto "${project.name}" requiere revisión.`;
      void this.notificationsService
        .createNotification({
          userId: notifyUserId,
          type: 'SALES_PROJECT_REJECTED',
          category: 'sales',
          title: 'Proyecto no autorizado',
          message: msg,
          entityType: 'SALES_PROJECT',
          relatedEntityId: project.id,
          relatedUrl: appUrls.crmProject(project.id),
        } as any)
        .catch(() => undefined);
    }

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'SALES_PROJECT',
      entityId: projectId,
      companyId,
      userId: actorId ?? notifyUserId ?? undefined,
      payload: {
        status: 'ON_HOLD',
        projectRejected: true,
        name: project.name,
        comments: comments?.trim() || null,
      },
    });
  }
}


