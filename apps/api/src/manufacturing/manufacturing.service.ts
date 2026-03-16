import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';

@Injectable()
export class ManufacturingService {
  constructor(private readonly prisma: PrismaService) {}

  // Bill of Materials
  async createBOM(dto: {
    productId: number;
    name: string;
    version?: string;
    description?: string;
    components: Array<{ componentProductId: number; quantity: number; unit?: string; wastePercent?: number; notes?: string }>;
  }) {
    return this.prisma.billOfMaterials.create({
      data: {
        productId: dto.productId,
        name: dto.name.trim(),
        version: dto.version?.trim() || '1.0',
        description: dto.description?.trim() || null,
        components: {
          create: dto.components.map((c) => ({
            componentProductId: c.componentProductId,
            quantity: new Prisma.Decimal(c.quantity),
            unit: c.unit?.trim() || 'PZ',
            wastePercent: new Prisma.Decimal(c.wastePercent || 0),
            notes: c.notes?.trim() || null,
          })),
        },
      },
      include: { components: { include: { componentProduct: true } }, product: true },
    });
  }

  async listBOMs(productId?: number) {
    const where: any = {};
    if (productId) where.productId = productId;
    return this.prisma.billOfMaterials.findMany({
      where,
      include: { components: { include: { componentProduct: true } }, product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBOM(id: number) {
    const bom = await this.prisma.billOfMaterials.findUnique({
      where: { id },
      include: { components: { include: { componentProduct: true } }, product: true },
    });
    if (!bom) throw new NotFoundException('BOM no encontrada');
    return bom;
  }

  // Work Centers
  async createWorkCenter(dto: { name: string; code: string; description?: string; capacityPerHour?: number; costPerHour?: number }) {
    return this.prisma.workCenter.create({
      data: {
        name: dto.name.trim(),
        code: dto.code.trim(),
        description: dto.description?.trim() || null,
        capacityPerHour: dto.capacityPerHour ? new Prisma.Decimal(dto.capacityPerHour) : undefined,
        costPerHour: dto.costPerHour ? new Prisma.Decimal(dto.costPerHour) : undefined,
      },
    });
  }

  async listWorkCenters() {
    return this.prisma.workCenter.findMany({ orderBy: { name: 'asc' } });
  }

  // Production Routings
  async createRouting(dto: {
    bomId: number;
    workCenterId: number;
    operationName: string;
    operationNumber: number;
    setupTimeMin?: number;
    runTimeMin?: number;
    description?: string;
  }) {
    return this.prisma.productionRouting.create({
      data: {
        bomId: dto.bomId,
        workCenterId: dto.workCenterId,
        operationName: dto.operationName.trim(),
        operationNumber: dto.operationNumber,
        setupTimeMin: dto.setupTimeMin || 0,
        runTimeMin: dto.runTimeMin || 0,
        description: dto.description?.trim() || null,
      },
      include: { workCenter: true },
    });
  }

  async listRoutings(bomId: number) {
    return this.prisma.productionRouting.findMany({
      where: { bomId },
      include: { workCenter: true },
      orderBy: { operationNumber: 'asc' },
    });
  }

  // Production Orders
  private async generateProdNumber(): Promise<string> {
    const count = await this.prisma.productionOrder.count();
    return `PROD-${String(count + 1).padStart(6, '0')}`;
  }

  async createProductionOrder(dto: {
    productId: number;
    bomId: number;
    plannedQty: number;
    plannedStartDate?: string;
    plannedEndDate?: string;
    priority?: string;
    notes?: string;
  }, userId: number) {
    const orderNumber = await this.generateProdNumber();
    return this.prisma.productionOrder.create({
      data: {
        orderNumber,
        productId: dto.productId,
        bomId: dto.bomId,
        plannedQty: new Prisma.Decimal(dto.plannedQty),
        plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
        priority: dto.priority || 'NORMAL',
        notes: dto.notes?.trim() || null,
        createdById: userId,
      },
      include: { product: true, bom: { include: { components: true } } },
    });
  }

  async listProductionOrders(filters?: { status?: string }, query?: PaginationQueryDto) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    const include = { product: true, bom: true, createdBy: { select: { id: true, nombre: true } } };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.productionOrder.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.productionOrder.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.productionOrder.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  }

  async getProductionOrder(id: number) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: { product: true, bom: { include: { components: { include: { componentProduct: true } } } }, logs: true, createdBy: { select: { id: true, nombre: true } } },
    });
    if (!order) throw new NotFoundException('Orden de produccion no encontrada');
    return order;
  }

  async startProductionOrder(id: number) {
    return this.prisma.productionOrder.update({
      where: { id },
      data: { status: 'IN_PROGRESS', actualStartDate: new Date() },
    });
  }

  async completeProductionOrder(id: number, completedQty: number) {
    return this.prisma.productionOrder.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        actualEndDate: new Date(),
        completedQty: new Prisma.Decimal(completedQty),
      },
    });
  }

  // Production Logs
  async createProductionLog(dto: {
    productionOrderId: number;
    workCenterId: number;
    operationName: string;
    startTime: string;
    endTime?: string;
    quantityProduced?: number;
    quantityScrapped?: number;
    notes?: string;
  }, userId: number) {
    return this.prisma.productionLog.create({
      data: {
        productionOrderId: dto.productionOrderId,
        workCenterId: dto.workCenterId,
        operationName: dto.operationName.trim(),
        startTime: new Date(dto.startTime),
        endTime: dto.endTime ? new Date(dto.endTime) : null,
        quantityProduced: dto.quantityProduced ? new Prisma.Decimal(dto.quantityProduced) : undefined,
        quantityScrapped: dto.quantityScrapped ? new Prisma.Decimal(dto.quantityScrapped) : undefined,
        notes: dto.notes?.trim() || null,
        operatorId: userId,
      },
    });
  }

  async listProductionLogs(productionOrderId: number) {
    return this.prisma.productionLog.findMany({
      where: { productionOrderId },
      include: { operator: { select: { id: true, nombre: true } }, workCenter: true },
      orderBy: { startTime: 'asc' },
    });
  }

  // ── Production Scheduling ─────────────────────────────────────────
  async getProductionSchedule(from?: string, to?: string) {
    const where: any = { status: { in: ['PLANNED', 'IN_PROGRESS'] } };
    if (from || to) {
      where.plannedStartDate = {};
      if (from) where.plannedStartDate.gte = new Date(from);
      if (to) where.plannedStartDate.lte = new Date(to);
    }
    return this.prisma.productionOrder.findMany({
      where,
      include: {
        product: true,
        bom: { include: { components: { include: { componentProduct: true } } } },
        createdBy: { select: { id: true, nombre: true } },
      },
      orderBy: [{ priority: 'asc' }, { plannedStartDate: 'asc' }],
    });
  }

  async getWorkCenterUtilization(from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const hasDateFilter = from || to;

    const workCenters = await this.prisma.workCenter.findMany({
      include: {
        productionLogs: {
          where: hasDateFilter ? { startTime: dateFilter } : undefined,
        },
      },
    });

    return workCenters.map((wc) => {
      const totalMinutes = wc.productionLogs.reduce((sum, log) => {
        if (!log.endTime) return sum;
        return sum + (log.endTime.getTime() - log.startTime.getTime()) / 60000;
      }, 0);
      const capacityHours = Number(wc.capacityPerHour || 8);
      const availableMinutes = capacityHours * 60 * 22; // ~22 working days
      return {
        id: wc.id,
        name: wc.name,
        code: wc.code,
        totalMinutesUsed: Math.round(totalMinutes),
        availableMinutes,
        utilization: availableMinutes > 0 ? Math.round((totalMinutes / availableMinutes) * 100) : 0,
        logCount: wc.productionLogs.length,
      };
    });
  }

  async getProductionDashboard() {
    const [planned, inProgress, completed, totalScrap] = await Promise.all([
      this.prisma.productionOrder.count({ where: { status: 'PLANNED' } }),
      this.prisma.productionOrder.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.productionOrder.count({ where: { status: 'COMPLETED' } }),
      this.prisma.productionLog.aggregate({ _sum: { quantityScrapped: true } }),
    ]);

    return {
      planned,
      inProgress,
      completed,
      totalScrap: Number(totalScrap._sum.quantityScrapped || 0),
    };
  }
}
