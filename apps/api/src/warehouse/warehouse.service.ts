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
    for (const [key, value] of Object.entries({ reorderPoint: dto.reorderPoint, minStock: dto.minStock, maxStock: dto.maxStock })) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        throw new BadRequestException(`${key} debe ser un número mayor o igual a cero`);
      }
    }
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
    const normalizedType = dto.type === 'IN' ? 'RECEIPT'
      : dto.type === 'OUT' ? 'DISPATCH'
      : dto.type;

    if (normalizedType === 'TRANSFER' && (!dto.fromWarehouseId || !dto.toWarehouseId)) {
      throw new BadRequestException('Transferencias requieren almacén origen y destino');
    }
    if (!dto.fromWarehouseId && !dto.toWarehouseId) {
      throw new BadRequestException('El movimiento requiere almacén de origen y/o destino');
    }

    const quantity = Number(dto.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor a cero');
    }
    const unitCost = Number(dto.unitCost) > 0 ? Number(dto.unitCost) : 0;
    const totalCost = quantity * unitCost;

    // Todo el movimiento — validación de stock disponible, ajuste de niveles y
    // registro del folio — corre en una sola transacción para que nunca quede
    // un StockMovement sin su contraparte en StockLevel (o viceversa).
    const movement = await this.prisma.$transaction(async (tx) => {
      if (dto.fromWarehouseId) {
        await this.decrementStockLevel(tx, dto.productId, dto.fromWarehouseId, quantity);
      }
      if (dto.toWarehouseId) {
        await this.incrementStockLevel(tx, dto.productId, dto.toWarehouseId, quantity, unitCost);
      }

      const movementNumber = await this.generateMovementNumber();
      return tx.stockMovement.create({
        data: {
          movementNumber,
          type: normalizedType as any,
          productId: dto.productId,
          fromWarehouseId: dto.fromWarehouseId ?? null,
          toWarehouseId: dto.toWarehouseId ?? null,
          quantity: new Prisma.Decimal(quantity),
          unitCost: new Prisma.Decimal(unitCost),
          totalCost: new Prisma.Decimal(totalCost),
          lotId: dto.lotId ?? null,
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
          purchaseOrderId: dto.purchaseOrderId ?? null,
          createdById: userId,
        },
        include: { product: true, fromWarehouse: true, toWarehouse: true },
      });
    });

    const productLabel = movement.product?.name?.trim() || movement.product?.sku?.trim() || `Producto #${dto.productId}`;
    void this.notificationHierarchy
      .notifyStockMovementPosted(userId, movement.id, movement.movementNumber, productLabel, normalizedType)
      .catch(() => undefined);

    return movement;
  }

  /**
   * Descuenta stock de forma atómica: valida disponible (quantity - reservedQty)
   * y aplica el decremento en la misma condición WHERE para que dos movimientos
   * concurrentes no puedan ambos leer el mismo saldo y sobregirarlo.
   */
  private async decrementStockLevel(
    tx: Prisma.TransactionClient,
    productId: number,
    warehouseId: number,
    quantity: number,
  ) {
    const level = await tx.stockLevel.findFirst({
      where: { productId, warehouseId, locationId: null },
    });
    const available = level ? Number(level.quantity) - Number(level.reservedQty) : 0;
    if (available < quantity) {
      throw new BadRequestException(
        `Stock insuficiente en el almacén de origen: disponible ${available}, solicitado ${quantity}`,
      );
    }

    const result = await tx.stockLevel.updateMany({
      where: { id: level!.id, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (result.count === 0) {
      throw new BadRequestException(
        'Stock insuficiente en el almacén de origen (otro movimiento lo consumió al mismo tiempo)',
      );
    }
  }

  /**
   * Incrementa stock de forma atómica cuando ya existe el StockLevel (increment
   * a nivel de fila evita perder incrementos concurrentes). El alta inicial de
   * un StockLevel para un par producto/almacén nunca antes visto es un caso
   * extremadamente raro de correr en paralelo; si ocurre, el índice único falla
   * la transacción en vez de corromper datos.
   */
  private async incrementStockLevel(
    tx: Prisma.TransactionClient,
    productId: number,
    warehouseId: number,
    quantity: number,
    unitCost: number,
  ) {
    const existing = await tx.stockLevel.findFirst({
      where: { productId, warehouseId, locationId: null },
    });
    if (existing) {
      const prevQty = Number(existing.quantity);
      const prevCost = Number(existing.unitCost) || 0;
      const nextQty = prevQty + quantity;
      const weighted =
        unitCost > 0 && nextQty > 0
          ? (prevQty * prevCost + quantity * unitCost) / nextQty
          : prevCost;
      await tx.stockLevel.update({
        where: { id: existing.id },
        data: {
          quantity: { increment: quantity },
          ...(unitCost > 0 ? { unitCost: new Prisma.Decimal(weighted) } : {}),
        },
      });
    } else {
      await tx.stockLevel.create({
        data: {
          productId,
          warehouseId,
          quantity: new Prisma.Decimal(quantity),
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
