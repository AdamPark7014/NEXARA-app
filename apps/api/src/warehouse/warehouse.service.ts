import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  // ── Warehouses ────────────────────────────────────────────────────
  async createWarehouse(dto: { code: string; name: string; address?: string; city?: string; state?: string; managerId?: number }) {
    return this.prisma.warehouse.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || null,
        managerId: dto.managerId ?? null,
      },
      include: { manager: { select: { id: true, nombre: true } } },
    });
  }

  async listWarehouses() {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
      include: { manager: { select: { id: true, nombre: true } }, _count: { select: { locations: true, stockLevels: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async getWarehouse(id: number) {
    const wh = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { manager: { select: { id: true, nombre: true } }, locations: true },
    });
    if (!wh) throw new NotFoundException('Almacén no encontrado');
    return wh;
  }

  async updateWarehouse(id: number, dto: Partial<{ code: string; name: string; address: string; city: string; state: string; managerId: number; isActive: boolean }>) {
    return this.prisma.warehouse.update({ where: { id }, data: dto as any });
  }

  // ── Locations ─────────────────────────────────────────────────────
  async createLocation(warehouseId: number, dto: { code: string; name: string; aisle?: string; rack?: string; shelf?: string; bin?: string }) {
    return this.prisma.warehouseLocation.create({
      data: {
        warehouseId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        aisle: dto.aisle?.trim() || null,
        rack: dto.rack?.trim() || null,
        shelf: dto.shelf?.trim() || null,
        bin: dto.bin?.trim() || null,
      },
    });
  }

  async listLocations(warehouseId: number) {
    return this.prisma.warehouseLocation.findMany({
      where: { warehouseId },
      orderBy: { code: 'asc' },
    });
  }

  // ── Stock Levels ──────────────────────────────────────────────────
  async getStockLevels(filters?: { warehouseId?: number; productId?: number; belowReorder?: boolean }) {
    const where: any = {};
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.productId) where.productId = filters.productId;
    if (filters?.belowReorder) {
      // Filter in JS since Prisma can't compare two columns directly
    }

    const levels = await this.prisma.stockLevel.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true } }, warehouse: { select: { id: true, code: true, name: true } }, location: true },
      orderBy: { product: { name: 'asc' } },
    });

    if (filters?.belowReorder) {
      return levels.filter((l) => Number(l.quantity) <= Number(l.reorderPoint));
    }
    return levels;
  }

  async getStockLevel(id: number) {
    const sl = await this.prisma.stockLevel.findUnique({
      where: { id },
      include: { product: true, warehouse: true, location: true, lotStocks: { include: { lot: true } } },
    });
    if (!sl) throw new NotFoundException('Stock no encontrado');
    return sl;
  }

  async updateStockConfig(id: number, dto: { reorderPoint?: number; minStock?: number; maxStock?: number; valuationMethod?: string }) {
    return this.prisma.stockLevel.update({
      where: { id },
      data: {
        reorderPoint: dto.reorderPoint !== undefined ? new Prisma.Decimal(dto.reorderPoint) : undefined,
        minStock: dto.minStock !== undefined ? new Prisma.Decimal(dto.minStock) : undefined,
        maxStock: dto.maxStock !== undefined ? new Prisma.Decimal(dto.maxStock) : undefined,
        valuationMethod: dto.valuationMethod as any,
      },
    });
  }

  // ── Stock Movements ───────────────────────────────────────────────
  private async generateMovementNumber(): Promise<string> {
    const count = await this.prisma.stockMovement.count();
    return `SM-${String(count + 1).padStart(6, '0')}`;
  }

  async createStockMovement(dto: {
    type: string;
    productId: number;
    fromWarehouseId?: number;
    toWarehouseId?: number;
    quantity: number;
    unitCost?: number;
    lotId?: number;
    reference?: string;
    notes?: string;
    purchaseOrderId?: number;
  }, userId: number) {
    if (dto.type === 'TRANSFER' && (!dto.fromWarehouseId || !dto.toWarehouseId)) {
      throw new BadRequestException('Transferencias requieren almacén origen y destino');
    }

    const movementNumber = await this.generateMovementNumber();
    const totalCost = (dto.quantity || 0) * (dto.unitCost || 0);

    const movement = await this.prisma.stockMovement.create({
      data: {
        movementNumber,
        type: dto.type as any,
        productId: dto.productId,
        fromWarehouseId: dto.fromWarehouseId ?? null,
        toWarehouseId: dto.toWarehouseId ?? null,
        quantity: new Prisma.Decimal(dto.quantity),
        unitCost: new Prisma.Decimal(dto.unitCost || 0),
        totalCost: new Prisma.Decimal(totalCost),
        lotId: dto.lotId ?? null,
        reference: dto.reference?.trim() || null,
        notes: dto.notes?.trim() || null,
        purchaseOrderId: dto.purchaseOrderId ?? null,
        createdById: userId,
      },
      include: { product: true, fromWarehouse: true, toWarehouse: true },
    });

    // Update stock levels
    if (dto.fromWarehouseId) {
      await this.upsertStockLevel(dto.productId, dto.fromWarehouseId, -dto.quantity, dto.unitCost || 0);
    }
    if (dto.toWarehouseId) {
      await this.upsertStockLevel(dto.productId, dto.toWarehouseId, dto.quantity, dto.unitCost || 0);
    }

    const productLabel = movement.product?.name?.trim() || movement.product?.sku?.trim() || `Producto #${dto.productId}`;
    void this.notificationHierarchy
      .notifyStockMovementPosted(userId, movement.id, movement.movementNumber, productLabel, dto.type)
      .catch(() => undefined);

    return movement;
  }

  private async upsertStockLevel(productId: number, warehouseId: number, quantityDelta: number, unitCost: number) {
    const existing = await this.prisma.stockLevel.findFirst({
      where: { productId, warehouseId, locationId: null },
    });

    if (existing) {
      const newQty = Number(existing.quantity) + quantityDelta;
      await this.prisma.stockLevel.update({
        where: { id: existing.id },
        data: {
          quantity: new Prisma.Decimal(Math.max(0, newQty)),
          unitCost: unitCost > 0 ? new Prisma.Decimal(unitCost) : undefined,
        },
      });
    } else {
      await this.prisma.stockLevel.create({
        data: {
          productId,
          warehouseId,
          quantity: new Prisma.Decimal(Math.max(0, quantityDelta)),
          unitCost: new Prisma.Decimal(unitCost),
        },
      });
    }
  }

  async listStockMovements(filters?: { productId?: number; warehouseId?: number; type?: string; from?: string; to?: string }) {
    const where: any = {};
    if (filters?.productId) where.productId = filters.productId;
    if (filters?.type) where.type = filters.type;
    if (filters?.warehouseId) {
      where.OR = [{ fromWarehouseId: filters.warehouseId }, { toWarehouseId: filters.warehouseId }];
    }
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    return this.prisma.stockMovement.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true } }, fromWarehouse: true, toWarehouse: true, lot: true, createdBy: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Lots ──────────────────────────────────────────────────────────
  async createLot(dto: { lotNumber: string; productId: number; expirationDate?: string; manufacturingDate?: string; supplierId?: number; notes?: string }) {
    return this.prisma.lot.create({
      data: {
        lotNumber: dto.lotNumber.trim(),
        productId: dto.productId,
        expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null,
        manufacturingDate: dto.manufacturingDate ? new Date(dto.manufacturingDate) : null,
        supplierId: dto.supplierId ?? null,
        notes: dto.notes?.trim() || null,
      },
      include: { product: true },
    });
  }

  async listLots(productId?: number) {
    const where: any = {};
    if (productId) where.productId = productId;
    return this.prisma.lot.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Stock Valuation Report ────────────────────────────────────────
  async getStockValuation(warehouseId?: number) {
    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;
    const levels = await this.prisma.stockLevel.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true } }, warehouse: { select: { id: true, code: true, name: true } } },
    });

    return levels.map((l) => ({
      ...l,
      totalValue: Number(l.quantity) * Number(l.unitCost),
      availableQty: Number(l.quantity) - Number(l.reservedQty),
    }));
  }

  // ── Low Stock Alerts ──────────────────────────────────────────────
  async getLowStockAlerts() {
    const levels = await this.prisma.stockLevel.findMany({
      include: { product: { select: { id: true, name: true, sku: true } }, warehouse: { select: { id: true, code: true, name: true } } },
    });
    return levels.filter((l) => Number(l.quantity) <= Number(l.reorderPoint) && Number(l.reorderPoint) > 0);
  }
}
