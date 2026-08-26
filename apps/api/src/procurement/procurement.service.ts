import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service.js';
import { WarehouseService } from '../warehouse/warehouse.service.js';
import { AccountingService } from '../accounting/accounting.service.js';
import { AuditService } from '../audit/audit.service.js';
import { assertCompanyAccess, companyWhere, requireCompanyId, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';
import { FolioService } from '../common/folio/folio.service.js';
import { assertRefsBelongToCompany } from '../common/tenant/assert-refs.js';

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly domainEvents: DomainEventBusService,
    private readonly warehouse: WarehouseService,
    private readonly accounting: AccountingService,
    private readonly audit: AuditService,
    private readonly folio: FolioService,
  ) {}

  // ── Purchase Requisitions ─────────────────────────────────────────
  private generateReqNumber(companyId: number): Promise<string> {
    return this.folio.next('PURCHASE_REQUISITION', companyId);
  }

  async createRequisition(
    dto: {
      title: string;
      description?: string;
      priority?: string;
      requiredDate?: string;
      departmentId?: number;
      items: Array<{
        productId?: number;
        description: string;
        quantity: number;
        estimatedCost?: number;
        notes?: string;
      }>;
    },
    userId: number,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    if (dto.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, ...companyWhere(tenantId) },
        select: { id: true },
      });
      if (!dept) throw new BadRequestException('Departamento inválido para esta empresa');
    }
    const reqNumber = await this.generateReqNumber(tenantId);
    const created = await this.prisma.purchaseRequisition.create({
      data: {
        reqNumber,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        priority: dto.priority || 'NORMAL',
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : null,
        departmentId: dto.departmentId ?? null,
        requestedById: userId,
        companyId: tenantId,
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

  async listRequisitions(
    filters?: { status?: string; departmentId?: number },
    query?: PaginationQueryDto,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
    if (filters?.status) where.status = filters.status;
    if (filters?.departmentId) where.departmentId = filters.departmentId;
    const include = {
      items: true,
      requestedBy: { select: { id: true, nombre: true } },
      approvedBy: { select: { id: true, nombre: true } },
    };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.purchaseRequisition.findMany({
          where,
          include,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma.purchaseRequisition.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.purchaseRequisition.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRequisition(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const req = await this.prisma.purchaseRequisition.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: {
        items: { include: { product: true } },
        requestedBy: { select: { id: true, nombre: true } },
        approvedBy: { select: { id: true, nombre: true } },
        department: true,
      },
    });
    assertCompanyAccess(req, tenantId, 'Requisición');
    return req;
  }

  async approveRequisition(id: number, userId: number, companyId?: number | null) {
    const before = await this.getRequisition(id, companyId);
    const updated = await this.prisma.purchaseRequisition.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
    });
    void this.notificationHierarchy
      .notifyPurchaseRequisitionApproved(userId, before.requestedById, id, before.reqNumber, before.title)
      .catch(() => undefined);
    return updated;
  }

  async rejectRequisition(id: number, userId: number, reason: string, companyId?: number | null) {
    const before = await this.getRequisition(id, companyId);
    const updated = await this.prisma.purchaseRequisition.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedById: userId,
        approvedAt: new Date(),
        rejectionReason: reason.trim(),
      },
    });
    void this.notificationHierarchy
      .notifyPurchaseRequisitionRejected(
        userId,
        before.requestedById,
        id,
        before.reqNumber,
        before.title,
        reason.trim(),
      )
      .catch(() => undefined);
    return updated;
  }

  // ── Purchase Orders ───────────────────────────────────────────────
  private generatePONumber(companyId: number): Promise<string> {
    return this.folio.next('PURCHASE_ORDER', companyId);
  }

  async listSuppliers(companyId?: number | null) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    return this.prisma.supplier.findMany({
      where: { isActive: true, companyId: cid },
      select: { id: true, name: true, description: true, apiUrl: true, rfc: true },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(
    dto: { name: string; description?: string; apiUrl?: string; rfc?: string },
    companyId?: number | null,
  ) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Nombre de proveedor requerido');
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    return this.prisma.supplier.upsert({
      where: { companyId_name: { companyId: cid, name } },
      update: {
        description: dto.description?.trim() || undefined,
        apiUrl: dto.apiUrl?.trim() || undefined,
        rfc: dto.rfc?.trim().toUpperCase() || undefined,
        isActive: true,
      },
      create: {
        name,
        description: dto.description?.trim() || null,
        apiUrl: dto.apiUrl?.trim() || null,
        rfc: dto.rfc?.trim().toUpperCase() || null,
        companyId: cid,
      },
      select: { id: true, name: true, description: true, apiUrl: true, rfc: true },
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
    companyId?: number | null;
    items: Array<{ productId?: number; description: string; quantity: number; unitPrice: number; taxRate?: number }>;
  }, userId: number) {
    if (!dto.supplierId && !dto.supplierName) {
      throw new BadRequestException('Se requiere supplierId o supplierName');
    }
    const companyId = await resolveRequiredCompanyId(this.prisma, dto.companyId);
    let supplierId = dto.supplierId;
    if (!supplierId && dto.supplierName) {
      const supplier = await this.prisma.supplier.upsert({
        where: {
          companyId_name: {
            companyId,
            name: dto.supplierName.trim(),
          },
        },
        update: {},
        create: { name: dto.supplierName.trim(), companyId },
      });
      supplierId = supplier.id;
    }

    // Cuando llega `supplierId` en lugar de `supplierName` no pasa por el
    // upsert de arriba, así que nadie comprobaba que ese proveedor —ni la
    // requisición, ni los productos de las partidas— fueran de esta empresa.
    await assertRefsBelongToCompany(companyId, [
      { modelo: this.prisma.supplier, ids: [supplierId], etiqueta: 'Proveedor' },
      {
        modelo: this.prisma.purchaseRequisition,
        ids: [dto.requisitionId],
        etiqueta: 'Requisición',
      },
      { modelo: this.prisma.product, ids: dto.items.map((i) => i.productId), etiqueta: 'Producto' },
    ]);

    const poNumber = await this.generatePONumber(companyId);
    const items = dto.items.map((i) => ({
      ...i,
      total: i.quantity * i.unitPrice * (1 + (i.taxRate || 0) / 100),
    }));
    const subtotal = dto.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const taxAmount = dto.items.reduce((s, i) => s + i.quantity * i.unitPrice * ((i.taxRate || 0) / 100), 0);

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
    this.domainEvents.requestAutoApproval({
      entityType: 'PURCHASE_ORDER',
      entityId: created.id,
      userId,
      companyId: created.companyId ?? companyId,
      payload: {
        amount: subtotal + taxAmount,
        totalAmount: subtotal + taxAmount,
        supplierId,
        supplierName,
        poNumber: created.poNumber,
      },
    });
    return created;
  }

  async listPurchaseOrders(
    filters?: { status?: string; supplierId?: number; companyId?: number | null },
    query?: PaginationQueryDto,
  ) {
    const where: any = { ...companyWhere(filters?.companyId ?? null) };
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

  async getPurchaseOrder(id: number, companyId?: number | null) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, supplier: true, receipts: { include: { items: true } }, createdBy: { select: { id: true, nombre: true } }, approvedBy: { select: { id: true, nombre: true } } },
    });
    assertCompanyAccess(po, companyId, 'Orden de compra');
    return po!;
  }

  async approvePurchaseOrder(id: number, userId: number, companyId?: number | null) {
    const po = await this.getPurchaseOrder(id, companyId);
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
  private generateReceiptNumber(companyId: number): Promise<string> {
    return this.folio.next('GOODS_RECEIPT', companyId);
  }

  async createGoodsReceipt(dto: {
    purchaseOrderId: number;
    warehouseId?: number;
    receiptDate: string;
    notes?: string;
    createApInvoice?: boolean;
    freightCost?: number;
    insuranceCost?: number;
    customsCost?: number;
    otherLandedCost?: number;
    items: Array<{ purchaseOrderItemId: number; quantityReceived: number; quantityRejected?: number; lotNumber?: string; notes?: string }>;
  }, userId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, ...companyWhere(tenantId) },
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

    const poItemIds = new Set(po.items.map((p) => p.id));
    for (const item of dto.items) {
      if (!poItemIds.has(item.purchaseOrderItemId)) {
        throw new BadRequestException(
          `Partida ${item.purchaseOrderItemId} no pertenece a la orden de compra`,
        );
      }
    }

    let warehouseId = dto.warehouseId ? Number(dto.warehouseId) : null;
    if (warehouseId) {
      const wh = await this.prisma.warehouse.findFirst({
        where: { id: warehouseId, isActive: true, ...companyWhere(tenantId) },
      });
      if (!wh) throw new BadRequestException('Almacén inválido');
    } else {
      const fallback = await this.prisma.warehouse.findFirst({
        where: { isActive: true, ...companyWhere(tenantId) },
        orderBy: { id: 'asc' },
      });
      warehouseId = fallback?.id ?? null;
    }

    // Landed cost: prorratea flete/seguro/aranceles/otros por valor recibido (solo líneas PRODUCT).
    const freightCost = Number(dto.freightCost) > 0 ? Number(dto.freightCost) : 0;
    const insuranceCost = Number(dto.insuranceCost) > 0 ? Number(dto.insuranceCost) : 0;
    const customsCost = Number(dto.customsCost) > 0 ? Number(dto.customsCost) : 0;
    const otherLandedCost = Number(dto.otherLandedCost) > 0 ? Number(dto.otherLandedCost) : 0;
    const totalLandedCost = freightCost + insuranceCost + customsCost + otherLandedCost;

    const lineValueByPoItemId = new Map<number, number>();
    let totalReceivedValue = 0;
    for (const i of dto.items) {
      const qty = Number(i.quantityReceived) || 0;
      if (qty <= 0) continue;
      const poItem = po.items.find((p) => p.id === i.purchaseOrderItemId);
      const itemType = poItem?.product?.itemType || (poItem?.productId ? 'PRODUCT' : 'SERVICE');
      if (!poItem?.productId || itemType !== 'PRODUCT') continue;
      const value = qty * (Number(poItem.unitPrice) || 0);
      lineValueByPoItemId.set(i.purchaseOrderItemId, value);
      totalReceivedValue += value;
    }
    const landedCostByPoItemId = new Map<number, number>();
    const perUnitExtraByPoItemId = new Map<number, number>();
    if (totalLandedCost > 0 && totalReceivedValue > 0) {
      for (const [poItemId, value] of lineValueByPoItemId) {
        const share = (value / totalReceivedValue) * totalLandedCost;
        landedCostByPoItemId.set(poItemId, share);
        const qty = Number(dto.items.find((i) => i.purchaseOrderItemId === poItemId)!.quantityReceived) || 0;
        if (qty > 0) perUnitExtraByPoItemId.set(poItemId, share / qty);
      }
    }

    const receiptNumber = await this.generateReceiptNumber(tenantId);
    const receipt = await this.prisma.goodsReceipt.create({
      data: {
        receiptNumber,
        purchaseOrderId: dto.purchaseOrderId,
        warehouseId,
        receiptDate: new Date(dto.receiptDate),
        notes: dto.notes?.trim() || null,
        receivedById: userId,
        companyId: tenantId,
        freightCost: new Prisma.Decimal(freightCost),
        insuranceCost: new Prisma.Decimal(insuranceCost),
        customsCost: new Prisma.Decimal(customsCost),
        otherLandedCost: new Prisma.Decimal(otherLandedCost),
        items: {
          create: dto.items.map((i) => ({
            purchaseOrderItemId: i.purchaseOrderItemId,
            quantityReceived: new Prisma.Decimal(i.quantityReceived),
            quantityRejected: new Prisma.Decimal(i.quantityRejected || 0),
            lotNumber: i.lotNumber?.trim() || null,
            notes: i.notes?.trim() || null,
            landedCostAllocated: new Prisma.Decimal(landedCostByPoItemId.get(i.purchaseOrderItemId) ?? 0),
          })),
        },
      },
      include: { items: true },
    });

    // Update PO item received quantities (scoped to this PO — reject foreign line ids)
    for (const item of dto.items) {
      const updated = await this.prisma.purchaseOrderItem.updateMany({
        where: { id: item.purchaseOrderItemId, purchaseOrderId: po.id },
        data: { receivedQty: { increment: new Prisma.Decimal(item.quantityReceived) } },
      });
      if (updated.count === 0) {
        throw new BadRequestException(
          `Partida ${item.purchaseOrderItemId} no pertenece a la orden de compra`,
        );
      }
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

        const landedPerUnit = perUnitExtraByPoItemId.get(item.purchaseOrderItemId) ?? 0;
        const effectiveUnitCost = (Number(poItem.unitPrice) || 0) + landedPerUnit;

        await this.warehouse.createStockMovement(
          {
            type: 'RECEIPT',
            productId: poItem.productId,
            toWarehouseId: warehouseId,
            quantity: qty,
            unitCost: effectiveUnitCost,
            purchaseOrderId: dto.purchaseOrderId,
            reference: receipt.receiptNumber,
            notes: landedPerUnit > 0
              ? `GR ${receipt.receiptNumber} (incluye landed cost $${landedPerUnit.toFixed(4)}/u)`
              : `GR ${receipt.receiptNumber}`,
          },
          userId,
          tenantId,
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
        companyId: tenantId,
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
        apInvoice = await this.accounting.createInvoiceFromGoodsReceipt(receipt.id, userId, tenantId);
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

  async listGoodsReceipts(purchaseOrderId?: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
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
  }, userId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, ...companyWhere(tenantId) },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
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
        companyId: tenantId,
      },
      include: { supplier: true },
    });
  }

  async listSupplierEvaluations(supplierId?: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
    if (supplierId) where.supplierId = supplierId;
    return this.prisma.supplierEvaluation.findMany({
      where,
      include: { supplier: true, evaluatedBy: { select: { id: true, nombre: true } } },
      orderBy: { evaluationDate: 'desc' },
    });
  }

  // ── Procurement Dashboard ─────────────────────────────────────────
  async getProcurementDashboard(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);
    const [
      pendingReqs,
      activePOs,
      overdueDeliveries,
      totalSpend,
      topSuppliers,
    ] = await Promise.all([
      this.prisma.purchaseRequisition.count({ where: { status: 'SUBMITTED', ...scope } }),
      this.prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] }, ...scope } }),
      this.prisma.purchaseOrder.count({
        where: { status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] }, expectedDate: { lt: new Date() }, ...scope },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: { status: { notIn: ['CANCELLED'] }, ...scope },
        _sum: { totalAmount: true },
      }),
      this.prisma.supplierEvaluation.groupBy({
        by: ['supplierId'],
        where: { ...scope },
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

  async getProcurementDashboardForPdf(fromDate?: string, toDate?: string, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const scope = companyWhere(tenantId);
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
        where: { status: 'SUBMITTED', createdAt: { gte: from, lte: to }, ...scope },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          status: { in: ['DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED'] },
          orderDate: { gte: from, lte: to },
          ...scope,
        },
      }),
      this.prisma.purchaseOrder.count({
        where: {
          status: { in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] },
          expectedDate: { lt: new Date(), gte: from, lte: to },
          ...scope,
        },
      }),
      this.prisma.purchaseOrder.aggregate({
        where: {
          status: { notIn: ['CANCELLED'] },
          orderDate: { gte: from, lte: to },
          ...scope,
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.supplierEvaluation.groupBy({
        by: ['supplierId'],
        where: { createdAt: { gte: from, lte: to }, ...scope },
        _avg: { overallScore: true },
        _count: true,
        orderBy: { _avg: { overallScore: 'desc' } },
        take: 5,
      }),
      this.prisma.purchaseRequisition.findMany({
        where: { createdAt: { gte: from, lte: to }, ...scope },
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
        where: { orderDate: { gte: from, lte: to }, ...scope },
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
        const supplier = await this.prisma.supplier.findFirst({
          where: { id: s.supplierId, ...scope },
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

  // ── RFQ multi-proveedor ─────────────────────────────────────────────
  private generateRfqNumber(companyId: number): Promise<string> {
    return this.folio.next('PURCHASE_RFQ', companyId);
  }

  /**
   * Crea una RFQ hacia N proveedores a partir de una requisición: una línea
   * por (producto de la requisición × proveedor), lista para capturar precio
   * y comparar. Adjudicar reutiliza createPurchaseOrder — no duplica el flujo.
   */
  async createRfq(
    dto: { requisitionId: number; supplierIds: number[]; dueDate?: string; notes?: string },
    userId: number,
    companyId?: number | null,
  ) {
    if (!dto.supplierIds?.length) {
      throw new BadRequestException('Selecciona al menos un proveedor para cotizar');
    }
    const requisition = await this.prisma.purchaseRequisition.findUnique({
      where: { id: dto.requisitionId },
      include: { items: true },
    });
    if (!requisition) throw new NotFoundException('Requisición no encontrada');
    if (!requisition.items.length) {
      throw new BadRequestException('La requisición no tiene artículos para cotizar');
    }

    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const rfqNumber = await this.generateRfqNumber(cid);

    return this.prisma.purchaseRFQ.create({
      data: {
        rfqNumber,
        requisitionId: dto.requisitionId,
        status: 'SENT',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes?.trim() || null,
        companyId: cid,
        createdById: userId,
        lines: {
          create: dto.supplierIds.flatMap((supplierId) =>
            requisition.items.map((item) => ({
              supplierId,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
            })),
          ),
        },
      },
      include: {
        requisition: { select: { id: true, reqNumber: true, title: true } },
        lines: { include: { supplier: { select: { id: true, name: true } }, product: { select: { id: true, name: true, sku: true } } } },
      },
    });
  }

  async listRfqs(filters?: { requisitionId?: number; status?: string; companyId?: number | null }) {
    const where: any = { ...companyWhere(filters?.companyId ?? null) };
    if (filters?.requisitionId) where.requisitionId = filters.requisitionId;
    if (filters?.status) where.status = filters.status;
    return this.prisma.purchaseRFQ.findMany({
      where,
      include: {
        requisition: { select: { id: true, reqNumber: true, title: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRfq(id: number, companyId?: number | null) {
    const rfq = await this.prisma.purchaseRFQ.findUnique({
      where: { id },
      include: {
        requisition: { select: { id: true, reqNumber: true, title: true } },
        lines: { include: { supplier: { select: { id: true, name: true } }, product: { select: { id: true, name: true, sku: true } } } },
        awardedPurchaseOrder: { select: { id: true, poNumber: true } },
      },
    });
    if (!rfq) throw new NotFoundException('RFQ no encontrada');
    assertCompanyAccess(rfq, companyId ?? null, 'RFQ');
    return rfq;
  }

  /** Captura o actualiza la cotización de un proveedor para una línea de la RFQ. */
  async submitRfqQuote(
    rfqId: number,
    lineId: number,
    dto: { unitPrice: number; leadTimeDays?: number; notes?: string },
    companyId?: number | null,
  ) {
    const rfq = await this.prisma.purchaseRFQ.findFirst({
      where: { id: rfqId, ...companyWhere(companyId ?? null) },
    });
    if (!rfq) throw new NotFoundException('RFQ no encontrada');
    assertCompanyAccess(rfq, companyId ?? null, 'RFQ');

    const line = await this.prisma.purchaseRFQLine.findFirst({ where: { id: lineId, rfqId } });
    if (!line) throw new NotFoundException('Línea de RFQ no encontrada');
    if (!Number.isFinite(dto.unitPrice) || dto.unitPrice < 0) {
      throw new BadRequestException('Precio unitario inválido');
    }

    await this.prisma.purchaseRFQLine.update({
      where: { id: lineId },
      data: {
        unitPrice: new Prisma.Decimal(dto.unitPrice),
        leadTimeDays: dto.leadTimeDays ?? null,
        notes: dto.notes?.trim() || null,
        quotedAt: new Date(),
      },
    });

    if (rfq.status === 'DRAFT' || rfq.status === 'SENT') {
      await this.prisma.purchaseRFQ.update({ where: { id: rfqId }, data: { status: 'QUOTED' } });
    }

    return this.getRfq(rfqId, companyId);
  }

  /** Comparación lado a lado: total cotizado y cobertura de líneas por proveedor. */
  async compareRfq(rfqId: number, companyId?: number | null) {
    const rfq = await this.getRfq(rfqId, companyId);
    const bySupplier = new Map<number, { supplierId: number; supplierName: string; lines: typeof rfq.lines; totalPrice: number; maxLeadTimeDays: number; quotedLines: number; totalLines: number }>();

    for (const line of rfq.lines) {
      const key = line.supplierId;
      if (!bySupplier.has(key)) {
        bySupplier.set(key, {
          supplierId: key,
          supplierName: line.supplier?.name ?? `Proveedor #${key}`,
          lines: [],
          totalPrice: 0,
          maxLeadTimeDays: 0,
          quotedLines: 0,
          totalLines: 0,
        });
      }
      const entry = bySupplier.get(key)!;
      entry.lines.push(line);
      entry.totalLines += 1;
      if (line.unitPrice != null) {
        entry.quotedLines += 1;
        entry.totalPrice += Number(line.unitPrice) * Number(line.quantity);
        entry.maxLeadTimeDays = Math.max(entry.maxLeadTimeDays, line.leadTimeDays ?? 0);
      }
    }

    const suppliers = [...bySupplier.values()].sort((a, b) => {
      const aComplete = a.quotedLines === a.totalLines;
      const bComplete = b.quotedLines === b.totalLines;
      if (aComplete !== bComplete) return aComplete ? -1 : 1;
      return a.totalPrice - b.totalPrice;
    });

    const bestPriceSupplierId = suppliers.find((s) => s.quotedLines === s.totalLines)?.supplierId ?? null;
    const bestLeadTimeSupplierId = [...suppliers]
      .filter((s) => s.quotedLines === s.totalLines)
      .sort((a, b) => a.maxLeadTimeDays - b.maxLeadTimeDays)[0]?.supplierId ?? null;

    return { rfq, suppliers, bestPriceSupplierId, bestLeadTimeSupplierId };
  }

  /** Adjudica la RFQ a un proveedor: genera la PurchaseOrder con las líneas cotizadas de ese proveedor. */
  async awardRfq(rfqId: number, supplierId: number, userId: number, companyId?: number | null) {
    const rfq = await this.getRfq(rfqId, companyId);
    if (rfq.status === 'AWARDED') throw new BadRequestException('La RFQ ya fue adjudicada');
    if (rfq.status === 'CANCELLED') throw new BadRequestException('La RFQ está cancelada');

    const lines = rfq.lines.filter((l) => l.supplierId === supplierId);
    if (!lines.length) throw new BadRequestException('El proveedor no tiene líneas en esta RFQ');
    const missing = lines.filter((l) => l.unitPrice == null);
    if (missing.length) {
      throw new BadRequestException(`Faltan ${missing.length} precio(s) por capturar para este proveedor antes de adjudicar`);
    }

    const po = await this.createPurchaseOrder(
      {
        supplierId,
        requisitionId: rfq.requisitionId,
        orderDate: new Date().toISOString().slice(0, 10),
        companyId,
        notes: `Adjudicado desde RFQ ${rfq.rfqNumber}`,
        items: lines.map((l) => ({
          productId: l.productId ?? undefined,
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        })),
      },
      userId,
    );

    await this.prisma.purchaseRFQ.update({
      where: { id: rfqId },
      data: { status: 'AWARDED', awardedPurchaseOrderId: po.id },
    });

    return po;
  }

  async cancelRfq(rfqId: number, companyId?: number | null) {
    const rfq = await this.prisma.purchaseRFQ.findFirst({
      where: { id: rfqId, ...companyWhere(companyId ?? null) },
    });
    if (!rfq) throw new NotFoundException('RFQ no encontrada');
    assertCompanyAccess(rfq, companyId ?? null, 'RFQ');
    if (rfq.status === 'AWARDED') throw new BadRequestException('No se puede cancelar una RFQ ya adjudicada');
    return this.prisma.purchaseRFQ.update({ where: { id: rfqId }, data: { status: 'CANCELLED' } });
  }

  /** Aprobación de OC en workflow — confirma borradores pendientes. */
  async onPurchaseOrderWorkflowApproved(id: number, companyId: number, actorId?: number) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, status: 'DRAFT', ...companyWhere(companyId) },
    });
    if (!po) return;

    await this.prisma.purchaseOrder.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'CONFIRMED', approvedById: actorId ?? null, approvedAt: new Date() },
    });
  }

  /** Rechazo de OC en workflow — cancela borradores pendientes de aprobación. */
  async onPurchaseOrderWorkflowRejected(
    id: number,
    companyId: number,
    actorId?: number,
    reason?: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, ...companyWhere(companyId) },
    });
    if (!po || po.status !== 'DRAFT') return;

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: 'PURCHASE_ORDER',
      entityId: id,
      companyId,
      userId: actorId,
      payload: {
        status: 'CANCELLED',
        poNumber: po.poNumber,
        reason: reason?.trim() || null,
      },
    });
  }
}
