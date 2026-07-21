import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { AutoApprovalService } from '../workflow/auto-approval.service.js';
import { WarehouseService } from '../warehouse/warehouse.service.js';
import { AccountingService } from '../accounting/accounting.service.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly autoApproval: AutoApprovalService,
    private readonly warehouse: WarehouseService,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
  ) {}

  // ── Purchase Requisitions ─────────────────────────────────────────
  private async generateReqNumber(): Promise<string> {
    const count = await this.prisma.purchaseRequisition.count();
    return `REQ-${String(count + 1).padStart(6, '0')}`;
  }

  async createRequisition(dto: {
    title: string;
    description?: string;
    priority?: string;
    requiredDate?: string;
    departmentId?: number;
    items: Array<{ productId?: number; description: string; quantity: number; estimatedCost?: number; notes?: string }>;
  }, userId: number) {
    const reqNumber = await this.generateReqNumber();
    const created = await this.prisma.purchaseRequisition.create({
      data: {
        reqNumber,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority || 'NORMAL',
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : null,
        departmentId: dto.departmentId ?? null,
        requestedById: userId,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId ?? null,
            description: i.description.trim(),
            quantity: new Prisma.Decimal(i.quantity),
            estimatedCost: i.estimatedCost ? new Prisma.Decimal(i.estimatedCost) : null,
            notes: i.notes?.trim() || null,
          })),
        },
      },
      include: { items: true, requestedBy: { select: { id: true, nombre: true } } },
    });
    void this.notificationHierarchy
      .notifyPurchaseRequisitionCreated(userId, created.id, created.reqNumber, created.title)
      .catch(() => undefined);
    return created;
  }

  async listRequisitions(filters?: { status?: string; departmentId?: number }, query?: PaginationQueryDto) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.departmentId) where.departmentId = filters.departmentId;
    const include = { items: true, requestedBy: { select: { id: true, nombre: true } }, approvedBy: { select: { id: true, nombre: true } } };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.purchaseRequisition.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.purchaseRequisition.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.purchaseRequisition.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  }

  async getRequisition(id: number) {
    const req = await this.prisma.purchaseRequisition.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, requestedBy: { select: { id: true, nombre: true } }, approvedBy: { select: { id: true, nombre: true } }, department: true },
    });
    if (!req) throw new NotFoundException('Requisición no encontrada');
    return req;
  }

  async approveRequisition(id: number, userId: number) {
    const before = await this.getRequisition(id);
    const updated = await this.prisma.purchaseRequisition.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
    });
    void this.notificationHierarchy
      .notifyPurchaseRequisitionApproved(userId, before.requestedById, id, before.reqNumber, before.title)
      .catch(() => undefined);
    return updated;
  }

  async rejectRequisition(id: number, userId: number, reason: string) {
    const before = await this.getRequisition(id);
    const updated = await this.prisma.purchaseRequisition.update({
      where: { id },
      data: { status: 'REJECTED', approvedById: userId, approvedAt: new Date(), rejectionReason: reason.trim() },
    });
    void this.notificationHierarchy
      .notifyPurchaseRequisitionRejected(userId, before.requestedById, id, before.reqNumber, before.title, reason.trim())
      .catch(() => undefined);
    return updated;
  }

  // ── Purchase Orders ───────────────────────────────────────────────
  private async generatePONumber(): Promise<string> {
    const count = await this.prisma.purchaseOrder.count();
    return `PO-${String(count + 1).padStart(6, '0')}`;
  }

  async listSuppliers() {
    return this.prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true, apiUrl: true },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(dto: { name: string; description?: string; apiUrl?: string }) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Nombre de proveedor requerido');
    return this.prisma.supplier.upsert({
      where: { name },
      update: {
        description: dto.description?.trim() || undefined,
        apiUrl: dto.apiUrl?.trim() || undefined,
        isActive: true,
      },
      create: {
        name,
        description: dto.description?.trim() || null,
        apiUrl: dto.apiUrl?.trim() || null,
      },
      select: { id: true, name: true, description: true, apiUrl: true },
    });
  }

  async createPurchaseOrder(dto: {
    supplierId?: number;
    supplierName?: string;
    requisitionId?: number;
    orderDate: string;
    expectedDate?: string;
    currency?: string;
    paymentTerms?: string;
    shippingAddress?: string;
    notes?: string;
    items: Array<{ productId?: number; description: string; quantity: number; unitPrice: number; taxRate?: number }>;
  }, userId: number) {
    if (!dto.supplierId && !dto.supplierName) {
      throw new BadRequestException('Se requiere supplierId o supplierName');
    }
    let supplierId = dto.supplierId;
    if (!supplierId && dto.supplierName) {
      const supplier = await this.prisma.supplier.upsert({
        where: { name: dto.supplierName.trim() },
        update: {},
        create: { name: dto.supplierName.trim() },
      });
      supplierId = supplier.id;
    }
    const poNumber = await this.generatePONumber();
    const items = dto.items.map((i) => ({
      ...i,
      total: i.quantity * i.unitPrice * (1 + (i.taxRate || 0) / 100),
    }));
    const subtotal = dto.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const taxAmount = dto.items.reduce((s, i) => s + i.quantity * i.unitPrice * ((i.taxRate || 0) / 100), 0);
    const companyId =
      (
        await this.prisma.companyProfile.findFirst({
          where: { isPrimary: true, isActive: true },
          select: { id: true },
        })
      )?.id ?? null;

    const created = await this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: supplierId!,
        requisitionId: dto.requisitionId ?? null,
        orderDate: new Date(dto.orderDate),
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        subtotal: new Prisma.Decimal(subtotal),
        taxAmount: new Prisma.Decimal(taxAmount),
        totalAmount: new Prisma.Decimal(subtotal + taxAmount),
        currency: dto.currency || 'MXN',
        paymentTerms: dto.paymentTerms?.trim() || null,
        shippingAddress: dto.shippingAddress?.trim() || null,
        notes: dto.notes?.trim() || null,
        createdById: userId,
        companyId,
        items: {
          create: items.map((i) => ({
            productId: i.productId ?? null,
            description: i.description.trim(),
            quantity: new Prisma.Decimal(i.quantity),
            unitPrice: new Prisma.Decimal(i.unitPrice),
            taxRate: new Prisma.Decimal(i.taxRate || 0),
            total: new Prisma.Decimal(i.total),
          })),
        },
      },
      include: { items: true, supplier: true },
    });
    const supplierName = created.supplier?.name?.trim() || 'Proveedor';
    void this.notificationHierarchy
      .notifyPurchaseOrderCreated(userId, created.id, created.poNumber, supplierName)
      .catch(() => undefined);

    // Workflow: toda OC > $0 requiere validación de Compras + autorización
    // de Dirección Administrativa. El servicio es idempotente.
    this.autoApproval
      .evaluate({
        entityType: 'PURCHASE_ORDER',
        entityId: created.id,
        userId,
        payload: {
          amount: subtotal + taxAmount,
          totalAmount: subtotal + taxAmount,
          supplierId,
          supplierName,
          poNumber: created.poNumber,
        },
      })
      .catch(() => undefined);
    return created;
  }

  async listPurchaseOrders(filters?: { status?: string; supplierId?: number }, query?: PaginationQueryDto) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.supplierId) where.supplierId = filters.supplierId;
    const include = { items: true, supplier: true, createdBy: { select: { id: true, nombre: true } } };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.purchaseOrder.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.purchaseOrder.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.purchaseOrder.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  }

  async getPurchaseOrder(id: number) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, supplier: true, receipts: { include: { items: true } }, createdBy: { select: { id: true, nombre: true } }, approvedBy: { select: { id: true, nombre: true } } },
    });
    if (!po) throw new NotFoundException('Orden de compra no encontrada');
    return po;
  }

  async approvePurchaseOrder(id: number, userId: number) {
    const po = await this.getPurchaseOrder(id);
    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CONFIRMED', approvedById: userId, approvedAt: new Date() },
    });
    void this.notificationHierarchy
      .notifyPurchaseOrderApproved(userId, po.createdById ?? null, id, po.poNumber)
      .catch(() => undefined);
    return updated;
  }

  // ── Goods Receipts ────────────────────────────────────────────────
  private async generateReceiptNumber(): Promise<string> {
    const count = await this.prisma.goodsReceipt.count();
    return `GR-${String(count + 1).padStart(6, '0')}`;
  }

  async createGoodsReceipt(dto: {
    purchaseOrderId: number;
    warehouseId?: number;
    receiptDate: string;
    notes?: string;
    createApInvoice?: boolean;
    items: Array<{ purchaseOrderItemId: number; quantityReceived: number; quantityRejected?: number; lotNumber?: string; notes?: string }>;
  }, userId: number) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.purchaseOrderId },
      include: {
        items: { include: { product: { select: { id: true, itemType: true } } } },
      },
    });
    if (!po || po.deletedAt) throw new NotFoundException('Orden de compra no encontrada');
    if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      throw new BadRequestException('Solo se pueden recibir OC confirmadas o parcialmente recibidas');
    }
    if (!dto.items?.length) {
      throw new BadRequestException('La recepción requiere al menos una partida');
    }

    let warehouseId = dto.warehouseId ? Number(dto.warehouseId) : null;
    if (warehouseId) {
      const wh = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, isActive: true } });
      if (!wh) throw new BadRequestException('Almacén inválido');
    } else {
      const fallback = await this.prisma.warehouse.findFirst({
        where: { isActive: true },
        orderBy: { id: 'asc' },
      });
      warehouseId = fallback?.id ?? null;
    }

    const receiptNumber = await this.generateReceiptNumber();
    const receipt = await this.prisma.goodsReceipt.create({
      data: {
        receiptNumber,
        purchaseOrderId: dto.purchaseOrderId,
        warehouseId,
        receiptDate: new Date(dto.receiptDate),
        notes: dto.notes?.trim() || null,
        receivedById: userId,
        items: {
          create: dto.items.map((i) => ({
            purchaseOrderItemId: i.purchaseOrderItemId,
            quantityReceived: new Prisma.Decimal(i.quantityReceived),
            quantityRejected: new Prisma.Decimal(i.quantityRejected || 0),
            lotNumber: i.lotNumber?.trim() || null,
            notes: i.notes?.trim() || null,
          })),
        },
      },
      include: { items: true },
    });

    // Update PO item received quantities
    for (const item of dto.items) {
      await this.prisma.purchaseOrderItem.update({
        where: { id: item.purchaseOrderItemId },
        data: { receivedQty: { increment: new Prisma.Decimal(item.quantityReceived) } },
      });
    }

    // Stock movements for PRODUCT lines with productId
    if (warehouseId) {
      for (const item of dto.items) {
        const qty = Number(item.quantityReceived) || 0;
        if (qty <= 0) continue;
        const poItem = po.items.find((i) => i.id === item.purchaseOrderItemId);
        if (!poItem?.productId) continue;
        const itemType = poItem.product?.itemType || 'PRODUCT';
        if (itemType !== 'PRODUCT') continue;

        await this.warehouse.createStockMovement(
          {
            type: 'RECEIPT',
            productId: poItem.productId,
            toWarehouseId: warehouseId,
            quantity: qty,
            unitCost: Number(poItem.unitPrice) || 0,
            purchaseOrderId: dto.purchaseOrderId,
            reference: receipt.receiptNumber,
            notes: `GR ${receipt.receiptNumber}`,
          },
          userId,
        );
      }
    }

    // Check if all items fully received → update PO status
    const poAfter = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.purchaseOrderId },
      include: { items: true },
    });
    if (poAfter) {
      const allReceived = poAfter.items.every((i) => Number(i.receivedQty) >= Number(i.quantity));
      const someReceived = poAfter.items.some((i) => Number(i.receivedQty) > 0);
      await this.prisma.purchaseOrder.update({
        where: { id: dto.purchaseOrderId },
        data: { status: allReceived ? 'RECEIVED' : someReceived ? 'PARTIALLY_RECEIVED' : undefined },
      });
    }

    let journalEntry = null as Awaited<ReturnType<AccountingService['postPurchaseReceiptAccrual']>> | null;
    let apInvoice = null as Awaited<ReturnType<AccountingService['createInvoiceFromGoodsReceipt']>> | null;
    try {
      journalEntry = await this.accounting.postPurchaseReceiptAccrual({
        goodsReceiptId: receipt.id,
        userId,
      });
    } catch (err) {
      // No bloquear recepción operativa si falla contabilidad; queda auditable
      await this.audit
        .log(
          {
            entityType: 'GoodsReceipt',
            entityId: receipt.id,
            action: 'JOURNAL_FAILED',
            changes: { error: err instanceof Error ? err.message : String(err) },
          },
          userId,
        )
        .catch(() => undefined);
    }

    if (dto.createApInvoice !== false) {
      try {
        apInvoice = await this.accounting.createInvoiceFromGoodsReceipt(receipt.id, userId);
      } catch (err) {
        await this.audit
          .log(
            {
              entityType: 'GoodsReceipt',
              entityId: receipt.id,
              action: 'AP_INVOICE_FAILED',
              changes: { error: err instanceof Error ? err.message : String(err) },
            },
            userId,
          )
          .catch(() => undefined);
      }
    }

    void this.notificationHierarchy
      .notifyGoodsReceiptPosted(
        userId,
        receipt.id,
        receipt.receiptNumber,
        po.poNumber,
        dto.purchaseOrderId,
        po.createdById ?? null,
      )
      .catch(() => undefined);

    await this.audit
      .log(
        {
          entityType: 'GoodsReceipt',
          entityId: receipt.id,
          action: 'CREATE',
          changes: {
            warehouseId,
            journalEntryId: journalEntry?.id ?? null,
            invoiceId: apInvoice?.id ?? null,
          },
        },
        userId,
      )
      .catch(() => undefined);

    return {
      ...receipt,
      warehouseId,
      journalEntryId: journalEntry?.id ?? null,
      journalEntry,
      apInvoice,
    };
  }

  async listGoodsReceipts(purchaseOrderId?: number) {
    const where: any = {};
    if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId;
    return this.prisma.goodsReceipt.findMany({
      where,
      include: { items: true, purchaseOrder: { select: { id: true, poNumber: true } }, receivedBy: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Supplier Evaluations ──────────────────────────────────────────
  async createSupplierEvaluation(dto: {
    supplierId: number;
    evaluationDate: string;
    qualityScore: number;
    deliveryScore: number;
    priceScore: number;
    serviceScore: number;
    notes?: string;
  }, userId: number) {
    const overallScore = (dto.qualityScore + dto.deliveryScore + dto.priceScore + dto.serviceScore) / 4;
    return this.prisma.supplierEvaluation.create({
      data: {
        supplierId: dto.supplierId,
        evaluationDate: new Date(dto.evaluationDate),
        qualityScore: dto.qualityScore,
        deliveryScore: dto.deliveryScore,
        priceScore: dto.priceScore,
        serviceScore: dto.serviceScore,
        overallScore: new Prisma.Decimal(overallScore),
        notes: dto.notes?.trim() || null,
        evaluatedById: userId,
      },
      include: { supplier: true },
    });
  }

  async listSupplierEvaluations(supplierId?: number) {
    const where: any = {};
    if (supplierId) where.supplierId = supplierId;
    return this.prisma.supplierEvaluation.findMany({
      where,
      include: { supplier: true, evaluatedBy: { select: { id: true, nombre: true } } },
      orderBy: { evaluationDate: 'desc' },
    });
  }

  // ── Procurement Dashboard ─────────────────────────────────────────
  async getProcurementDashboard() {
    const [
      pendingReqs,
      activePOs,
      overdueDeliveries,
      totalSpend,
      topSuppliers,
    ] = await Promise.all([
      this.prisma.purchaseRequisition.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] } } }),
      this.prisma.purchaseOrder.count({
        where: { status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] }, expectedDate: { lt: new Date() } },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: { status: { notIn: ['CANCELLED'] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.supplierEvaluation.groupBy({
        by: ['supplierId'],
        _avg: { overallScore: true },
        _count: true,
        orderBy: { _avg: { overallScore: 'desc' } },
        take: 5,
      }),
    ]);

    return {
      pendingRequisitions: pendingReqs,
      activePurchaseOrders: activePOs,
      overdueDeliveries,
      totalSpend: Number(totalSpend._sum.totalAmount || 0),
      topSupplierIds: topSuppliers.map((s) => ({
        supplierId: s.supplierId,
        avgScore: Number(s._avg.overallScore || 0),
        evaluationCount: s._count,
      })),
    };
  }

  async getProcurementDashboardForPdf(fromDate?: string, toDate?: string) {
    const from = fromDate ? new Date(fromDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const to = toDate ? new Date(toDate) : new Date();

    const [
      pendingReqs,
      activePOs,
      overdueDeliveries,
      totalSpend,
      topSuppliers,
      requisitions,
      orders,
    ] = await Promise.all([
      this.prisma.purchaseRequisition.count({
        where: { status: 'SUBMITTED', createdAt: { gte: from, lte: to } },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] },
          orderDate: { gte: from, lte: to },
        },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] },
          expectedDate: { lt: new Date(), gte: from, lte: to },
        },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: {
          status: { notIn: ['CANCELLED'] },
          orderDate: { gte: from, lte: to },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.supplierEvaluation.groupBy({
        by: ['supplierId'],
        where: { createdAt: { gte: from, lte: to } },
        _avg: { overallScore: true },
        _count: true,
        orderBy: { _avg: { overallScore: 'desc' } },
        take: 5,
      }),
      this.prisma.purchaseRequisition.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.purchaseOrder.findMany({
        where: { orderDate: { gte: from, lte: to } },
        select: {
          id: true,
          poNumber: true,
          orderDate: true,
          expectedDate: true,
          totalAmount: true,
          status: true,
          supplier: { select: { name: true } },
        },
        orderBy: { orderDate: 'desc' },
        take: 50,
      }),
    ]);

    const topSuppliersWithNames = await Promise.all(
      topSuppliers.map(async (s) => {
        const supplier = await this.prisma.supplier.findUnique({
          where: { id: s.supplierId },
          select: { name: true },
        });
        return {
          supplierName: supplier?.name || `Proveedor #${s.supplierId}`,
          evaluationCount: s._count,
          avgScore: Number(s._avg.overallScore || 0),
        };
      })
    );

    return {
      fromDate,
      toDate,
      pendingRequisitions: pendingReqs,
      activePurchaseOrders: activePOs,
      overdueDeliveries,
      totalSpend: Number(totalSpend._sum.totalAmount || 0),
      topSuppliers: topSuppliersWithNames,
      requisitions: requisitions.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description || '',
        priority: r.priority || 'NORMAL',
        status: r.status || 'SUBMITTED',
        createdAt: r.createdAt,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        supplierName: o.supplier?.name || 'N/A',
        orderDate: o.orderDate,
        expectedDate: o.expectedDate,
        totalAmount: Number(o.totalAmount || 0),
        status: o.status || 'DRAFT',
      })),
    };
  }
}
