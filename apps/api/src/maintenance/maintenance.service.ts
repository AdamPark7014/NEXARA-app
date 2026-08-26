import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { FolioService } from '../common/folio/folio.service.js';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly folio: FolioService,
    private readonly domainEvents: DomainEventBusService,
  ) {}

  // ── Assets ────────────────────────────────────────────────────────
  async createAsset(
    dto: {
      name: string;
      code: string;
      description?: string;
      category?: string;
      location?: string;
      serialNumber?: string;
      manufacturer?: string;
      model?: string;
      purchaseDate?: string;
      purchaseCost?: number;
      warrantyExpiry?: string;
      responsibleId?: number;
      parentAssetId?: number;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.asset.create({
      data: {
        name: dto.name.trim(),
        code: dto.code.trim(),
        description: dto.description?.trim() || null,
        category: dto.category?.trim() || null,
        location: dto.location?.trim() || null,
        serialNumber: dto.serialNumber?.trim() || null,
        manufacturer: dto.manufacturer?.trim() || null,
        model: dto.model?.trim() || null,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
        purchaseCost: dto.purchaseCost ? new Prisma.Decimal(dto.purchaseCost) : null,
        warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : null,
        responsibleId: dto.responsibleId ?? null,
        parentAssetId: dto.parentAssetId ?? null,
        companyId: tenantId,
      },
    });
  }

  async listAssets(companyId?: number | null, filters?: { status?: string; category?: string }) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    return this.prisma.asset.findMany({
      where,
      include: { childAssets: true },
      orderBy: { name: 'asc' },
    });
  }

  async getAsset(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const asset = await this.prisma.asset.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: { parentAsset: true, childAssets: true, maintenanceSchedules: true, maintenanceOrders: { take: 10, orderBy: { createdAt: 'desc' } } },
    });
    assertCompanyAccess(asset, tenantId, 'Activo');
    return asset;
  }

  async updateAsset(id: number, dto: any, companyId?: number | null) {
    await this.getAsset(id, companyId);
    return this.prisma.asset.update({ where: { id }, data: dto });
  }

  // ── Maintenance Schedules ─────────────────────────────────────────
  async createSchedule(
    dto: {
      assetId: number;
      title: string;
      type?: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
      frequencyDays: number;
      description?: string;
      lastExecutedAt?: string;
      nextDueDate: string;
    },
    companyId?: number | null,
  ) {
    const asset = await this.getAsset(dto.assetId, companyId);
    return this.prisma.maintenanceSchedule.create({
      data: {
        assetId: dto.assetId,
        title: dto.title.trim(),
        type: dto.type || 'PREVENTIVE',
        frequencyDays: dto.frequencyDays,
        description: dto.description?.trim() || null,
        lastExecutedAt: dto.lastExecutedAt ? new Date(dto.lastExecutedAt) : null,
        nextDueDate: new Date(dto.nextDueDate),
        companyId: asset.companyId,
      },
    });
  }

  async listSchedules(companyId?: number | null, assetId?: number) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
    if (assetId) where.assetId = assetId;
    return this.prisma.maintenanceSchedule.findMany({
      where,
      include: { asset: true },
      orderBy: { nextDueDate: 'asc' },
    });
  }

  async getOverdueSchedules(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.maintenanceSchedule.findMany({
      where: {
        ...companyWhere(tenantId),
        isActive: true,
        nextDueDate: { lt: new Date() },
      },
      include: { asset: true },
      orderBy: { nextDueDate: 'asc' },
    });
  }

  // ── Maintenance Work Orders ───────────────────────────────────────
  private generateWONumber(companyId: number): Promise<string> {
    return this.folio.next('MAINTENANCE_ORDER', companyId);
  }

  async createWorkOrder(
    dto: {
      assetId: number;
      scheduleId?: number;
      title: string;
      description?: string;
      type: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
      priority?: string;
      assignedToId?: number;
      plannedDate: string;
    },
    userId: number,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.getAsset(dto.assetId, tenantId);
    if (dto.scheduleId) {
      const schedule = await this.prisma.maintenanceSchedule.findFirst({
        where: { id: dto.scheduleId, ...companyWhere(tenantId) },
      });
      assertCompanyAccess(schedule, tenantId, 'Programa de mantenimiento');
      if (schedule.assetId !== dto.assetId) {
        throw new NotFoundException('Programa de mantenimiento no encontrado');
      }
    }
    const orderNumber = await this.generateWONumber(tenantId);
    const wo = await this.prisma.maintenanceOrder.create({
      data: {
        orderNumber,
        assetId: dto.assetId,
        scheduleId: dto.scheduleId ?? null,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        type: dto.type,
        priority: dto.priority || 'NORMAL',
        assignedToId: dto.assignedToId ?? null,
        plannedDate: new Date(dto.plannedDate),
        createdById: userId,
        companyId: tenantId,
      },
      include: { asset: true, assignedTo: { select: { id: true, nombre: true } } },
    });
    void this.notificationHierarchy
      .notifyMaintenanceWorkOrderCreated(userId, wo.id, wo.orderNumber, wo.title, wo.assignedToId)
      .catch(() => undefined);

    this.domainEvents.publishEntityLifecycle('created', {
      entityType: 'MAINTENANCE_ORDER',
      entityId: wo.id,
      companyId: wo.companyId,
      userId,
      payload: {
        orderNumber: wo.orderNumber,
        title: wo.title,
        type: wo.type,
        priority: wo.priority,
        status: wo.status,
        assetId: wo.assetId,
        assignedToId: wo.assignedToId,
      },
    });

    return wo;
  }

  async listWorkOrders(
    companyId?: number | null,
    filters?: { status?: string; assetId?: number; assignedToId?: number },
  ) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
    if (filters?.status) where.status = filters.status;
    if (filters?.assetId) where.assetId = filters.assetId;
    if (filters?.assignedToId) where.assignedToId = filters.assignedToId;
    return this.prisma.maintenanceOrder.findMany({
      where,
      include: { asset: true, assignedTo: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWorkOrder(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const wo = await this.prisma.maintenanceOrder.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: { asset: true, assignedTo: { select: { id: true, nombre: true } }, createdBy: { select: { id: true, nombre: true } }, parts: { include: { product: true } }, schedule: true },
    });
    assertCompanyAccess(wo, tenantId, 'Orden de mantenimiento');
    return wo;
  }

  async startWorkOrder(id: number, companyId?: number | null) {
    await this.getWorkOrder(id, companyId);
    return this.prisma.maintenanceOrder.update({
      where: { id },
      data: { status: 'IN_PROGRESS' },
    });
  }

  async completeWorkOrder(
    id: number,
    dto: { laborCost?: number; partsCost?: number; notes?: string },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    await this.getWorkOrder(id, tenantId);
    const order = await this.prisma.maintenanceOrder.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedDate: new Date(),
        laborCost: dto.laborCost ? new Prisma.Decimal(dto.laborCost) : undefined,
        partsCost: dto.partsCost ? new Prisma.Decimal(dto.partsCost) : undefined,
        workPerformed: dto.notes?.trim() || null,
      },
    });

    if (order.scheduleId) {
      const schedule = await this.prisma.maintenanceSchedule.findFirst({
        where: { id: order.scheduleId, ...companyWhere(tenantId) },
      });
      if (schedule && schedule.frequencyDays) {
        const next = new Date();
        next.setDate(next.getDate() + schedule.frequencyDays);
        await this.prisma.maintenanceSchedule.update({
          where: { id: schedule.id },
          data: { lastExecutedAt: new Date(), nextDueDate: next },
        });
      }
    }

    return order;
  }

  async addPartToWorkOrder(
    workOrderId: number,
    dto: { productId?: number; partName: string; quantity: number; unitCost?: number },
    companyId?: number | null,
  ) {
    await this.getWorkOrder(workOrderId, companyId);
    return this.prisma.maintenanceOrderPart.create({
      data: {
        maintenanceOrderId: workOrderId,
        productId: dto.productId ?? null,
        partName: dto.partName.trim(),
        quantity: new Prisma.Decimal(dto.quantity),
        unitCost: dto.unitCost ? new Prisma.Decimal(dto.unitCost) : undefined,
      },
      include: { product: true },
    });
  }

  async getAssetDepreciation(assetId: number, companyId?: number | null) {
    const asset = await this.getAsset(assetId, companyId);
    if (!asset.purchaseCost || !asset.purchaseDate || !asset.expectedLifeYears) {
      return { assetId, code: asset.code, name: asset.name, message: 'Datos insuficientes para calcular depreciación' };
    }

    const cost = Number(asset.purchaseCost);
    const lifeYears = asset.expectedLifeYears;
    const annualDep = cost / lifeYears;
    const purchaseDate = new Date(asset.purchaseDate);
    const now = new Date();
    const yearsElapsed = (now.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const totalDepreciated = Math.min(annualDep * yearsElapsed, cost);
    const bookValue = Math.max(cost - totalDepreciated, 0);

    const schedule = [];
    for (let y = 1; y <= lifeYears; y++) {
      const yearEnd = new Date(purchaseDate);
      yearEnd.setFullYear(yearEnd.getFullYear() + y);
      const accDep = Math.min(annualDep * y, cost);
      schedule.push({
        year: y,
        date: yearEnd.toISOString().slice(0, 10),
        depreciation: Math.round(annualDep * 100) / 100,
        accumulatedDepreciation: Math.round(accDep * 100) / 100,
        bookValue: Math.round((cost - accDep) * 100) / 100,
      });
    }

    return {
      assetId: asset.id,
      code: asset.code,
      name: asset.name,
      purchaseCost: cost,
      purchaseDate: purchaseDate.toISOString().slice(0, 10),
      expectedLifeYears: lifeYears,
      method: 'STRAIGHT_LINE',
      annualDepreciation: Math.round(annualDep * 100) / 100,
      yearsElapsed: Math.round(yearsElapsed * 100) / 100,
      totalDepreciated: Math.round(totalDepreciated * 100) / 100,
      currentBookValue: Math.round(bookValue * 100) / 100,
      fullyDepreciated: bookValue === 0,
      schedule,
    };
  }

  async getDepreciationSummary(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const assets = await this.prisma.asset.findMany({
      where: {
        ...companyWhere(tenantId),
        purchaseCost: { not: null },
        purchaseDate: { not: null },
        expectedLifeYears: { not: null },
        deletedAt: null,
      },
      select: { id: true, code: true, name: true, purchaseCost: true, purchaseDate: true, expectedLifeYears: true },
    });

    const now = new Date();
    let totalOriginalCost = 0;
    let totalBookValue = 0;
    let totalDepreciated = 0;

    const items = assets.map((a: any) => {
      const cost = Number(a.purchaseCost);
      const yearsElapsed = (now.getTime() - new Date(a.purchaseDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      const annualDep = cost / a.expectedLifeYears;
      const dep = Math.min(annualDep * yearsElapsed, cost);
      const book = Math.max(cost - dep, 0);

      totalOriginalCost += cost;
      totalBookValue += book;
      totalDepreciated += dep;

      return {
        assetId: a.id,
        code: a.code,
        name: a.name,
        purchaseCost: cost,
        currentBookValue: Math.round(book * 100) / 100,
        depreciated: Math.round(dep * 100) / 100,
        fullyDepreciated: book === 0,
      };
    });

    return {
      totalAssets: items.length,
      totalOriginalCost: Math.round(totalOriginalCost * 100) / 100,
      totalBookValue: Math.round(totalBookValue * 100) / 100,
      totalDepreciated: Math.round(totalDepreciated * 100) / 100,
      items,
    };
  }

  /** CMMS intelligence: risk, cost, recommendations. */
  async getCmmsIntelligence(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const [overdue, openWo, assetsDown, dep] = await Promise.all([
      this.getOverdueSchedules(tenantId),
      this.prisma.maintenanceOrder.count({
        where: { ...companyWhere(tenantId), status: { in: ['PLANNED', 'IN_PROGRESS'] } },
      }),
      this.prisma.asset.count({
        where: { ...companyWhere(tenantId), status: { in: ['OUT_OF_SERVICE', 'UNDER_MAINTENANCE'] as any } },
      }),
      this.getDepreciationSummary(tenantId),
    ]);

    const overdueCount = overdue.length;
    const estimatedRiskCost = overdueCount * 8500 + assetsDown * 15000;

    return {
      what: {
        overdueSchedules: overdueCount,
        openWorkOrders: openWo,
        assetsDownOrMaintenance: assetsDown,
        bookValue: dep.totalBookValue,
      },
      why:
        overdueCount > 0
          ? 'Hay planes preventivos vencidos sin ejecutar'
          : assetsDown > 0
            ? 'Hay activos fuera de servicio'
            : 'CMMS dentro de umbrales',
      willHappen:
        overdueCount > 3
          ? 'Alta probabilidad de fallas correctivas costosas en 30 días'
          : 'Riesgo controlado si se mantiene el plan preventivo',
      recommendations: [
        ...(overdueCount > 0
          ? [{ action: `Generar OT para ${overdueCount} preventivos vencidos`, priority: 'P0' as const }]
          : []),
        ...(assetsDown > 0
          ? [{ action: `Priorizar reparación de ${assetsDown} activos DOWN`, priority: 'P0' as const }]
          : []),
        { action: 'Revisar backlog de OT abiertas semanalmente', priority: 'P2' as const },
      ],
      risk: overdueCount > 3 || assetsDown > 0 ? 'high' : overdueCount > 0 ? 'medium' : 'low',
      cost: { estimatedExposureMxn: estimatedRiskCost, currency: 'MXN' },
      owners: { cmms: 'Jefe de Mantenimiento', finance: 'Controller' },
    };
  }
}
