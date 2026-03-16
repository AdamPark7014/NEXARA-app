import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';

@Injectable()
export class ProcurementService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.purchaseRequisition.create({
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
    return this.prisma.purchaseRequisition.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
    });
  }

  async rejectRequisition(id: number, userId: number, reason: string) {
    return this.prisma.purchaseRequisition.update({
      where: { id },
      data: { status: 'REJECTED', approvedById: userId, approvedAt: new Date(), rejectionReason: reason.trim() },
    });
  }

  // ── Purchase Orders ───────────────────────────────────────────────
  private async generatePONumber(): Promise<string> {
    const count = await this.prisma.purchaseOrder.count();
    return `PO-${String(count + 1).padStart(6, '0')}`;
  }

  async createPurchaseOrder(dto: {
    supplierId: number;
    requisitionId?: number;
    orderDate: string;
    expectedDate?: string;
    currency?: string;
    paymentTerms?: string;
    shippingAddress?: string;
    notes?: string;
    items: Array<{ productId?: number; description: string; quantity: number; unitPrice: number; taxRate?: number }>;
  }, userId: number) {
    const poNumber = await this.generatePONumber();
    const items = dto.items.map((i) => ({
      ...i,
      total: i.quantity * i.unitPrice * (1 + (i.taxRate || 0) / 100),
    }));
    const subtotal = dto.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const taxAmount = dto.items.reduce((s, i) => s + i.quantity * i.unitPrice * ((i.taxRate || 0) / 100), 0);

    return this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: dto.supplierId,
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
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CONFIRMED', approvedById: userId, approvedAt: new Date() },
    });
  }

  // ── Goods Receipts ────────────────────────────────────────────────
  private async generateReceiptNumber(): Promise<string> {
    const count = await this.prisma.goodsReceipt.count();
    return `GR-${String(count + 1).padStart(6, '0')}`;
  }

  async createGoodsReceipt(dto: {
    purchaseOrderId: number;
    receiptDate: string;
    notes?: string;
    items: Array<{ purchaseOrderItemId: number; quantityReceived: number; quantityRejected?: number; lotNumber?: string; notes?: string }>;
  }, userId: number) {
    const receiptNumber = await this.generateReceiptNumber();
    const receipt = await this.prisma.goodsReceipt.create({
      data: {
        receiptNumber,
        purchaseOrderId: dto.purchaseOrderId,
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

    // Check if all items fully received → update PO status
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.purchaseOrderId },
      include: { items: true },
    });
    if (po) {
      const allReceived = po.items.every((i) => Number(i.receivedQty) >= Number(i.quantity));
      const someReceived = po.items.some((i) => Number(i.receivedQty) > 0);
      await this.prisma.purchaseOrder.update({
        where: { id: dto.purchaseOrderId },
        data: { status: allReceived ? 'RECEIVED' : someReceived ? 'PARTIALLY_RECEIVED' : undefined },
      });
    }

    return receipt;
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
}
