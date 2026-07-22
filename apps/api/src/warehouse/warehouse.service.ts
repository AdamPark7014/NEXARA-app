import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { AccountingService } from '../accounting/accounting.service.js';
import { assertCompanyAccess, companyWhere } from '../common/tenant/tenant-scope.js';

const COGS_MOVEMENT_TYPES = new Set(['DISPATCH', 'SCRAP', 'PRODUCTION_OUT']);

@Injectable()
export class WarehouseService {
  private readonly logger = new Logger(WarehouseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly accounting: AccountingService,
  ) {}

  // ── Warehouses ────────────────────────────────────────────────────
  async createWarehouse(dto: {
    code: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    managerId?: number;
    companyId?: number | null;
  }) {
    const companyId =
      dto.companyId ??
      (
        await this.prisma.companyProfile.findFirst({
          where: { isPrimary: true, isActive: true },
          select: { id: true },
        })
      )?.id;
    if (companyId == null) throw new BadRequestException('Empresa requerida para crear almacén');
    return this.prisma.warehouse.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || null,
        managerId: dto.managerId ?? null,
        companyId,
      },
      include: { manager: { select: { id: true, nombre: true } } },
    });
  }

  async listWarehouses(companyId?: number | null) {
    return this.prisma.warehouse.findMany({
      where: { isActive: true, ...companyWhere(companyId ?? null) },
      include: { manager: { select: { id: true, nombre: true } }, _count: { select: { locations: true, stockLevels: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async getWarehouse(id: number, companyId?: number | null) {
    const wh = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { manager: { select: { id: true, nombre: true } }, locations: true },
    });
    assertCompanyAccess(wh, companyId, 'Almacén');
    return wh!;
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
  async getStockLevels(filters?: {
    warehouseId?: number;
    productId?: number;
    belowReorder?: boolean;
    companyId?: number | null;
  }) {
    const where: any = {};
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.productId) where.productId = filters.productId;
    if (filters?.companyId != null && Number.isFinite(Number(filters.companyId))) {
      where.warehouse = { companyId: Number(filters.companyId) };
    }
    if (filters?.belowReorder) {
      // Filter in JS since Prisma can't compare two columns directly
    }

    const levels = await this.prisma.stockLevel.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true } }, warehouse: { select: { id: true, code: true, name: true, companyId: true } }, location: true },
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

    // Todo el movimiento — validación de stock disponible, ajuste de niveles y
    // registro del folio — corre en una sola transacción para que nunca quede
    // un StockMovement sin su contraparte en StockLevel (o viceversa).
    const movement = await this.prisma.$transaction(async (tx) => {
      let unitCost = Number(dto.unitCost) > 0 ? Number(dto.unitCost) : 0;
      // WAC desde StockLevel origen si el despacho no trae costo explícito
      if (unitCost <= 0 && dto.fromWarehouseId && COGS_MOVEMENT_TYPES.has(normalizedType)) {
        const level = await tx.stockLevel.findFirst({
          where: { productId: dto.productId, warehouseId: dto.fromWarehouseId, locationId: null },
          select: { unitCost: true },
        });
        unitCost = level && Number(level.unitCost) > 0 ? Number(level.unitCost) : 0;
      }
      const totalCost = quantity * unitCost;

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

    if (COGS_MOVEMENT_TYPES.has(normalizedType) && Number(movement.totalCost) > 0) {
      try {
        await this.accounting.postInventoryIssueCogs({
          stockMovementId: movement.id,
          amount: Number(movement.totalCost),
          date: movement.createdAt,
          description: `COGS ${normalizedType} ${movement.movementNumber} — ${productLabel}`,
          userId,
        });
      } catch (err) {
        this.logger.warn(
          `No se pudo postear COGS para ${movement.movementNumber}: ${(err as Error).message}`,
        );
      }
    }

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

  /**
   * Inteligencia de inventario: rotación, aging, dead stock, ABC,
   * cobertura proyectada y tendencias de movimiento.
   */
  async getInventoryInsights() {
    const now = new Date();
    const d14 = new Date(now.getTime() - 14 * 86_400_000);
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    const d90 = new Date(now.getTime() - 90 * 86_400_000);

    const [levels, movements90, lots] = await Promise.all([
      this.prisma.stockLevel.findMany({
        include: {
          product: { select: { id: true, name: true, sku: true, category: true } },
          warehouse: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.stockMovement.findMany({
        where: { createdAt: { gte: d90 } },
        select: {
          id: true,
          type: true,
          productId: true,
          quantity: true,
          totalCost: true,
          unitCost: true,
          createdAt: true,
        },
      }),
      this.prisma.lot.findMany({
        where: { expirationDate: { not: null } },
        select: { id: true, lotNumber: true, productId: true, expirationDate: true, product: { select: { name: true, sku: true } } },
      }),
    ]);

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const inflowByDay: Record<string, number> = {};
    const outflowByDay: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const k = dayKey(new Date(now.getTime() - i * 86_400_000));
      inflowByDay[k] = 0;
      outflowByDay[k] = 0;
    }

    const dispatchQty30 = new Map<number, number>();
    const receiptQty30 = new Map<number, number>();
    const lastMovementAt = new Map<number, Date>();
    let cogs30 = 0;
    let receiptsValue30 = 0;

    for (const m of movements90) {
      const qty = Number(m.quantity);
      const cost = Number(m.totalCost);
      const prev = lastMovementAt.get(m.productId);
      if (!prev || m.createdAt > prev) lastMovementAt.set(m.productId, m.createdAt);

      const k = dayKey(m.createdAt);
      const isIn = m.type === 'RECEIPT' || m.type === 'RETURN' || m.type === 'PRODUCTION_IN';
      const isOut = m.type === 'DISPATCH' || m.type === 'SCRAP' || m.type === 'PRODUCTION_OUT';

      if (m.createdAt >= d14) {
        if (isIn && k in inflowByDay) inflowByDay[k] += qty;
        if (isOut && k in outflowByDay) outflowByDay[k] += qty;
      }

      if (m.createdAt >= d30) {
        if (isOut) {
          dispatchQty30.set(m.productId, (dispatchQty30.get(m.productId) ?? 0) + qty);
          cogs30 += cost;
        }
        if (isIn) {
          receiptQty30.set(m.productId, (receiptQty30.get(m.productId) ?? 0) + qty);
          receiptsValue30 += cost;
        }
      }
    }

    type LevelInsight = {
      stockLevelId: number;
      productId: number;
      sku: string;
      name: string;
      category: string | null;
      warehouse: string;
      quantity: number;
      reserved: number;
      available: number;
      unitCost: number;
      value: number;
      reorderPoint: number;
      maxStock: number;
      status: 'ok' | 'low' | 'zero' | 'overstock';
      lastMovementAt: string | null;
      idleDays: number | null;
      avgDailyDispatch: number;
      daysOfCover: number | null;
      abc: 'A' | 'B' | 'C';
    };

    const enriched: LevelInsight[] = levels.map((l) => {
      const quantity = Number(l.quantity);
      const reserved = Number(l.reservedQty);
      const available = quantity - reserved;
      const unitCost = Number(l.unitCost);
      const value = quantity * unitCost;
      const reorderPoint = Number(l.reorderPoint);
      const maxStock = Number(l.maxStock);
      const last = lastMovementAt.get(l.productId) ?? null;
      const idleDays = last ? Math.floor((now.getTime() - last.getTime()) / 86_400_000) : null;
      const dispatched30 = dispatchQty30.get(l.productId) ?? 0;
      const avgDailyDispatch = dispatched30 / 30;
      const daysOfCover =
        avgDailyDispatch > 0 ? Math.round((available / avgDailyDispatch) * 10) / 10 : null;

      let status: LevelInsight['status'] = 'ok';
      if (quantity <= 0) status = 'zero';
      else if (reorderPoint > 0 && quantity <= reorderPoint) status = 'low';
      else if (maxStock > 0 && quantity > maxStock) status = 'overstock';

      return {
        stockLevelId: l.id,
        productId: l.productId,
        sku: l.product?.sku ?? '—',
        name: l.product?.name ?? '—',
        category: l.product?.category ?? null,
        warehouse: l.warehouse?.name ?? l.warehouse?.code ?? '—',
        quantity,
        reserved,
        available,
        unitCost,
        value,
        reorderPoint,
        maxStock,
        status,
        lastMovementAt: last?.toISOString() ?? null,
        idleDays,
        avgDailyDispatch: Math.round(avgDailyDispatch * 100) / 100,
        daysOfCover,
        abc: 'C',
      };
    });

    // ABC por valor acumulado (Pareto)
    const byValue = [...enriched].sort((a, b) => b.value - a.value);
    const totalValue = byValue.reduce((s, r) => s + r.value, 0);
    let running = 0;
    for (const row of byValue) {
      running += row.value;
      const pct = totalValue > 0 ? running / totalValue : 1;
      row.abc = pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C';
      const target = enriched.find((e) => e.stockLevelId === row.stockLevelId);
      if (target) target.abc = row.abc;
    }

    const zero = enriched.filter((e) => e.status === 'zero');
    const low = enriched.filter((e) => e.status === 'low');
    const overstock = enriched.filter((e) => e.status === 'overstock');
    const dead = enriched.filter(
      (e) => e.quantity > 0 && (e.idleDays === null || e.idleDays >= 90),
    );
    const aging = {
      d0_30: enriched.filter((e) => e.idleDays !== null && e.idleDays < 30).length,
      d30_60: enriched.filter((e) => e.idleDays !== null && e.idleDays >= 30 && e.idleDays < 60).length,
      d60_90: enriched.filter((e) => e.idleDays !== null && e.idleDays >= 60 && e.idleDays < 90).length,
      d90_plus: enriched.filter((e) => e.idleDays === null || e.idleDays >= 90).length,
    };

    const topMovers = [...dispatchQty30.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([productId, qty]) => {
        const level = enriched.find((e) => e.productId === productId);
        return {
          productId,
          sku: level?.sku ?? '—',
          name: level?.name ?? `Producto #${productId}`,
          dispatched30d: qty,
          valueOnHand: level?.value ?? 0,
          daysOfCover: level?.daysOfCover ?? null,
        };
      });

    const slowMovers = enriched
      .filter((e) => e.quantity > 0)
      .sort((a, b) => (b.idleDays ?? 9999) - (a.idleDays ?? 9999))
      .slice(0, 10)
      .map((e) => ({
        productId: e.productId,
        sku: e.sku,
        name: e.name,
        quantity: e.quantity,
        value: e.value,
        idleDays: e.idleDays,
      }));

    const reorderSuggestions = enriched
      .filter((e) => e.status === 'low' || e.status === 'zero')
      .map((e) => {
        const target = e.maxStock > 0 ? e.maxStock : Math.max(e.reorderPoint * 2, e.reorderPoint + 1);
        const suggestedQty = Math.max(0, target - e.quantity);
        return {
          productId: e.productId,
          sku: e.sku,
          name: e.name,
          warehouse: e.warehouse,
          onHand: e.quantity,
          reorderPoint: e.reorderPoint,
          suggestedQty,
          estimatedCost: Math.round(suggestedQty * e.unitCost * 100) / 100,
        };
      })
      .filter((r) => r.suggestedQty > 0)
      .sort((a, b) => b.estimatedCost - a.estimatedCost)
      .slice(0, 15);

    const expiringLots = lots
      .filter((l) => l.expirationDate && l.expirationDate >= now && l.expirationDate <= new Date(now.getTime() + 60 * 86_400_000))
      .sort((a, b) => (a.expirationDate!.getTime() - b.expirationDate!.getTime()))
      .slice(0, 10)
      .map((l) => ({
        id: l.id,
        lotNumber: l.lotNumber,
        product: l.product?.name ?? '—',
        sku: l.product?.sku ?? '—',
        expirationDate: l.expirationDate!.toISOString(),
        daysLeft: Math.ceil((l.expirationDate!.getTime() - now.getTime()) / 86_400_000),
      }));

    const avgInventoryValue = totalValue;
    const turnoverProxy = avgInventoryValue > 0 ? Math.round((cogs30 * 12 / avgInventoryValue) * 100) / 100 : 0;

    const byWarehouse: Record<string, { skus: number; value: number; low: number }> = {};
    for (const e of enriched) {
      const wh = e.warehouse;
      if (!byWarehouse[wh]) byWarehouse[wh] = { skus: 0, value: 0, low: 0 };
      byWarehouse[wh].skus += 1;
      byWarehouse[wh].value += e.value;
      if (e.status === 'low' || e.status === 'zero') byWarehouse[wh].low += 1;
    }

    return {
      generatedAt: now.toISOString(),
      kpis: {
        skuLocations: enriched.length,
        totalValue: Math.round(totalValue * 100) / 100,
        zeroStock: zero.length,
        lowStock: low.length,
        overstock: overstock.length,
        deadStock: dead.length,
        deadStockValue: Math.round(dead.reduce((s, e) => s + e.value, 0) * 100) / 100,
        cogs30d: Math.round(cogs30 * 100) / 100,
        receiptsValue30d: Math.round(receiptsValue30 * 100) / 100,
        turnoverAnnualProxy: turnoverProxy,
        fillHealthyPct: enriched.length
          ? Math.round(((enriched.length - zero.length - low.length) / enriched.length) * 1000) / 10
          : 100,
        abcA: enriched.filter((e) => e.abc === 'A').length,
        abcB: enriched.filter((e) => e.abc === 'B').length,
        abcC: enriched.filter((e) => e.abc === 'C').length,
      },
      aging,
      trends: {
        inflow14d: Object.entries(inflowByDay).map(([date, qty]) => ({ date, qty })),
        outflow14d: Object.entries(outflowByDay).map(([date, qty]) => ({ date, qty })),
      },
      byWarehouse: Object.entries(byWarehouse)
        .map(([name, v]) => ({ name, ...v, value: Math.round(v.value * 100) / 100 }))
        .sort((a, b) => b.value - a.value),
      topMovers,
      slowMovers,
      reorderSuggestions,
      expiringLots,
      alerts: [
        ...(low.length ? [{ severity: 'warning' as const, message: `${low.length} SKU(s) bajo punto de reorden` }] : []),
        ...(zero.length ? [{ severity: 'danger' as const, message: `${zero.length} SKU(s) sin existencia` }] : []),
        ...(dead.length ? [{ severity: 'warning' as const, message: `${dead.length} SKU(s) sin movimiento 90d (dead stock)` }] : []),
        ...(expiringLots.length ? [{ severity: 'warning' as const, message: `${expiringLots.length} lote(s) caducan en ≤60 días` }] : []),
      ],
    };
  }
}
