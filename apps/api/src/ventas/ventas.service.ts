import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
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

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cotizacionesService: CotizacionesService,
    private readonly pdfGeneratorService: PdfGeneratorService,
  ) {}

  private isSuperAdminUser(user?: any) {
    return Boolean(user?.isSuperAdmin);
  }

  private canAccessOwner(user: any, ownerId?: number | null) {
    if (!ownerId) return true;
    if (this.isSuperAdminUser(user)) return true;
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
    if (this.isSuperAdminUser(user)) return {};
    return user?.id ? { ownerId: user.id } : {};
  }

  private buildProjectOwnerWhere(user?: any) {
    if (this.isSuperAdminUser(user)) return {};
    return user?.id ? { opportunity: { ownerId: user.id } } : {};
  }

  async createClient(dto: CreateSalesClientDto, user?: any) {
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user);
    return this.prisma.salesClient.create({
      data: {
        name: dto.name,
        legalName: dto.legalName || null,
        taxId: dto.taxId || null,
        fiscalAddress: dto.fiscalAddress || null,
        billingEmail: dto.billingEmail || null,
        billingPhone: dto.billingPhone || null,
        industry: dto.industry || null,
        website: dto.website || null,
        status: dto.status || null,
        notes: dto.notes || null,
        ownerId,
        serviceClientId: dto.serviceClientId ?? null,
      },
      include: { documents: true, opportunities: true },
    });
  }

  async listClients(user?: any) {
    return this.prisma.salesClient.findMany({
      where: this.buildOwnerWhere(user),
      orderBy: { updatedAt: 'desc' },
      include: { documents: true, opportunities: true },
    });
  }

  async getClient(id: number, user?: any) {
    const client = await this.prisma.salesClient.findUnique({
      where: { id },
      include: { documents: true, opportunities: true },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    this.assertOwnerAccess(client.ownerId, user, 'cliente');
    return client;
  }

  async updateClient(id: number, dto: UpdateSalesClientDto, user?: any) {
    const existing = await this.getClient(id, user);
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user, existing.ownerId);
    return this.prisma.salesClient.update({
      where: { id },
      data: {
        name: dto.name,
        legalName: dto.legalName,
        taxId: dto.taxId,
        fiscalAddress: dto.fiscalAddress,
        billingEmail: dto.billingEmail,
        billingPhone: dto.billingPhone,
        industry: dto.industry,
        website: dto.website,
        status: dto.status,
        notes: dto.notes,
        ownerId,
        serviceClientId: dto.serviceClientId,
      },
      include: { documents: true, opportunities: true },
    });
  }

  async deleteClient(id: number, user?: any) {
    await this.getClient(id, user);
    return this.prisma.salesClient.delete({ where: { id } });
  }

  async addClientDocuments(clientId: number, type: string, files: Array<{ url: string; name?: string }>, user?: any) {
    const client = await this.getClient(clientId, user);
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

  async createLead(dto: CreateSalesLeadDto, user?: any) {
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user);
    return this.prisma.salesLead.create({
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
      },
    });
  }

  async listLeads(user?: any) {
    return this.prisma.salesLead.findMany({
      where: this.buildOwnerWhere(user),
      orderBy: { updatedAt: 'desc' },
      include: { client: true, opportunities: true },
    });
  }

  async getLead(id: number, user?: any) {
    const lead = await this.prisma.salesLead.findUnique({
      where: { id },
      include: { client: true, opportunities: true },
    });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    this.assertOwnerAccess(lead.ownerId, user, 'lead');
    return lead;
  }

  async updateLead(id: number, dto: UpdateSalesLeadDto, user?: any) {
    const existing = await this.getLead(id, user);
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

  async deleteLead(id: number, user?: any) {
    await this.getLead(id, user);
    return this.prisma.salesLead.delete({ where: { id } });
  }

  async createOpportunity(dto: CreateSalesOpportunityDto, user?: any) {
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user);
    return this.prisma.salesOpportunity.create({
      data: {
        title: dto.title,
        description: dto.description || null,
        stage: dto.stage,
        value: dto.value ?? 0,
        probability: dto.probability ?? 0,
        expectedCloseDate: dto.expectedCloseDate || null,
        clientId: dto.clientId ?? null,
        leadId: dto.leadId ?? null,
        ownerId,
      },
      include: { client: true, lead: true },
    });
  }

  async listOpportunities(user?: any) {
    return this.prisma.salesOpportunity.findMany({
      where: this.buildOwnerWhere(user),
      orderBy: { updatedAt: 'desc' },
      include: { client: true, lead: true, notes: true, evidences: true, quotes: true },
    });
  }

  async getOpportunity(id: number, user?: any) {
    const opp = await this.prisma.salesOpportunity.findUnique({
      where: { id },
      include: { client: true, lead: true, notes: true, evidences: true, quotes: true },
    });
    if (!opp) throw new NotFoundException('Oportunidad no encontrada');
    this.assertOwnerAccess(opp.ownerId, user, 'oportunidad');
    return opp;
  }

  async updateOpportunity(id: number, dto: UpdateSalesOpportunityDto, user?: any) {
    const existing = await this.getOpportunity(id, user);
    const ownerId = this.resolveOwnerForWrite(dto.ownerId, user, existing.ownerId);
    return this.prisma.salesOpportunity.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        stage: dto.stage,
        value: dto.value,
        probability: dto.probability,
        expectedCloseDate: dto.expectedCloseDate,
        closedAt: dto.closedAt,
        clientId: dto.clientId,
        leadId: dto.leadId,
        ownerId,
      },
      include: { client: true, lead: true, notes: true, evidences: true, quotes: true },
    });
  }

  async deleteOpportunity(id: number, user?: any) {
    await this.getOpportunity(id, user);
    return this.prisma.salesOpportunity.delete({ where: { id } });
  }

  async addOpportunityNote(opportunityId: number, dto: CreateSalesOpportunityNoteDto, user?: any) {
    await this.getOpportunity(opportunityId, user);
    return this.prisma.salesOpportunityNote.create({
      data: {
        opportunityId,
        message: dto.message,
        createdById: user?.id || null,
      },
    });
  }

  async addOpportunityEvidence(opportunityId: number, files: Array<{ url: string; name?: string; kind?: string }>, user?: any) {
    await this.getOpportunity(opportunityId, user);
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

  async addOpportunityQuote(opportunityId: number, dto: CreateSalesOpportunityQuoteDto, user?: any) {
    await this.getOpportunity(opportunityId, user);
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

  async listOpportunityQuotes(opportunityId: number, user?: any) {
    await this.getOpportunity(opportunityId, user);
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

  async createProject(dto: CreateSalesProjectDto, user?: any) {
    await this.getOpportunity(dto.opportunityId, user);
    const margin = this.calculateProjectMargin(dto);
    return this.prisma.salesProject.create({
      data: {
        opportunityId: dto.opportunityId,
        name: dto.name,
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
  }

  async listProjects(user?: any) {
    return this.prisma.salesProject.findMany({
      where: this.buildProjectOwnerWhere(user),
      orderBy: { updatedAt: 'desc' },
      include: { opportunity: true },
    });
  }

  async updateProject(id: number, dto: UpdateSalesProjectDto, user?: any) {
    const project = await this.prisma.salesProject.findUnique({ where: { id }, include: { opportunity: true } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');
    const margin = this.calculateProjectMargin(dto);
    return this.prisma.salesProject.update({
      where: { id },
      data: {
        name: dto.name,
        budget: dto.budget,
        costProducts: dto.costProducts,
        costViaticos: dto.costViaticos,
        costOperativo: dto.costOperativo,
        margin,
        status: dto.status,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
      include: { opportunity: true },
    });
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

  /**
   * Calcula costos totales y margen de un proyecto
   */
  async calculateProjectCosts(projectId: number, user?: any) {
    const project = await this.prisma.salesProject.findUnique({
      where: { id: projectId },
      include: { opportunity: true },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    const costProducts = Number(project.costProducts) || 0;
    const costViaticos = Number(project.costViaticos) || 0;
    const costOperativo = Number(project.costOperativo) || 0;
    const totalCost = costProducts + costViaticos + costOperativo;
    const budget = Number(project.budget) || 0;
    const margin = budget - totalCost;
    const marginPercent = budget > 0 ? (margin / budget) * 100 : 0;
    const isOverBudget = totalCost > budget;

    return {
      costProducts,
      costViaticos,
      costOperativo,
      totalCost,
      budget,
      margin,
      marginPercent: Number(marginPercent.toFixed(2)),
      isOverBudget,
    };
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
  ) {
    const project = await this.prisma.salesProject.findUnique({
      where: { id: projectId },
      include: { opportunity: true },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

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
  async validateProjectBudget(projectId: number, user?: any) {
    const costs = await this.calculateProjectCosts(projectId, user);

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
  async syncViaticosToProject(projectId: number, user?: any) {
    const project = await this.prisma.salesProject.findUnique({
      where: { id: projectId },
      include: { viaticos: true, opportunity: true },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    // Sumar todos los viaticos
    const totalViaticos = project.viaticos.reduce((sum, v) => {
      return sum + (Number(v.montoSolicitado) || 0);
    }, 0);

    // Actualizar proyecto con los costos sincronizados
    return this.updateProjectCosts(projectId, {
      costViaticos: totalViaticos,
    }, user);
  }

  async closeProject(projectId: number, user?: any) {
    const project = await this.prisma.salesProject.findUnique({
      where: { id: projectId },
      include: {
        opportunity: {
          include: {
            client: true,
            quotes: { orderBy: { createdAt: 'desc' }, take: 1, include: { cotizacion: { include: { items: true } } } },
            owner: true,
          },
        },
        closureOrder: true,
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    // Evitar duplicar si ya existe una orden de cierre
    if (project.closureOrder) {
      return project.closureOrder;
    }

    // Validar que no está en overspend
    const validation = await this.validateProjectBudget(projectId, user);
    if (!validation.valid) {
      throw new BadRequestException(`Cannot close project: ${validation.message}`);
    }

    // Obtener la última cotización
    const lastQuote = project.opportunity.quotes?.[0];
    const client = project.opportunity.client;

    // Generar orden PDF usando el nuevo servicio
    let orderPdfBuffer: Buffer;
    try {
      orderPdfBuffer = await this.pdfGeneratorService.generateOrderPdf(projectId);
    } catch (error) {
      // Fallback: usar el servicio anterior si genera error
      const { generateSalesOrderPdf } = await import('./sales-order-pdf.js');
      orderPdfBuffer = generateSalesOrderPdf({
        orderId: `ORD-${Date.now()}-${projectId}`,
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

    // Guardar orden PDF en servidor
    const dir = path.resolve(process.cwd(), 'uploads', 'sales-orders');
    const orderId = `ORD-${Date.now()}-${projectId}`;
    const filename = `orden-${orderId}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outPath, orderPdfBuffer);
    const orderPdfUrl = `/uploads/sales-orders/${filename}`;

    // Crear registro de orden en BD
    const order = await this.prisma.salesProjectOrder.create({
      data: {
        projectId,
        orderId,
        quoteId: lastQuote?.id,
        orderPdfUrl,
        status: 'OPEN',
        createdById: user?.id,
      },
      include: { project: true, quote: true, createdBy: true },
    });

    // Actualizar proyecto: cambiar status a CLOSED y linkar con orden
    await this.prisma.salesProject.update({
      where: { id: projectId },
      data: {
        status: 'CLOSED',
        closureOrderId: order.id,
        endDate: new Date(),
      },
    });

    return order;
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
    };
  }

  async getProjectOrder(projectId: number, user?: any) {
    const order = await this.prisma.salesProjectOrder.findUnique({
      where: { projectId },
      include: { project: { include: { opportunity: true } }, quote: true, createdBy: true },
    });
    if (!order) return null;
    this.assertOwnerAccess(order.project?.opportunity?.ownerId, user, 'proyecto');
    return order;
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

  async linkCotizacionToOpportunity(cotizacionId: number, opportunityId: number, user?: any, versionLabel?: string) {
    // Verify opportunity exists and ownership
    await this.getOpportunity(opportunityId, user);

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

  async getProjectViaticos(projectId: number, user?: any) {
    const project = await this.prisma.salesProject.findUnique({
      where: { id: projectId },
      include: { opportunity: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    return this.prisma.viatico.findMany({
      where: { projectId },
      include: { User: true },
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  async assignViaticosToProject(projectId: number, viaticIds: number[], user?: any) {
    const project = await this.prisma.salesProject.findUnique({
      where: { id: projectId },
      include: { opportunity: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

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
      const project = await this.prisma.salesProject.findUnique({
        where: { id: projectId },
        include: { opportunity: true },
      });

      if (!project) throw new NotFoundException('Proyecto no encontrado');

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

  async getProjectExpensesSummary(projectId: number, user?: any) {
    const project = await this.prisma.salesProject.findUnique({
      where: { id: projectId },
      include: { viaticos: true, opportunity: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    this.assertOwnerAccess(project.opportunity?.ownerId, user, 'proyecto');

    const viaticosCount = project.viaticos.length;
    const totalViaticoCost = project.viaticos.reduce(
      (sum, v) => sum + Number(v.montoSolicitado || 0),
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
    };
  }

  // ==================== ORDER TEMPLATES ====================

  async createOrderTemplate(dto: CreateOrderTemplateDto, userId?: number) {
    // If this is default, unset previous defaults
    if (dto.isDefault) {
      await this.prisma.orderTemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.orderTemplate.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        isDefault: dto.isDefault ?? false,
        headerLogo: dto.headerLogo || null,
        headerText: dto.headerText || null,
        companyName: dto.companyName || null,
        companyEmail: dto.companyEmail || null,
        companyPhone: dto.companyPhone || null,
        footerText: dto.footerText || null,
        footerAlignment: dto.footerAlignment || 'center',
        primaryColor: dto.primaryColor || '#0f6ad6',
        secondaryColor: dto.secondaryColor || '#f5f5f5',
        textColor: dto.textColor || '#000000',
        sections: dto.sections || null,
        customCss: dto.customCss || null,
        createdById: userId || null,
      },
      include: { createdBy: true },
    });
  }

  async listOrderTemplates() {
    return this.prisma.orderTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true },
    });
  }

  async getOrderTemplate(id: number) {
    const template = await this.prisma.orderTemplate.findUnique({
      where: { id },
      include: { createdBy: true },
    });
    if (!template) throw new NotFoundException('Template no encontrado');
    return template;
  }

  async updateOrderTemplate(id: number, dto: UpdateOrderTemplateDto) {
    await this.getOrderTemplate(id);

    // If setting as default, unset previous defaults
    if (dto.isDefault) {
      await this.prisma.orderTemplate.updateMany({
        where: { isDefault: true, id: { not: id } },
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
        footerAlignment: dto.footerAlignment,
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        textColor: dto.textColor,
        sections: dto.sections,
        customCss: dto.customCss,
      },
      include: { createdBy: true },
    });
  }

  async deleteOrderTemplate(id: number) {
    await this.getOrderTemplate(id);
    return this.prisma.orderTemplate.delete({ where: { id } });
  }

  async getDefaultOrderTemplate() {
    return this.prisma.orderTemplate.findFirst({
      where: { isDefault: true },
      include: { createdBy: true },
    });
  }

  async setOrderTemplateAsDefault(id: number) {
    await this.getOrderTemplate(id);

    // Unset all previous defaults
    await this.prisma.orderTemplate.updateMany({
      where: { isDefault: true },
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

    // Get closed projects and sales
    const ownerFilter = !this.isSuperAdminUser(user) && user?.id ? { owner: { id: user.id } } : undefined;

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
        ...(ownerFilter ? { ownerId: user.id } : {}),
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

  async getVendorStatsByPeriod(period: 'week' | 'month' | 'year', user?: any) {
    const now = new Date();
    let startDate = new Date();

    if (period === 'week') {
      startDate.setDate(now.getDate() - now.getDay());
    } else if (period === 'month') {
      startDate.setDate(1);
    } else if (period === 'year') {
      startDate.setMonth(0, 1);
    }

    if (!this.isSuperAdminUser(user)) {
      const metrics = await this.getMetricsByPeriod(period, user);
      const performance = Math.min(100, (metrics.totalRevenue / 1000000) * 100 + metrics.conversionRate);
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
        },
      ];
    }

    // Get all sales owner users
    const users = await this.prisma.user.findMany({
      where: {
        salesOpportunitiesOwned: {
          some: {
            createdAt: { gte: startDate },
          },
        },
      },
      include: {
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

    return vendorStats.sort((a, b) => b.revenue - a.revenue);
  }

  async generateDynamicReportPdf(period: 'week' | 'month' | 'year', user?: any, includeVendorStats = false, logoUrl?: string) {
    const metrics = await this.getMetricsByPeriod(period, user);

    // Build summary for PDF payload
    const periodLabel = period === 'week' ? 'Esta Semana' : period === 'month' ? 'Este Mes' : 'Este Año';

    const pdfBuffer = await generateSalesReportPdf({
      generatedAt: new Date(),
      rangeLabel: periodLabel,
      totals: {
        leads: 0,
        opportunities: metrics.opportunityCount,
        won: metrics.projectCount,
        lost: 0,
        pipelineValue: metrics.pipelineValue,
        expectedValue: metrics.totalRevenue,
        projects: metrics.projectCount,
        totalMargin: metrics.averageMargin,
        quotes: 0,
        clients: metrics.activeClients,
      },
      byStage: [],
      byLeadSource: [],
      marginByStatus: [],
      topOpportunities: [],
      logoUrl,
    });

    return pdfBuffer;
  }
}
