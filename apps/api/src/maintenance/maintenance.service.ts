import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Assets ────────────────────────────────────────────────────────
  async createAsset(dto: {
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
  }) {
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
      },
    });
  }

  async listAssets(filters?: { status?: string; category?: string }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    return this.prisma.asset.findMany({
      where,
      include: { childAssets: true },
      orderBy: { name: 'asc' },
    });
  }

  async getAsset(id: number) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { parentAsset: true, childAssets: true, maintenanceSchedules: true, maintenanceOrders: { take: 10, orderBy: { createdAt: 'desc' } } },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado');
    return asset;
  }

  async updateAsset(id: number, dto: any) {
    return this.prisma.asset.update({ where: { id }, data: dto });
  }

  // ── Maintenance Schedules ─────────────────────────────────────────
  async createSchedule(dto: {
    assetId: number;
    title: string;
    type?: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
    frequencyDays: number;
    description?: string;
    lastExecutedAt?: string;
    nextDueDate: string;
  }) {
    return this.prisma.maintenanceSchedule.create({
      data: {
        assetId: dto.assetId,
        title: dto.title.trim(),
        type: dto.type || 'PREVENTIVE',
        frequencyDays: dto.frequencyDays,
        description: dto.description?.trim() || null,
        lastExecutedAt: dto.lastExecutedAt ? new Date(dto.lastExecutedAt) : null,
        nextDueDate: new Date(dto.nextDueDate),
      },
    });
  }

  async listSchedules(assetId?: number) {
    const where: any = {};
    if (assetId) where.assetId = assetId;
    return this.prisma.maintenanceSchedule.findMany({
      where,
      include: { asset: true },
      orderBy: { nextDueDate: 'asc' },
    });
  }

  async getOverdueSchedules() {
    return this.prisma.maintenanceSchedule.findMany({
      where: { isActive: true, nextDueDate: { lt: new Date() } },
      include: { asset: true },
      orderBy: { nextDueDate: 'asc' },
    });
  }

  // ── Maintenance Work Orders ───────────────────────────────────────
  private async generateWONumber(): Promise<string> {
    const count = await this.prisma.maintenanceOrder.count();
    return `MO-${String(count + 1).padStart(6, '0')}`;
  }

  async createWorkOrder(dto: {
    assetId: number;
    scheduleId?: number;
    title: string;
    description?: string;
    type: 'PREVENTIVE' | 'CORRECTIVE' | 'PREDICTIVE';
    priority?: string;
    assignedToId?: number;
    plannedDate: string;
  }, userId: number) {
    const orderNumber = await this.generateWONumber();
    return this.prisma.maintenanceOrder.create({
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
      },
      include: { asset: true, assignedTo: { select: { id: true, nombre: true } } },
    });
  }

  async listWorkOrders(filters?: { status?: string; assetId?: number; assignedToId?: number }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.assetId) where.assetId = filters.assetId;
    if (filters?.assignedToId) where.assignedToId = filters.assignedToId;
    return this.prisma.maintenanceOrder.findMany({
      where,
      include: { asset: true, assignedTo: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWorkOrder(id: number) {
    const wo = await this.prisma.maintenanceOrder.findUnique({
      where: { id },
      include: { asset: true, assignedTo: { select: { id: true, nombre: true } }, createdBy: { select: { id: true, nombre: true } }, parts: { include: { product: true } }, schedule: true },
    });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    return wo;
  }

  async startWorkOrder(id: number) {
    return this.prisma.maintenanceOrder.update({
      where: { id },
      data: { status: 'IN_PROGRESS' },
    });
  }

  async completeWorkOrder(id: number, dto: { laborCost?: number; partsCost?: number; notes?: string }) {
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

    // Update schedule nextDue if linked
    if (order.scheduleId) {
      const schedule = await this.prisma.maintenanceSchedule.findUnique({ where: { id: order.scheduleId } });
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

  async addPartToWorkOrder(workOrderId: number, dto: { productId?: number; partName: string; quantity: number; unitCost?: number }) {
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

  // ── Asset Depreciation ────────────────────────────────────────────

  async getAssetDepreciation(assetId: number) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Activo no encontrado');
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

  async getDepreciationSummary() {
    const assets = await this.prisma.asset.findMany({
      where: {
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
}
