import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { PacService } from '../pac/pac.service.js';
import { SatService } from '../pac/sat.service.js';

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly pacService: PacService,
    private readonly satService: SatService,
  ) {}

  private readonly satPaymentFormValues = new Set([
    'FP01', 'FP02', 'FP03', 'FP04', 'FP05', 'FP06', 'FP08', 'FP12', 'FP13', 'FP14',
    'FP15', 'FP17', 'FP23', 'FP24', 'FP25', 'FP26', 'FP27', 'FP28', 'FP29', 'FP30',
    'FP31', 'FP99',
  ]);

  private readonly satPaymentMethodValues = new Set(['PUE', 'PPD']);

  private readonly cfdiUsageValues = new Set([
    'G01', 'G02', 'G03', 'I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07', 'I08',
    'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D10', 'P01', 'S01', 'CP01',
  ]);

  private readonly fiscalRegimeValues = new Set([
    'R601', 'R603', 'R605', 'R606', 'R607', 'R608', 'R610', 'R611', 'R612', 'R614',
    'R615', 'R616', 'R620', 'R621', 'R622', 'R623', 'R624', 'R625', 'R626',
  ]);

  private normalizeSatPaymentForm(value?: string) {
    if (!value) return undefined;
    const raw = String(value).trim().toUpperCase();
    const normalized = raw.startsWith('FP')
      ? raw
      : /^\d{1,2}$/.test(raw)
        ? `FP${raw.padStart(2, '0')}`
        : raw;

    if (!this.satPaymentFormValues.has(normalized)) {
      throw new BadRequestException(`Forma de pago SAT inválida: ${value}`);
    }
    return normalized;
  }

  /** Mapea método de pago interno (SPEI, CASH…) a forma de pago SAT (FPxx). */
  private methodToSatPaymentForm(method?: string): string {
    const m = String(method || 'SPEI').trim().toUpperCase();
    if (m === 'SPEI' || m === 'TRANSFER' || m === 'BANK_TRANSFER') return 'FP03';
    if (m === 'CASH' || m === 'EFECTIVO') return 'FP01';
    if (m === 'CHECK' || m === 'CHEQUE') return 'FP02';
    if (m === 'CARD' || m === 'CREDIT_CARD' || m === 'TARJETA') return 'FP04';
    return 'FP99';
  }

  private normalizeSatPaymentMethod(value?: string) {
    if (!value) return undefined;
    const normalized = String(value).trim().toUpperCase();
    if (!this.satPaymentMethodValues.has(normalized)) {
      throw new BadRequestException(`Método de pago SAT inválido: ${value}`);
    }
    return normalized;
  }

  private normalizeCfdiUsage(value?: string) {
    if (!value) return undefined;
    const normalized = String(value).trim().toUpperCase();
    if (!this.cfdiUsageValues.has(normalized)) {
      throw new BadRequestException(`Uso CFDI inválido: ${value}`);
    }
    return normalized;
  }

  private normalizeFiscalRegime(value?: string) {
    if (!value) return undefined;
    const raw = String(value).trim().toUpperCase();
    const normalized = raw.startsWith('R')
      ? raw
      : /^\d{3}$/.test(raw)
        ? `R${raw}`
        : raw;

    if (!this.fiscalRegimeValues.has(normalized)) {
      throw new BadRequestException(`Régimen fiscal inválido: ${value}`);
    }
    return normalized;
  }

  private normalizeSettingKey(value?: string) {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private pickSettingValue(
    settings: Array<{ key: string; value: string; label?: string | null }>,
    candidates: string[],
  ): string | undefined {
    const normalizedCandidates = candidates.map((c) => this.normalizeSettingKey(c));
    const match = settings.find((s) => {
      const key = this.normalizeSettingKey(s.key);
      const label = this.normalizeSettingKey(s.label || '');
      return normalizedCandidates.some((candidate) => key.includes(candidate) || label.includes(candidate));
    });
    const value = match?.value?.trim();
    return value ? value : undefined;
  }

  /** Extrae CP mexicano (5 dígitos) de dirección fiscal u otros textos. */
  private extractMexicanZip(...sources: Array<string | null | undefined>): string | null {
    for (const src of sources) {
      if (!src) continue;
      const match = String(src).match(/\b(\d{5})\b/);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  /** Claves SAT para líneas de orden de cierre → factura CFDI. */
  private resolveSatKeysForOrderLine(line: {
    product?: {
      specifications?: unknown;
      itemType?: string;
      satProductKey?: string | null;
      satUnitKey?: string | null;
      unitName?: string | null;
    } | null;
    unit?: string | null;
    category?: string | null;
  }) {
    const spec =
      line.product?.specifications && typeof line.product.specifications === 'object'
        ? (line.product.specifications as Record<string, unknown>)
        : {};
    const satProductKey = String(
      line.product?.satProductKey ||
        spec.satProductKey ||
        spec.claveProdServ ||
        spec.claveProducto ||
        '80101500',
    ).trim();
    const defaultUnit = line.product?.itemType === 'PRODUCT' ? 'H87' : 'E48';
    const satUnitKey = String(
      line.product?.satUnitKey || spec.satUnitKey || spec.claveUnidad || defaultUnit,
    ).trim();
    const unitName =
      line.unit?.trim() ||
      line.product?.unitName?.trim() ||
      String(spec.unitName || 'Servicio');
    return { satProductKey, satUnitKey, unitName };
  }

  // ── Chart of Accounts ─────────────────────────────────────────────
  async createAccount(dto: {
    code: string;
    name: string;
    type: string;
    parentId?: number;
    description?: string;
    currency?: string;
  }) {
    return this.prisma.account.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        type: dto.type as any,
        parentId: dto.parentId ?? null,
        description: dto.description?.trim() || null,
        currency: dto.currency || 'MXN',
      },
      include: { parent: true },
    });
  }

  async listAccounts(filters?: { type?: string; isActive?: boolean }) {
    const where: any = {};
    if (filters?.type) where.type = filters.type;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    return this.prisma.account.findMany({
      where,
      include: { parent: true, children: true },
      orderBy: { code: 'asc' },
    });
  }

  async getAccount(id: number) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { parent: true, children: true },
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    return account;
  }

  async updateAccount(id: number, dto: Partial<{ code: string; name: string; type: string; parentId: number; description: string; isActive: boolean; currency: string }>) {
    return this.prisma.account.update({ where: { id }, data: dto as any });
  }

  // ── Fiscal Periods ────────────────────────────────────────────────
  async createFiscalPeriod(dto: { name: string; startDate: string; endDate: string }) {
    return this.prisma.fiscalPeriod.create({
      data: {
        name: dto.name.trim(),
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
    });
  }

  async listFiscalPeriods() {
    return this.prisma.fiscalPeriod.findMany({ orderBy: { startDate: 'desc' } });
  }

  async closeFiscalPeriod(id: number, userId: number) {
    return this.prisma.fiscalPeriod.update({
      where: { id },
      data: { isClosed: true, closedAt: new Date(), closedById: userId },
    });
  }

  // ── Journal Entries ───────────────────────────────────────────────
  private async generateEntryNumber(): Promise<string> {
    const count = await this.prisma.journalEntry.count();
    return `JE-${String(count + 1).padStart(6, '0')}`;
  }

  async createJournalEntry(dto: {
    date: string;
    description: string;
    reference?: string;
    fiscalPeriodId?: number;
    companyId?: number | null;
    lines: Array<{ debitAccountId: number; creditAccountId?: number; description?: string; debit: number; credit: number; costCenterId?: number }>;
  }, userId: number) {
    const totalDebit = dto.lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = dto.lines.reduce((s, l) => s + (l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException('Debe y Haber no cuadran');
    }

    const companyId = await this.resolveCompanyId(dto.companyId);
    const entryNumber = await this.generateEntryNumber();
    return this.prisma.journalEntry.create({
      data: {
        entryNumber,
        date: new Date(dto.date),
        description: dto.description.trim(),
        reference: dto.reference?.trim() || null,
        fiscalPeriodId: dto.fiscalPeriodId ?? null,
        companyId,
        totalDebit: new Prisma.Decimal(totalDebit),
        totalCredit: new Prisma.Decimal(totalCredit),
        createdById: userId,
        lines: {
          create: dto.lines.map((line) => ({
            debitAccountId: line.debitAccountId,
            creditAccountId: line.creditAccountId ?? null,
            description: line.description?.trim() || null,
            debit: new Prisma.Decimal(line.debit || 0),
            credit: new Prisma.Decimal(line.credit || 0),
            costCenterId: line.costCenterId ?? null,
          })),
        },
      },
      include: { lines: { include: { debitAccount: true, creditAccount: true, costCenter: true } } },
    });
  }

  private async resolveCompanyId(explicit?: number | null) {
    if (explicit != null && Number.isFinite(Number(explicit))) return Number(explicit);
    const primary = await this.prisma.companyProfile.findFirst({
      where: { isPrimary: true, isActive: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return primary?.id ?? null;
  }

  async listJournalEntries(filters?: { status?: string; from?: string; to?: string }, query?: PaginationQueryDto) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.from || filters?.to) {
      where.date = {};
      if (filters.from) where.date.gte = new Date(filters.from);
      if (filters.to) where.date.lte = new Date(filters.to);
    }
    const include = { lines: { include: { debitAccount: true, creditAccount: true } }, createdBy: { select: { id: true, nombre: true } } };
    const pageQuery = query ?? Object.assign(new PaginationQueryDto(), { page: 1, limit: 50 });
    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include,
        orderBy: { date: 'desc' },
        skip: pageQuery.skip,
        take: pageQuery.take,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, pageQuery);
  }

  async getJournalEntry(id: number) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: { include: { debitAccount: true, creditAccount: true, costCenter: true } }, createdBy: { select: { id: true, nombre: true } } },
    });
    if (!entry) throw new NotFoundException('Asiento no encontrado');
    return entry;
  }

  async postJournalEntry(id: number, postedByUserId: number) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: true, fiscalPeriod: true } });
    if (!entry) throw new NotFoundException('Asiento no encontrado');
    if (entry.status === 'POSTED') throw new BadRequestException('Ya está contabilizado');
    if (entry.fiscalPeriod?.isClosed) throw new BadRequestException('Periodo fiscal cerrado');

    // Todo corre en una sola transacción: la "reclamación" del asiento vía
    // updateMany con status distinto de POSTED en el WHERE hace que dos
    // clics/solicitudes concurrentes de "Contabilizar" no puedan ambas pasar
    // el chequeo y duplicar el efecto en los saldos de cuentas.
    const updated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.journalEntry.updateMany({
        where: { id, status: { not: 'POSTED' } },
        data: { status: 'POSTED', postedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Ya está contabilizado');
      }

      // Debe/Haber se aplican sobre debitAccountId (misma convención que trial balance).
      await this.applyLineBalances(tx, entry.lines, 1);
      await this.refreshBudgetActuals(tx, entry.lines, entry.date, 1);

      return tx.journalEntry.findUniqueOrThrow({
        where: { id },
        include: { lines: { include: { debitAccount: true, creditAccount: true } } },
      });
    });

    const desc = entry.description?.trim() || 'Sin descripción';
    void this.notificationHierarchy
      .notifyJournalEntryPosted(postedByUserId, updated.id, entry.entryNumber, desc)
      .catch(() => undefined);
    return updated;
  }

  /**
   * Aplica movimiento neto (+debe − haber) a Account.balance sobre debitAccountId.
   * creditAccountId es metadato de contraparte; los reportes ya usan solo debitAccount.
   */
  private async applyLineBalances(
    tx: Prisma.TransactionClient,
    lines: Array<{ debitAccountId: number; debit: Prisma.Decimal; credit: Prisma.Decimal }>,
    sign: 1 | -1,
  ) {
    for (const line of lines) {
      const delta = line.debit.minus(line.credit);
      if (delta.equals(0)) continue;
      const signed = sign === 1 ? delta : delta.negated();
      await tx.account.update({
        where: { id: line.debitAccountId },
        data: { balance: { increment: signed } },
      });
    }
  }

  /** Actualiza Budget.actualAmount por centro de costo del asiento. */
  private async refreshBudgetActuals(
    tx: Prisma.TransactionClient,
    lines: Array<{ costCenterId: number | null; debit: Prisma.Decimal; credit: Prisma.Decimal }>,
    entryDate: Date,
    sign: 1 | -1,
  ) {
    const byCc = new Map<number, Prisma.Decimal>();
    for (const line of lines) {
      if (!line.costCenterId) continue;
      const delta = line.debit.minus(line.credit);
      if (delta.equals(0)) continue;
      const signed = sign === 1 ? delta : delta.negated();
      byCc.set(line.costCenterId, (byCc.get(line.costCenterId) ?? new Prisma.Decimal(0)).plus(signed));
    }
    if (byCc.size === 0) return;

    const year = entryDate.getFullYear();
    const month = entryDate.getMonth() + 1;
    for (const [costCenterId, delta] of byCc) {
      await tx.budget.updateMany({
        where: { costCenterId, year, month },
        data: { actualAmount: { increment: delta } },
      });
      await tx.budget.updateMany({
        where: { costCenterId, year, month: null },
        data: { actualAmount: { increment: delta } },
      });
    }
  }

  private async ensureDefaultAccounts() {
    const defaults = [
      { code: '105.01', name: 'Clientes nacionales', type: 'ASSET' as const },
      { code: '102.01', name: 'Bancos', type: 'ASSET' as const },
      { code: '401.01', name: 'Ingresos por servicios', type: 'REVENUE' as const },
      { code: '208.01', name: 'IVA trasladado cobrado', type: 'LIABILITY' as const },
      { code: '601.01', name: 'Gastos de administración', type: 'EXPENSE' as const },
      { code: '601.02', name: 'Viáticos y gastos de viaje', type: 'EXPENSE' as const },
      { code: '602.01', name: 'Sueldos y salarios', type: 'EXPENSE' as const },
      { code: '115.01', name: 'Inventario de mercancías', type: 'ASSET' as const },
      { code: '201.01', name: 'Proveedores nacionales', type: 'LIABILITY' as const },
      { code: '209.01', name: 'IVA acreditable pagado', type: 'ASSET' as const },
    ];

    for (const account of defaults) {
      await this.prisma.account.upsert({
        where: { code: account.code },
        create: {
          code: account.code,
          name: account.name,
          type: account.type,
        },
        update: {},
      });
    }
  }

  private async getAccountByCode(code: string) {
    await this.ensureDefaultAccounts();
    const account = await this.prisma.account.findUnique({ where: { code } });
    if (!account) {
      throw new BadRequestException(`Cuenta contable ${code} no configurada`);
    }
    return account;
  }

  private async createAndPostAutoJournal(
    reference: string,
    description: string,
    date: string,
    lines: Array<{ debitAccountId: number; creditAccountId: number; debit: number; credit: number; label: string }>,
    userId: number,
  ) {
    const existing = await this.prisma.journalEntry.findFirst({ where: { reference } });
    if (existing) return existing;

    try {
      const entry = await this.createJournalEntry(
        {
          date,
          description,
          reference,
          lines: lines.map((line) => ({
            debitAccountId: line.debitAccountId,
            creditAccountId: line.creditAccountId,
            description: line.label,
            debit: line.debit,
            credit: line.credit,
          })),
        },
        userId,
      );

      return this.postJournalEntry(entry.id, userId);
    } catch (err) {
      // Carrera: otro request creó el mismo reference (unique)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.prisma.journalEntry.findFirst({ where: { reference } });
        if (raced) return raced;
      }
      throw err;
    }
  }

  /**
   * Póliza automática de egreso operativo (gasto / viático / pago a empleado).
   * Debe gasto  ·  Haber bancos.
   */
  async postOperationalDisbursement(input: {
    kind: 'expense' | 'viatic' | 'payroll';
    entityId: number;
    amount: number;
    date?: Date | string | null;
    description: string;
    userId: number;
  }) {
    const amount = Number(input.amount);
    if (!amount || amount <= 0) {
      throw new BadRequestException('Monto inválido para póliza operativa');
    }

    const expenseAccountCode =
      input.kind === 'viatic' ? '601.02' : input.kind === 'payroll' ? '602.01' : '601.01';
    const prefix =
      input.kind === 'viatic' ? 'VIAT-PAY' : input.kind === 'payroll' ? 'PAYR-PAY' : 'EXP-PAY';
    const reference = `${prefix}-${input.entityId}`;

    const [expenseAccount, bank] = await Promise.all([
      this.getAccountByCode(expenseAccountCode),
      this.getAccountByCode('102.01'),
    ]);

    const rawDate = input.date ? new Date(input.date) : new Date();
    const date = Number.isNaN(rawDate.getTime())
      ? new Date().toISOString().slice(0, 10)
      : rawDate.toISOString().slice(0, 10);

    const entry = await this.createAndPostAutoJournal(
      reference,
      input.description,
      date,
      [
        {
          debitAccountId: expenseAccount.id,
          creditAccountId: bank.id,
          debit: amount,
          credit: 0,
          label: `Gasto ${input.kind} #${input.entityId}`,
        },
        {
          debitAccountId: bank.id,
          creditAccountId: expenseAccount.id,
          debit: 0,
          credit: amount,
          label: 'Salida de bancos',
        },
      ],
      input.userId,
    );

    return entry;
  }

  /**
   * Póliza de recepción de compra (inventario perpetuo).
   * Productos → Debe inventario; servicios → Debe gasto; IVA → 209.01; Haber proveedores.
   */
  async postPurchaseReceiptAccrual(input: {
    goodsReceiptId: number;
    userId: number;
  }) {
    const reference = `GR-ACCRUAL-${input.goodsReceiptId}`;
    const existing = await this.prisma.journalEntry.findFirst({ where: { reference } });
    if (existing) return existing;

    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id: input.goodsReceiptId },
      include: {
        items: {
          include: {
            purchaseOrderItem: {
              include: { product: { select: { id: true, itemType: true, name: true } } },
            },
          },
        },
        purchaseOrder: { select: { poNumber: true, supplierId: true } },
      },
    });
    if (!receipt) throw new BadRequestException('Recepción no encontrada');

    let inventoryBase = 0;
    let expenseBase = 0;
    let taxAmount = 0;

    for (const item of receipt.items) {
      const qty = Number(item.quantityReceived) || 0;
      if (qty <= 0) continue;
      const poItem = item.purchaseOrderItem;
      const unitPrice = Number(poItem.unitPrice) || 0;
      const taxRate = Number(poItem.taxRate) || 0;
      const base = qty * unitPrice;
      const tax = base * (taxRate / 100);
      taxAmount += tax;
      const itemType = poItem.product?.itemType || (poItem.productId ? 'PRODUCT' : 'SERVICE');
      if (itemType === 'PRODUCT') inventoryBase += base;
      else expenseBase += base;
    }

    const total = inventoryBase + expenseBase + taxAmount;
    if (total <= 0) {
      throw new BadRequestException('La recepción no tiene monto contable');
    }

    const [inventory, expense, taxAccount, payable] = await Promise.all([
      this.getAccountByCode('115.01'),
      this.getAccountByCode('601.01'),
      this.getAccountByCode('209.01'),
      this.getAccountByCode('201.01'),
    ]);

    const date = new Date(receipt.receiptDate).toISOString().slice(0, 10);
    const lines: Array<{
      debitAccountId: number;
      creditAccountId: number;
      debit: number;
      credit: number;
      label: string;
    }> = [];

    if (inventoryBase > 0) {
      lines.push({
        debitAccountId: inventory.id,
        creditAccountId: payable.id,
        debit: inventoryBase,
        credit: 0,
        label: 'Entrada de inventario',
      });
    }
    if (expenseBase > 0) {
      lines.push({
        debitAccountId: expense.id,
        creditAccountId: payable.id,
        debit: expenseBase,
        credit: 0,
        label: 'Servicios / gastos de compra',
      });
    }
    if (taxAmount > 0) {
      lines.push({
        debitAccountId: taxAccount.id,
        creditAccountId: payable.id,
        debit: taxAmount,
        credit: 0,
        label: 'IVA acreditable',
      });
    }
    lines.push({
      debitAccountId: payable.id,
      creditAccountId: inventoryBase > 0 ? inventory.id : expense.id,
      debit: 0,
      credit: total,
      label: `CXP recepción ${receipt.receiptNumber}`,
    });

    const entry = await this.createAndPostAutoJournal(
      reference,
      `Recepción ${receipt.receiptNumber} / OC ${receipt.purchaseOrder.poNumber}`,
      date,
      lines,
      input.userId,
    );

    await this.prisma.goodsReceipt.update({
      where: { id: input.goodsReceiptId },
      data: { journalEntryId: entry.id },
    });

    return entry;
  }

  /**
   * Factura AP en borrador a partir de una recepción (NEXARA compras).
   */
  async createInvoiceFromGoodsReceipt(goodsReceiptId: number, userId: number) {
    const existing = await this.prisma.invoice.findFirst({
      where: { goodsReceiptId, deletedAt: null },
    });
    if (existing) return existing;

    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id: goodsReceiptId },
      include: {
        items: {
          include: {
            purchaseOrderItem: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    satProductKey: true,
                    satUnitKey: true,
                    unitName: true,
                  },
                },
              },
            },
          },
        },
        purchaseOrder: {
          include: { supplier: true },
        },
      },
    });
    if (!receipt) throw new BadRequestException('Recepción no encontrada');

    const items = receipt.items
      .filter((i) => Number(i.quantityReceived) > 0)
      .map((i) => {
        const poItem = i.purchaseOrderItem;
        const qty = Number(i.quantityReceived);
        const unitPrice = Number(poItem.unitPrice);
        const taxRate = Number(poItem.taxRate) || 16;
        return {
          description: poItem.description || poItem.product?.name || 'Partida compra',
          quantity: qty,
          unitPrice,
          taxRate,
          ivaRate: taxRate,
          productId: poItem.productId ?? undefined,
          satProductKey: poItem.product?.satProductKey || undefined,
          satUnitKey: poItem.product?.satUnitKey || undefined,
          unitName: poItem.product?.unitName || undefined,
        };
      });

    if (!items.length) {
      throw new BadRequestException('La recepción no tiene partidas facturables');
    }

    const issueDate = new Date(receipt.receiptDate).toISOString().slice(0, 10);
    const due = new Date(receipt.receiptDate);
    due.setDate(due.getDate() + 30);

    const invoice = await this.createInvoice(
      {
        type: 'ACCOUNTS_PAYABLE',
        issueDate,
        dueDate: due.toISOString().slice(0, 10),
        supplierId: receipt.purchaseOrder.supplierId,
        currency: receipt.purchaseOrder.currency || 'MXN',
        notes: `Desde ${receipt.receiptNumber} / OC ${receipt.purchaseOrder.poNumber}`,
        receptorName: receipt.purchaseOrder.supplier?.name || undefined,
        items,
      },
      userId,
    );

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        purchaseOrderId: receipt.purchaseOrderId,
        goodsReceiptId: receipt.id,
      },
      include: { items: true, supplier: true },
    });
  }

  private async autoJournalForStampedInvoice(
    invoice: {
      id: number;
      invoiceNumber: string;
      type: string;
      subtotal: Prisma.Decimal | number;
      taxAmount: Prisma.Decimal | number;
      totalAmount: Prisma.Decimal | number;
      issueDate: Date;
    },
    userId: number,
  ) {
    if (invoice.type !== 'ACCOUNTS_RECEIVABLE') return null;

    const total = Number(invoice.totalAmount);
    const subtotal = Number(invoice.subtotal);
    const tax = Number(invoice.taxAmount);
    if (total <= 0) return null;

    const [cxc, revenue, iva] = await Promise.all([
      this.getAccountByCode('105.01'),
      this.getAccountByCode('401.01'),
      this.getAccountByCode('208.01'),
    ]);

    const date = new Date(invoice.issueDate).toISOString().slice(0, 10);
    const ref = `INV-STAMP-${invoice.id}`;

    return this.createAndPostAutoJournal(
      ref,
      `Factura timbrada ${invoice.invoiceNumber}`,
      date,
      [
        { debitAccountId: cxc.id, creditAccountId: revenue.id, debit: total, credit: 0, label: 'CXC clientes' },
        { debitAccountId: revenue.id, creditAccountId: cxc.id, debit: 0, credit: subtotal, label: 'Ingresos' },
        { debitAccountId: iva.id, creditAccountId: cxc.id, debit: 0, credit: tax, label: 'IVA trasladado' },
      ],
      userId,
    );
  }

  private async autoJournalForPayment(
    payment: { id: number; amount: Prisma.Decimal | number; paymentDate: Date },
    invoice: { id: number; invoiceNumber: string; type: string },
    userId: number,
  ) {
    if (invoice.type !== 'ACCOUNTS_RECEIVABLE') return null;

    const amount = Number(payment.amount);
    if (amount <= 0) return null;

    const [bank, cxc] = await Promise.all([
      this.getAccountByCode('102.01'),
      this.getAccountByCode('105.01'),
    ]);

    const date = new Date(payment.paymentDate).toISOString().slice(0, 10);
    const ref = `PAY-${payment.id}`;

    return this.createAndPostAutoJournal(
      ref,
      `Cobro factura ${invoice.invoiceNumber}`,
      date,
      [
        { debitAccountId: bank.id, creditAccountId: cxc.id, debit: amount, credit: 0, label: 'Entrada bancaria' },
        { debitAccountId: cxc.id, creditAccountId: bank.id, debit: 0, credit: amount, label: 'Aplicación CXC' },
      ],
      userId,
    );
  }

  async reverseJournalEntry(id: number, userId: number) {
    const original = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
    if (!original) throw new NotFoundException('Asiento no encontrado');
    if (original.status !== 'POSTED') throw new BadRequestException('Solo se pueden revertir asientos contabilizados');

    const entryNumber = await this.generateEntryNumber();

    // Transacción: (1) reclama el original atómicamente (evita reversas
    // duplicadas por doble clic / reintento concurrente), (2) crea la
    // contrapóliza, (3) aplica el ajuste de saldo por cuenta — el paso que
    // faltaba antes: la reversa se creaba ya POSTED pero nunca tocaba
    // Account.balance, así que el saldo mostrado en Catálogo de Cuentas
    // quedaba permanentemente desfasado del original que sí se revirtió.
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.journalEntry.updateMany({
        where: { id, status: 'POSTED' },
        data: { status: 'REVERSED' },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Este asiento ya fue revertido o no está contabilizado');
      }

      const reversal = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: new Date(),
          description: `Reversa de ${original.entryNumber}: ${original.description}`,
          status: 'POSTED',
          reversalOfId: original.id,
          totalDebit: original.totalCredit,
          totalCredit: original.totalDebit,
          createdById: userId,
          postedAt: new Date(),
          lines: {
            create: original.lines.map((line) => ({
              debitAccountId: line.debitAccountId,
              creditAccountId: line.creditAccountId,
              description: `Reversa: ${line.description || ''}`,
              debit: line.credit,
              credit: line.debit,
              costCenterId: line.costCenterId,
            })),
          },
        },
        include: { lines: true },
      });

      await this.applyLineBalances(tx, reversal.lines, 1);
      await this.refreshBudgetActuals(tx, reversal.lines, reversal.date, 1);

      return reversal;
    });
  }

  // ── Trial Balance / Reports ───────────────────────────────────────
  async getTrialBalance(periodId?: number) {
    const where: any = { status: 'POSTED' };
    if (periodId) where.fiscalPeriodId = periodId;
    const entries = await this.prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
    });

    const balanceMap = new Map<number, { code: string; name: string; type: string; debit: number; credit: number }>();
    for (const entry of entries) {
      for (const line of entry.lines) {
        const acc = line.debitAccount;
        if (!balanceMap.has(acc.id)) {
          balanceMap.set(acc.id, { code: acc.code, name: acc.name, type: acc.type, debit: 0, credit: 0 });
        }
        const b = balanceMap.get(acc.id)!;
        b.debit += Number(line.debit);
        b.credit += Number(line.credit);
      }
    }

    return Array.from(balanceMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  }

  // ── Income Statement (Estado de Resultados) ──────────────────────
  async getIncomeStatement(from?: string, to?: string) {
    const where: any = { status: 'POSTED' };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    const entries = await this.prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
    });

    let totalRevenue = 0;
    let totalExpenses = 0;
    const revenueAccounts: { code: string; name: string; amount: number }[] = [];
    const expenseAccounts: { code: string; name: string; amount: number }[] = [];
    const accountTotals = new Map<number, { code: string; name: string; type: string; total: number }>();

    for (const entry of entries) {
      for (const line of entry.lines) {
        const acc = line.debitAccount;
        if (!accountTotals.has(acc.id)) {
          accountTotals.set(acc.id, { code: acc.code, name: acc.name, type: acc.type, total: 0 });
        }
        const a = accountTotals.get(acc.id)!;
        a.total += Number(line.credit) - Number(line.debit);
      }
    }

    for (const a of accountTotals.values()) {
      if (a.type === 'REVENUE' || a.type === 'INCOME') {
        totalRevenue += a.total;
        revenueAccounts.push({ code: a.code, name: a.name, amount: a.total });
      } else if (a.type === 'EXPENSE') {
        totalExpenses += Math.abs(a.total);
        expenseAccounts.push({ code: a.code, name: a.name, amount: Math.abs(a.total) });
      }
    }

    return {
      revenue: revenueAccounts.sort((a, b) => a.code.localeCompare(b.code)),
      expenses: expenseAccounts.sort((a, b) => a.code.localeCompare(b.code)),
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    };
  }

  // ── Balance Sheet (Balance General) ──────────────────────────────
  async getBalanceSheet(asOf?: string) {
    const where: any = { status: 'POSTED' };
    if (asOf) where.date = { lte: new Date(asOf) };

    const entries = await this.prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
    });

    const accountTotals = new Map<number, { code: string; name: string; type: string; balance: number }>();
    for (const entry of entries) {
      for (const line of entry.lines) {
        const acc = line.debitAccount;
        if (!accountTotals.has(acc.id)) {
          accountTotals.set(acc.id, { code: acc.code, name: acc.name, type: acc.type, balance: 0 });
        }
        const a = accountTotals.get(acc.id)!;
        a.balance += Number(line.debit) - Number(line.credit);
      }
    }

    const assets: { code: string; name: string; balance: number }[] = [];
    const liabilities: { code: string; name: string; balance: number }[] = [];
    const equity: { code: string; name: string; balance: number }[] = [];
    let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;

    for (const a of accountTotals.values()) {
      if (a.type === 'ASSET') {
        assets.push({ code: a.code, name: a.name, balance: a.balance });
        totalAssets += a.balance;
      } else if (a.type === 'LIABILITY') {
        liabilities.push({ code: a.code, name: a.name, balance: Math.abs(a.balance) });
        totalLiabilities += Math.abs(a.balance);
      } else if (a.type === 'EQUITY') {
        equity.push({ code: a.code, name: a.name, balance: Math.abs(a.balance) });
        totalEquity += Math.abs(a.balance);
      }
    }

    return {
      assets: assets.sort((a, b) => a.code.localeCompare(b.code)),
      liabilities: liabilities.sort((a, b) => a.code.localeCompare(b.code)),
      equity: equity.sort((a, b) => a.code.localeCompare(b.code)),
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanceCheck: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01,
    };
  }

  // ── Invoicing (AR / AP) ───────────────────────────────────────────
  private async generateInvoiceNumber(): Promise<string> {
    const count = await this.prisma.invoice.count();
    return `INV-${String(count + 1).padStart(6, '0')}`;
  }

  async createInvoice(dto: {
    type: string;
    issueDate: string;
    dueDate: string;
    clientId?: number;
    supplierId?: number;
    currency?: string;
    notes?: string;
    // CFDI 4.0
    cfdiUsage?: string;
    satPaymentForm?: string;
    satPaymentMethod?: string;
    emisorRfc?: string;
    emisorName?: string;
    emisorRegime?: string;
    receptorRfc?: string;
    receptorName?: string;
    receptorRegime?: string;
    receptorZipCode?: string;
    exchangeRate?: number;
    cfdiSerie?: string;
    cfdiRelationType?: string;
    cfdiRelatedUuids?: string[];
    companyId?: number | null;
    items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate?: number;
      productId?: number;
      satProductKey?: string;
      satUnitKey?: string;
      unitName?: string;
      discount?: number;
      ivaRate?: number;
      iepsRate?: number;
      isrRetRate?: number;
      ivaRetRate?: number;
    }>;
  }, userId: number) {
    const invoiceNumber = await this.generateInvoiceNumber();
    const companyId = await this.resolveCompanyId(dto.companyId);
    const issuer = await this.getInvoiceIssuerProfile(companyId ?? undefined);
    const emisorRfc = dto.emisorRfc?.trim() || issuer.emisorRfc || null;
    const emisorName = dto.emisorName?.trim() || issuer.emisorName || null;
    const emisorRegime = dto.emisorRegime?.trim() || issuer.emisorRegime || null;
    const items = dto.items.map((item) => {
      const base = item.quantity * item.unitPrice - (item.discount || 0);
      const iva = base * ((item.ivaRate ?? item.taxRate ?? 16) / 100);
      const ieps = base * ((item.iepsRate || 0) / 100);
      const isrRet = base * ((item.isrRetRate || 0) / 100);
      const ivaRet = base * ((item.ivaRetRate || 0) / 100);
      const total = base + iva + ieps - isrRet - ivaRet;
      return { ...item, base, iva, ieps, isrRet, ivaRet, total };
    });
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const totalDiscount = items.reduce((s, i) => s + (i.discount || 0), 0);
    const taxAmount = items.reduce((s, i) => s + i.iva + i.ieps, 0);
    const retentions = items.reduce((s, i) => s + i.isrRet + i.ivaRet, 0);
    const totalAmount = subtotal - totalDiscount + taxAmount - retentions;

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        type: dto.type as any,
        issueDate: new Date(dto.issueDate),
        dueDate: new Date(dto.dueDate),
        clientId: dto.clientId ?? null,
        supplierId: dto.supplierId ?? null,
        subtotal: new Prisma.Decimal(subtotal),
        taxAmount: new Prisma.Decimal(taxAmount),
        totalAmount: new Prisma.Decimal(totalAmount),
        currency: dto.currency || 'MXN',
        notes: dto.notes?.trim() || null,
        createdById: userId,
        companyId,
        // CFDI 4.0
        cfdiUsage: this.normalizeCfdiUsage(dto.cfdiUsage || 'G03') as any,
        satPaymentForm: this.normalizeSatPaymentForm(dto.satPaymentForm || '03') as any,
        satPaymentMethod: this.normalizeSatPaymentMethod(dto.satPaymentMethod || 'PUE') as any,
        emisorRfc: emisorRfc,
        emisorName: emisorName,
        emisorRegime: this.normalizeFiscalRegime(emisorRegime ?? undefined) as any,
        receptorRfc: dto.receptorRfc?.trim() || null,
        receptorName: dto.receptorName?.trim() || null,
        receptorRegime: this.normalizeFiscalRegime(dto.receptorRegime) as any,
        receptorZipCode: dto.receptorZipCode?.trim() || null,
        exchangeRate: dto.exchangeRate ? new Prisma.Decimal(dto.exchangeRate) : null,
        cfdiSerie: dto.cfdiSerie?.trim() || null,
        cfdiRelationType: dto.cfdiRelationType?.trim() || null,
        cfdiRelatedUuids: (dto.cfdiRelatedUuids || []).join(',') || null,
        items: {
          create: items.map((i) => ({
            description: i.description.trim(),
            quantity: new Prisma.Decimal(i.quantity),
            unitPrice: new Prisma.Decimal(i.unitPrice),
            taxRate: new Prisma.Decimal(i.ivaRate ?? i.taxRate ?? 16),
            total: new Prisma.Decimal(i.total),
            productId: i.productId ?? null,
            satProductKey: i.satProductKey?.trim() || '80101500',
            satUnitKey: i.satUnitKey?.trim() || 'E48',
            unitName: i.unitName?.trim() || 'Servicio',
            discount: i.discount ? new Prisma.Decimal(i.discount) : undefined,
            taxBase: new Prisma.Decimal(i.base),
            ivaRate: new Prisma.Decimal(i.ivaRate ?? i.taxRate ?? 16),
            ivaAmount: new Prisma.Decimal(i.iva),
            iepsRate: i.iepsRate ? new Prisma.Decimal(i.iepsRate) : null,
            iepsAmount: i.ieps ? new Prisma.Decimal(i.ieps) : null,
            isrRetRate: i.isrRetRate ? new Prisma.Decimal(i.isrRetRate) : null,
            isrRetAmount: i.isrRet ? new Prisma.Decimal(i.isrRet) : null,
            ivaRetRate: i.ivaRetRate ? new Prisma.Decimal(i.ivaRetRate) : null,
            ivaRetAmount: i.ivaRet ? new Prisma.Decimal(i.ivaRet) : null,
          })),
        },
      },
      include: { items: true, client: true, supplier: true },
    });
    const totalHint = `${invoice.currency} ${Number(invoice.totalAmount).toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    void this.notificationHierarchy
      .notifyInvoiceCreated(userId, invoice.id, invoice.invoiceNumber, totalHint)
      .catch(() => undefined);
    return invoice;
  }

  async createInvoiceFromSalesProject(
    projectId: number,
    userId: number,
    options?: { lineIds?: number[] },
  ) {
    const order = await this.prisma.salesProjectOrder.findUnique({
      where: { projectId },
      include: {
        lines: {
          orderBy: { sortOrder: 'asc' },
          include: { product: true, invoiceItem: { select: { id: true, invoiceId: true } } },
        },
        invoices: { select: { id: true, invoiceNumber: true, status: true, totalAmount: true } },
        project: { include: { opportunity: { include: { client: true } } } },
      },
    });

    if (!order) {
      throw new NotFoundException('No hay orden de venta para este proyecto');
    }
    if (!order.lines.length) {
      throw new BadRequestException('La orden no tiene líneas para facturar');
    }

    const client = order.project?.opportunity?.client;
    if (!client?.id) {
      throw new BadRequestException('Cliente comercial no encontrado para facturar');
    }

    const uninvoicedLines = order.lines.filter((line) => !line.invoiceItem);
    const selectedLines = options?.lineIds?.length
      ? uninvoicedLines.filter((line) => options.lineIds!.includes(line.id))
      : uninvoicedLines;

    if (!selectedLines.length) {
      throw new BadRequestException('No hay líneas pendientes de facturar (todas ya fueron facturadas)');
    }

    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const receptorZip =
      client.fiscalZipCode?.trim() ||
      this.extractMexicanZip(client.fiscalAddress) ||
      undefined;
    const receptorRegime = client.fiscalRegime?.trim() || '601';

    const invoice = await this.createInvoice(
      {
        type: 'ACCOUNTS_RECEIVABLE',
        issueDate: today,
        dueDate: due,
        clientId: client.id,
        notes: `Factura generada desde orden ${order.orderId} — ${order.project.name}${selectedLines.length < uninvoicedLines.length ? ' (parcial)' : ''}`,
        receptorRfc: client.taxId ?? undefined,
        receptorName: client.legalName || client.name,
        receptorZipCode: receptorZip,
        receptorRegime,
        cfdiUsage: 'G03',
        satPaymentForm: '03',
        satPaymentMethod: 'PUE',
        items: selectedLines.map((line) => {
          const qty = Number(line.qty);
          const unitPrice = Number(line.unitPrice);
          const lineSubtotal = qty * unitPrice;
          const sat = this.resolveSatKeysForOrderLine(line);
          return {
            description: line.name,
            quantity: qty,
            unitPrice,
            taxRate: Number(line.tax),
            ivaRate: Number(line.tax) || 16,
            productId: line.productId ?? undefined,
            unitName: sat.unitName,
            satProductKey: sat.satProductKey,
            satUnitKey: sat.satUnitKey,
            discount: lineSubtotal * (Number(line.discount) / 100),
          };
        }),
      },
      userId,
    );

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { salesProjectOrderId: order.id },
    });

    const createdItems = await this.prisma.invoiceItem.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { id: 'asc' },
    });
    for (let i = 0; i < createdItems.length && i < selectedLines.length; i += 1) {
      await this.prisma.invoiceItem.update({
        where: { id: createdItems[i].id },
        data: { salesOrderLineId: selectedLines[i].id },
      });
    }

    return this.getInvoice(invoice.id);
  }

  /**
   * Timbra una factura borrador llamando al PAC configurado (Facturama / SW / Finkok / Mock).
   * Pasa a SENT y persiste UUID + XML + sello + número de certificado SAT.
   */
  async stampInvoice(id: number, userId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });
    if (!invoice || invoice.deletedAt) throw new NotFoundException('Factura no encontrada');
    if (invoice.isCancelled) throw new BadRequestException('La factura está cancelada');
    if (invoice.cfdiUuid) throw new BadRequestException('La factura ya está timbrada');
    if (invoice.status === 'STAMPING') {
      throw new BadRequestException('Timbrado en curso; espera un momento e intenta de nuevo');
    }
    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Solo facturas en borrador pueden timbrarse');
    }
    // Validaciones CFDI 4.0 (SAT). Detectarlas aquí evita errores oscuros del PAC.
    const cfdiErrors: string[] = [];
    if (!invoice.receptorRfc) cfdiErrors.push('RFC del receptor');
    if (!invoice.receptorZipCode) cfdiErrors.push('CP fiscal del receptor (CFDI 4.0)');
    if (!invoice.receptorRegime) cfdiErrors.push('régimen fiscal del receptor (CFDI 4.0)');
    if (!invoice.emisorRfc) cfdiErrors.push('RFC del emisor');
    if (!invoice.emisorRegime) cfdiErrors.push('régimen fiscal del emisor');
    if (!invoice.cfdiUsage) cfdiErrors.push('uso de CFDI');
    if (!invoice.items?.length) cfdiErrors.push('al menos un concepto');
    const itemsWithoutSatKey = invoice.items?.filter(
      (it) => !it.satProductKey || !it.satUnitKey,
    ) || [];
    if (itemsWithoutSatKey.length > 0) {
      cfdiErrors.push(`claves SAT (ClaveProdServ + ClaveUnidad) en ${itemsWithoutSatKey.length} concepto(s)`);
    }
    if (cfdiErrors.length > 0) {
      throw new BadRequestException(
        `Faltan datos para timbrar CFDI 4.0: ${cfdiErrors.join(', ')}.`,
      );
    }

    const emisorRfc = invoice.emisorRfc as string;
    const receptorRfc = invoice.receptorRfc as string;
    const issuerProfile = await this.getInvoiceIssuerProfile();
    if (!issuerProfile.emisorZipCode) {
      cfdiErrors.push('CP fiscal del emisor (LugarExpedicion — configurar en perfil de empresa o ajustes fiscales)');
    }

    // Claim atómico DRAFT → STAMPING para evitar doble timbrado concurrente.
    const claim = await this.prisma.invoice.updateMany({
      where: { id, status: 'DRAFT', cfdiUuid: null, isCancelled: false },
      data: { status: 'STAMPING' },
    });
    if (claim.count === 0) {
      const current = await this.prisma.invoice.findUnique({ where: { id } });
      if (current?.cfdiUuid) throw new BadRequestException('La factura ya está timbrada');
      throw new BadRequestException('No se pudo iniciar el timbrado (conflicto concurrente)');
    }

    let stamp: Awaited<ReturnType<PacService['stamp']>>;
    try {
      stamp = await this.pacService.stamp({
        invoiceNumber: invoice.invoiceNumber,
        serie: invoice.cfdiSerie,
        folio: invoice.cfdiFolio,
        total: Number(invoice.totalAmount),
        subtotal: Number(invoice.subtotal),
        taxTotal: Number(invoice.taxAmount),
        currency: invoice.currency || 'MXN',
        exchangeRate: invoice.exchangeRate ? Number(invoice.exchangeRate) : null,
        paymentForm: invoice.satPaymentForm || 'FP99',
        paymentMethod: invoice.satPaymentMethod || 'PUE',
        cfdiUsage: invoice.cfdiUsage || 'G03',
        tipoComprobante: invoice.cfdiRelatedUuids && invoice.cfdiRelationType === '01' ? 'E' : 'I',
        relatedUuids: invoice.cfdiRelatedUuids?.split(',').map((u) => u.trim()).filter(Boolean),
        relationType: invoice.cfdiRelationType || undefined,
        emisor: {
          rfc: emisorRfc,
          name: invoice.emisorName || 'Emisor',
          regime: invoice.emisorRegime || 'R601',
          zipCode: issuerProfile.emisorZipCode,
        },
        receptor: {
          rfc: receptorRfc,
          name: invoice.receptorName || 'Receptor',
          zipCode: invoice.receptorZipCode,
          regime: invoice.receptorRegime,
        },
        items: invoice.items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount),
          taxRate: Number(item.taxRate),
          satProductKey: item.satProductKey,
          satUnitKey: item.satUnitKey,
          unitName: item.unitName,
          ivaRetAmount: item.ivaRetAmount ? Number(item.ivaRetAmount) : undefined,
          isrRetAmount: item.isrRetAmount ? Number(item.isrRetAmount) : undefined,
          iepsAmount: item.iepsAmount ? Number(item.iepsAmount) : undefined,
          iepsRate: item.iepsRate ? Number(item.iepsRate) : undefined,
        })),
      });
    } catch (err) {
      await this.prisma.invoice.updateMany({
        where: { id, status: 'STAMPING', cfdiUuid: null },
        data: { status: 'DRAFT' },
      });
      throw err;
    }

    const persist = await this.prisma.invoice.updateMany({
      where: { id, status: 'STAMPING', cfdiUuid: null },
      data: {
        cfdiUuid: stamp.uuid,
        cfdiStampDate: stamp.stampedAt,
        satCertNumber: stamp.satCertNumber,
        status: 'SENT',
        cfdiSerie: invoice.cfdiSerie || 'A',
        cfdiFolio:
          invoice.cfdiFolio ||
          invoice.invoiceNumber.replace(/[^0-9]/g, '').slice(0, 12) ||
          String(invoice.id),
        cfdiXml: stamp.xml || invoice.cfdiXml,
        pdfUrl: stamp.pdfUrl || invoice.pdfUrl,
        createdById: invoice.createdById ?? userId,
      },
    });
    if (persist.count === 0) {
      const existing = await this.prisma.invoice.findUnique({
        where: { id },
        include: { items: { include: { product: true } }, client: true, supplier: true, payments: true },
      });
      if (existing?.cfdiUuid) return { ...existing, pacProvider: stamp.provider };
      throw new BadRequestException('No se pudo persistir el timbrado');
    }

    const updated = await this.prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { product: true } }, client: true, supplier: true, payments: true },
    });

    void this.autoJournalForStampedInvoice(updated, userId).catch(() => undefined);

    return { ...updated, pacProvider: stamp.provider };
  }

  async listInvoices(filters?: { type?: string; status?: string; from?: string; to?: string }, query?: PaginationQueryDto) {
    const where: any = { deletedAt: null };
    if (filters?.type) where.type = filters.type;
    if (filters?.status) where.status = filters.status;
    if (filters?.from || filters?.to) {
      where.issueDate = {};
      if (filters.from) where.issueDate.gte = new Date(filters.from);
      if (filters.to) where.issueDate.lte = new Date(filters.to);
    }
    const include = { items: true, client: true, supplier: true, payments: true };
    const pageQuery = query ?? Object.assign(new PaginationQueryDto(), { page: 1, limit: 50 });
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include,
        orderBy: { issueDate: 'desc' },
        skip: pageQuery.skip,
        take: pageQuery.take,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, pageQuery);
  }

  async getInvoice(id: number) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: { items: { include: { product: true } }, client: true, supplier: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return invoice;
  }

  async updateInvoiceDraft(
    id: number,
    dto: {
      issueDate?: string;
      dueDate?: string;
      receptorRfc?: string;
      receptorName?: string;
      receptorRegime?: string;
      receptorZipCode?: string;
      cfdiUsage?: string;
      notes?: string;
      items?: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        taxRate?: number;
        satProductKey?: string;
        satUnitKey?: string;
        unitName?: string;
      }>;
    },
  ) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, deletedAt: null } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.status !== 'DRAFT' || invoice.cfdiUuid) {
      throw new BadRequestException('Solo borradores sin timbrar pueden editarse');
    }

    if (dto.items?.length) {
      const items = dto.items.map((item) => {
        const base = item.quantity * item.unitPrice;
        const iva = base * ((item.taxRate ?? 16) / 100);
        const total = base + iva;
        return { ...item, base, iva, total };
      });
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const taxAmount = items.reduce((s, i) => s + i.iva, 0);
      const totalAmount = subtotal + taxAmount;

      await this.prisma.$transaction(async (tx) => {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoice.update({
          where: { id },
          data: {
            issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            receptorRfc: dto.receptorRfc?.trim() ?? undefined,
            receptorName: dto.receptorName?.trim() ?? undefined,
            receptorRegime: dto.receptorRegime ? (this.normalizeFiscalRegime(dto.receptorRegime) as any) : undefined,
            receptorZipCode: dto.receptorZipCode?.trim() ?? undefined,
            cfdiUsage: dto.cfdiUsage ? (this.normalizeCfdiUsage(dto.cfdiUsage) as any) : undefined,
            notes: dto.notes !== undefined ? (dto.notes?.trim() || null) : undefined,
            subtotal: new Prisma.Decimal(subtotal),
            taxAmount: new Prisma.Decimal(taxAmount),
            totalAmount: new Prisma.Decimal(totalAmount),
            items: {
              create: items.map((i) => ({
                description: i.description.trim(),
                quantity: new Prisma.Decimal(i.quantity),
                unitPrice: new Prisma.Decimal(i.unitPrice),
                taxRate: new Prisma.Decimal(i.taxRate ?? 16),
                total: new Prisma.Decimal(i.total),
                satProductKey: i.satProductKey?.trim() || null,
                satUnitKey: i.satUnitKey?.trim() || null,
                unitName: i.unitName?.trim() || 'Servicio',
              })),
            },
          },
        });
      });
    } else {
      await this.prisma.invoice.update({
        where: { id },
        data: {
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          receptorRfc: dto.receptorRfc?.trim() ?? undefined,
          receptorName: dto.receptorName?.trim() ?? undefined,
          receptorRegime: dto.receptorRegime ? (this.normalizeFiscalRegime(dto.receptorRegime) as any) : undefined,
          receptorZipCode: dto.receptorZipCode?.trim() ?? undefined,
          cfdiUsage: dto.cfdiUsage ? (this.normalizeCfdiUsage(dto.cfdiUsage) as any) : undefined,
          notes: dto.notes !== undefined ? (dto.notes?.trim() || null) : undefined,
        },
      });
    }

    return this.getInvoice(id);
  }

  async getInvoiceIssuerProfile(companyId?: number) {
    const settings = await this.prisma.systemSetting.findMany({
      where: { category: { in: ['empresa', 'fiscal'] } },
      select: { key: true, value: true, label: true },
    });

    const emisorRfc = this.pickSettingValue(settings, ['rfc', 'fiscalrfc', 'empresarfc']);
    const emisorName = this.pickSettingValue(settings, ['razonsocial', 'nombreempresa', 'empresa', 'socialname']);
    const emisorRegime = this.pickSettingValue(settings, ['regimenfiscal', 'regimen']);
    const emisorZipCode = this.pickSettingValue(settings, ['codigopostal', 'cp', 'zip']);

    if (emisorRfc || emisorName || emisorRegime || emisorZipCode) {
      return {
        emisorRfc: emisorRfc || null,
        emisorName: emisorName || null,
        emisorRegime: emisorRegime || null,
        emisorZipCode: emisorZipCode || null,
        source: 'settings',
      };
    }

    const company = companyId
      ? await this.prisma.companyProfile.findFirst({
          where: { id: companyId, isActive: true },
          select: { rfc: true, legalName: true, fiscalRegime: true, fiscalPostalCode: true },
        })
      : await this.prisma.companyProfile.findFirst({
          where: { isPrimary: true, isActive: true },
          select: { rfc: true, legalName: true, fiscalRegime: true, fiscalPostalCode: true },
        });
    if (company) {
      return {
        emisorRfc: company.rfc || null,
        emisorName: company.legalName || null,
        emisorRegime: company.fiscalRegime || null,
        emisorZipCode: company.fiscalPostalCode || null,
        source: 'company_profile',
      };
    }

    const latestInvoiceWithIssuer = await this.prisma.invoice.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { emisorRfc: { not: null } },
          { emisorName: { not: null } },
          { emisorRegime: { not: null } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        emisorRfc: true,
        emisorName: true,
        emisorRegime: true,
      },
    });

    return {
      emisorRfc: latestInvoiceWithIssuer?.emisorRfc || null,
      emisorName: latestInvoiceWithIssuer?.emisorName || null,
      emisorRegime: latestInvoiceWithIssuer?.emisorRegime || null,
      emisorZipCode: null,
      source: latestInvoiceWithIssuer ? 'latest_invoice' : 'empty',
    };
  }

  async deleteInvoice(id: number, userId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: { select: { id: true } } },
    });

    if (!invoice || invoice.deletedAt) {
      throw new NotFoundException('Factura no encontrada');
    }

    if (invoice.payments.length > 0) {
      throw new BadRequestException('No se puede eliminar una factura con pagos registrados.');
    }

    if (!invoice.isCancelled && invoice.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden eliminar facturas en borrador o canceladas.');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date(),
        createdById: invoice.createdById ?? userId,
      },
      select: { id: true, invoiceNumber: true, deletedAt: true },
    });
  }

  async registerPayment(dto: {
    invoiceId: number;
    amount: number;
    paymentDate: string;
    method?: string;
    reference?: string;
    bankAccountId?: number;
    notes?: string;
    satPaymentForm?: string;
    speiTrackingKey?: string;
    exchangeRate?: number;
    operationNumber?: string;
    stampComplement?: boolean;
  }, userId: number) {
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('El monto del pago debe ser mayor a cero');
    }

    const speiKey = dto.speiTrackingKey?.trim() || null;
    if (speiKey) {
      const dup = await this.prisma.payment.findFirst({ where: { speiTrackingKey: speiKey } });
      if (dup) throw new BadRequestException('La clave de rastreo SPEI ya está registrada');
    }

    const [payment, invoice] = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM invoices WHERE id = ${dto.invoiceId} FOR UPDATE`;
      const locked = await tx.invoice.findUnique({ where: { id: dto.invoiceId } });
      if (!locked) throw new NotFoundException('Factura no encontrada');
      if (locked.isCancelled) throw new BadRequestException('La factura está cancelada');
      if (locked.deletedAt) throw new NotFoundException('Factura no encontrada');

      if (dto.bankAccountId) {
        const bankAccount = await tx.bankAccount.findUnique({ where: { id: dto.bankAccountId } });
        if (!bankAccount) {
          throw new NotFoundException('Cuenta bancaria no encontrada');
        }
      }

      const newPaid = Number(locked.paidAmount) + dto.amount;
      const total = Number(locked.totalAmount);
      if (newPaid > total + 0.01) {
        throw new BadRequestException(
          `El pago excede el saldo pendiente (pagado ${Number(locked.paidAmount).toFixed(2)} de ${total.toFixed(2)})`,
        );
      }
      const newStatus = newPaid >= total - 0.01 ? 'PAID' : 'PARTIALLY_PAID';
      const isDebit = locked.type === 'ACCOUNTS_PAYABLE';

      const createdPayment = await tx.payment.create({
        data: {
          invoiceId: dto.invoiceId,
          amount: new Prisma.Decimal(dto.amount),
          paymentDate: new Date(dto.paymentDate),
          method: (dto.method as any) || 'SPEI',
          reference: dto.reference?.trim() || null,
          bankAccountId: dto.bankAccountId ?? null,
          notes: dto.notes?.trim() || null,
          createdById: userId,
          satPaymentForm: this.normalizeSatPaymentForm(
            dto.satPaymentForm || this.methodToSatPaymentForm(dto.method),
          ) as any,
          speiTrackingKey: speiKey,
          exchangeRate: dto.exchangeRate ? new Prisma.Decimal(dto.exchangeRate) : null,
          operationNumber: dto.operationNumber?.trim() || null,
        },
      });

      const paidClaim = await tx.invoice.updateMany({
        where: { id: dto.invoiceId, paidAmount: locked.paidAmount },
        data: { paidAmount: new Prisma.Decimal(newPaid), status: newStatus },
      });
      if (paidClaim.count === 0) {
        throw new BadRequestException('Conflicto al registrar el pago; reintenta');
      }

      if (dto.bankAccountId) {
        await tx.bankTransaction.create({
          data: {
            bankAccountId: dto.bankAccountId,
            transactionDate: new Date(dto.paymentDate),
            description: `Pago factura ${locked.invoiceNumber}`,
            amount: new Prisma.Decimal(dto.amount),
            isDebit,
            externalRef: dto.reference?.trim() || dto.operationNumber?.trim() || null,
            speiTrackingKey: speiKey,
            concept: dto.notes?.trim() || `Pago ${locked.invoiceNumber}`,
            counterpartyName: locked.receptorName?.trim() || null,
            counterpartyRfc: locked.receptorRfc?.trim() || null,
          },
        });

        await tx.bankAccount.update({
          where: { id: dto.bankAccountId },
          data: {
            currentBalance: isDebit
              ? { decrement: new Prisma.Decimal(dto.amount) }
              : { increment: new Prisma.Decimal(dto.amount) },
            lastSyncAt: new Date(),
          },
        });
      }

      return [createdPayment, locked] as const;
    });

    const amountLabel = `${invoice.currency} ${dto.amount.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    void this.notificationHierarchy
      .notifyPaymentRegistered(userId, payment.id, invoice.invoiceNumber, amountLabel)
      .catch(() => undefined);
    void this.autoJournalForPayment(payment, invoice, userId).catch(() => undefined);

    const shouldStampComplement =
      Boolean(dto.stampComplement) ||
      (invoice.satPaymentMethod === 'PPD' && invoice.cfdiUuid && !invoice.isCancelled);

    if (shouldStampComplement) {
      try {
        const complement = await this.stampPaymentComplement(payment.id, userId);
        return { ...payment, complement };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al timbrar complemento';
        return { ...payment, complementStampWarning: message };
      }
    }

    return payment;
  }

  async getInvoiceXml(id: number) {
    const invoice = await this.getInvoice(id);
    if (!invoice.cfdiUuid || !invoice.cfdiXml) {
      throw new BadRequestException('La factura no tiene XML CFDI timbrado');
    }
    const safeName = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      filename: `${safeName}.xml`,
      contentType: 'application/xml',
      body: invoice.cfdiXml,
    };
  }

  async getInvoicePdf(id: number) {
    const invoice = await this.getInvoice(id);
    if (!invoice.pdfUrl) {
      throw new BadRequestException('PDF no disponible para esta factura (el PAC no generó representación impresa)');
    }
    return { url: invoice.pdfUrl, filename: `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf` };
  }

  // ── Banking ───────────────────────────────────────────────────────
  async createBankAccount(dto: {
    name: string;
    bankName: string;
    accountNumber: string;
    clabe?: string;
    currency?: string;
    bankCode?: string;
    rfc?: string;
    accountType?: string;
    branch?: string;
    speiEnabled?: boolean;
  }) {
    return this.prisma.bankAccount.create({
      data: {
        name: dto.name.trim(),
        bankName: dto.bankName.trim(),
        accountNumber: dto.accountNumber.trim(),
        clabe: dto.clabe?.trim() || null,
        currency: dto.currency || 'MXN',
        bankCode: dto.bankCode?.trim() || null,
        rfc: dto.rfc?.trim() || null,
        accountType: dto.accountType?.trim() || null,
        branch: dto.branch?.trim() || null,
        speiEnabled: dto.speiEnabled ?? true,
      },
    });
  }

  async listBankAccounts() {
    return this.prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async updateBankAccount(
    id: number,
    dto: Partial<{
      name: string;
      bankName: string;
      accountNumber: string;
      clabe: string;
      isActive: boolean;
    }>,
  ) {
    const account = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Cuenta bancaria no encontrada');
    return this.prisma.bankAccount.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? undefined,
        bankName: dto.bankName?.trim() ?? undefined,
        accountNumber: dto.accountNumber?.trim() ?? undefined,
        clabe: dto.clabe !== undefined ? (dto.clabe?.trim() || null) : undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async importBankTransactions(bankAccountId: number, transactions: Array<{
    transactionDate: string;
    description: string;
    amount: number;
    isDebit: boolean;
    externalRef?: string;
    speiTrackingKey?: string;
    counterpartyRfc?: string;
    counterpartyName?: string;
    counterpartyClabe?: string;
    counterpartyBank?: string;
    concept?: string;
    beneficiaryRef?: string;
  }>) {
    return this.prisma.bankTransaction.createMany({
      data: transactions.map((t) => ({
        bankAccountId,
        transactionDate: new Date(t.transactionDate),
        description: t.description.trim(),
        amount: new Prisma.Decimal(t.amount),
        isDebit: t.isDebit,
        externalRef: t.externalRef?.trim() || null,
        speiTrackingKey: t.speiTrackingKey?.trim() || null,
        counterpartyRfc: t.counterpartyRfc?.trim() || null,
        counterpartyName: t.counterpartyName?.trim() || null,
        counterpartyClabe: t.counterpartyClabe?.trim() || null,
        counterpartyBank: t.counterpartyBank?.trim() || null,
        concept: t.concept?.trim() || null,
        beneficiaryRef: t.beneficiaryRef?.trim() || null,
      })),
    });
  }

  async listBankTransactions(
    bankAccountId: number,
    filters?: { from?: string; to?: string },
    query?: PaginationQueryDto,
  ) {
    const where: any = { bankAccountId };
    if (filters?.from || filters?.to) {
      where.transactionDate = {};
      if (filters.from) where.transactionDate.gte = new Date(filters.from);
      if (filters.to) where.transactionDate.lte = new Date(filters.to);
    }
    const pageQuery = query ?? Object.assign(new PaginationQueryDto(), { page: 1, limit: 50 });
    const [data, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        include: { reconciliation: true },
        orderBy: { transactionDate: 'desc' },
        skip: pageQuery.skip,
        take: pageQuery.take,
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, pageQuery);
  }

  async reconcileTransaction(transactionId: number, dto: { matchedAmount: number; notes?: string }, userId: number) {
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      include: { reconciliation: true },
    });
    if (!tx) throw new NotFoundException('Transacción no encontrada');
    if (tx.reconciliation) {
      throw new BadRequestException('Esta transacción ya está conciliada');
    }
    const matched = Number(dto.matchedAmount);
    if (!Number.isFinite(matched) || Math.abs(matched - Number(tx.amount)) > 0.01) {
      throw new BadRequestException(
        `El monto conciliado (${matched}) no coincide con la transacción (${Number(tx.amount)})`,
      );
    }
    try {
      return await this.prisma.bankReconciliation.create({
        data: {
          bankAccountId: tx.bankAccountId,
          bankTransactionId: transactionId,
          status: 'MATCHED',
          matchedAmount: new Prisma.Decimal(matched),
          notes: dto.notes?.trim() || null,
          reconciledAt: new Date(),
          reconciledById: userId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Esta transacción ya está conciliada');
      }
      throw err;
    }
  }

  // ── Cost Centers ──────────────────────────────────────────────────
  async createCostCenter(dto: { code: string; name: string; departmentId?: number; defaultAccountId?: number }) {
    return this.prisma.costCenter.create({ data: dto as any });
  }

  async listCostCenters() {
    return this.prisma.costCenter.findMany({
      where: { isActive: true },
      include: { department: true },
      orderBy: { code: 'asc' },
    });
  }

  // ── Budgets ───────────────────────────────────────────────────────
  async createBudget(dto: { name: string; costCenterId: number; year: number; month?: number; plannedAmount: number; notes?: string }) {
    return this.prisma.budget.create({
      data: {
        name: dto.name.trim(),
        costCenterId: dto.costCenterId,
        year: dto.year,
        month: dto.month ?? null,
        plannedAmount: new Prisma.Decimal(dto.plannedAmount),
        notes: dto.notes?.trim() || null,
      },
      include: { costCenter: true },
    });
  }

  async listBudgets(filters?: { costCenterId?: number; year?: number }) {
    const where: any = {};
    if (filters?.costCenterId) where.costCenterId = filters.costCenterId;
    if (filters?.year) where.year = filters.year;
    return this.prisma.budget.findMany({
      where,
      include: { costCenter: true },
      orderBy: [{ year: 'desc' }, { month: 'asc' }],
    });
  }

  async getBudgetVsActual(costCenterId: number, year: number) {
    const budgets = await this.prisma.budget.findMany({
      where: { costCenterId, year },
      orderBy: { month: 'asc' },
    });
    return budgets.map((b) => ({
      ...b,
      variance: Number(b.plannedAmount) - Number(b.actualAmount),
      variancePercent: Number(b.plannedAmount) > 0 ? ((Number(b.plannedAmount) - Number(b.actualAmount)) / Number(b.plannedAmount)) * 100 : 0,
    }));
  }

  // ── CFDI Cancel ───────────────────────────────────────────────────
  async cancelInvoice(id: number, dto: { cancelReason: string; substitutionUuid?: string }, _userId: number) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.isCancelled) throw new BadRequestException('La factura ya está cancelada');
    if (!invoice.cfdiUuid) throw new BadRequestException('La factura no tiene UUID CFDI para cancelar');
    if (!invoice.emisorRfc) throw new BadRequestException('La factura no tiene RFC del emisor');

    const reasonRaw = (dto.cancelReason || '').trim();
    const reasonNorm = reasonRaw.padStart(2, '0');
    if (!['01', '02', '03', '04'].includes(reasonNorm)) {
      throw new BadRequestException('Motivo SAT inválido (01, 02, 03 o 04)');
    }
    if (reasonNorm === '01' && !dto.substitutionUuid) {
      throw new BadRequestException('Motivo 01 requiere UUID sustituto');
    }

    const cancelResult = await this.pacService.cancel({
      uuid: invoice.cfdiUuid,
      emisorRfc: invoice.emisorRfc,
      cancelReason: reasonNorm as '01' | '02' | '03' | '04',
      substitutionUuid: dto.substitutionUuid || null,
    });

    return this.prisma.invoice.update({
      where: { id },
      data: {
        isCancelled: true,
        cancelledAt: cancelResult.cancelledAt,
        cancelReason: reasonNorm,
        substitutionUuid: dto.substitutionUuid?.trim() || null,
        status: 'CANCELLED',
      },
      include: { items: true, client: true, supplier: true },
    });
  }

  getPacInfo() {
    const provider = this.pacService.provider;
    const env = process.env['NODE_ENV'] || 'development';
    let configured = false;
    if (provider === 'facturama') {
      configured = Boolean(process.env['FACTURAMA_USER'] && process.env['FACTURAMA_PASSWORD']);
    } else if (provider === 'sw') {
      configured = Boolean(process.env['SW_TOKEN'] || (process.env['SW_USER'] && process.env['SW_PASSWORD']));
    } else if (provider === 'finkok') {
      configured = Boolean(process.env['FINKOK_USER'] && process.env['FINKOK_PASSWORD']);
    } else {
      configured = true;
    }
    const csd = this.pacService.csdInfo();
    const efirma = this.satService.isEfirmaConfigured();
    const productionWarning =
      env === 'production' && (provider === 'mock' || (this.pacService.fallbackToMock && !configured))
        ? 'PAC en modo mock o sin credenciales en producción. Configura PAC_PROVIDER y credenciales reales.'
        : env === 'production' && !csd.configured && provider !== 'facturama'
          ? 'CSD del emisor no configurado. Requerido para sellado local (Finkok/SW XML). Facturama sella con CSD en su bóveda.'
          : null;
    return {
      provider,
      fallback: this.pacService.fallbackToMock,
      fallbackToMock: this.pacService.fallbackToMock,
      configured,
      csd,
      efirmaConfigured: efirma,
      env,
      productionWarning,
      tlsRequirement: 'TLS 1.2+ obligatorio (SAT). Verificar traefik-main static config.',
    };
  }

  /** Valida formato y checksum de un RFC mexicano. */
  validateRfc(rfc: string) {
    return this.satService.validateRfc(rfc);
  }

  /** Consulta estatus de un CFDI en el SAT (API REST pública). */
  async queryCfdiStatus(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice?.cfdiUuid) throw new BadRequestException('La factura no tiene UUID CFDI');
    if (!invoice.emisorRfc || !invoice.receptorRfc) {
      throw new BadRequestException('Faltan RFC emisor/receptor');
    }
    return this.satService.queryCfdiStatus({
      uuid: invoice.cfdiUuid,
      rfcEmisor: invoice.emisorRfc,
      rfcReceptor: invoice.receptorRfc,
      total: Number(invoice.totalAmount),
    });
  }

  /** Estado de configuración Descarga Masiva (requiere e.firma). */
  descargaMasivaStatus() {
    return this.satService.descargaMasivaStatus();
  }

  /**
   * Crea una nota de crédito (CFDI Egreso tipo E) vinculada a una factura timbrada.
   * La nota se crea en borrador; hay que timbrarla con stampInvoice().
   */
  async createCreditNote(
    originalInvoiceId: number,
    dto: { reason?: string; amount?: number; items?: Array<{ description: string; quantity: number; unitPrice: number; taxRate?: number }> },
    userId: number,
  ) {
    const original = await this.prisma.invoice.findUnique({
      where: { id: originalInvoiceId },
      include: { items: true },
    });
    if (!original?.cfdiUuid) {
      throw new BadRequestException('Solo se pueden emitir notas de crédito contra facturas timbradas');
    }
    if (original.isCancelled) throw new BadRequestException('La factura original está cancelada');

    const creditAmount = dto.amount ?? Number(original.totalAmount);
    const creditNumber = `NC-${original.invoiceNumber}-${Date.now().toString().slice(-6)}`;

    const items = dto.items?.length
      ? dto.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          taxRate: it.taxRate ?? 16,
          discount: 0,
          total: it.quantity * it.unitPrice * (1 + (it.taxRate ?? 16) / 100),
        }))
      : original.items.map((it) => ({
          description: `Nota de crédito: ${it.description}`,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          taxRate: Number(it.taxRate),
          discount: 0,
          total: Number(it.total),
          satProductKey: it.satProductKey,
          satUnitKey: it.satUnitKey,
          unitName: it.unitName,
          ivaRetAmount: it.ivaRetAmount ? Number(it.ivaRetAmount) : undefined,
          isrRetAmount: it.isrRetAmount ? Number(it.isrRetAmount) : undefined,
          iepsAmount: it.iepsAmount ? Number(it.iepsAmount) : undefined,
          iepsRate: it.iepsRate ? Number(it.iepsRate) : undefined,
        }));

    const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const taxAmount = items.reduce((s, it) => s + it.quantity * it.unitPrice * ((it.taxRate ?? 16) / 100), 0);
    const totalAmount = Math.min(creditAmount, subtotal + taxAmount);

    const creditNote = await this.prisma.invoice.create({
      data: {
        invoiceNumber: creditNumber,
        type: 'ACCOUNTS_RECEIVABLE',
        status: 'DRAFT',
        issueDate: new Date(),
        dueDate: new Date(),
        clientId: original.clientId,
        subtotal: new Prisma.Decimal(subtotal),
        taxAmount: new Prisma.Decimal(taxAmount),
        totalAmount: new Prisma.Decimal(totalAmount),
        currency: original.currency,
        notes: dto.reason || `Nota de crédito de ${original.invoiceNumber}`,
        cfdiUsage: 'G02',
        satPaymentForm: original.satPaymentForm,
        satPaymentMethod: original.satPaymentMethod,
        emisorRfc: original.emisorRfc,
        emisorName: original.emisorName,
        emisorRegime: original.emisorRegime,
        receptorRfc: original.receptorRfc,
        receptorName: original.receptorName,
        receptorRegime: original.receptorRegime,
        receptorZipCode: original.receptorZipCode,
        cfdiRelationType: '01',
        cfdiRelatedUuids: original.cfdiUuid,
        cfdiSerie: original.cfdiSerie,
        createdById: userId,
        items: {
          create: items.map((it) => ({
            description: it.description,
            quantity: new Prisma.Decimal(it.quantity),
            unitPrice: new Prisma.Decimal(it.unitPrice),
            taxRate: new Prisma.Decimal(it.taxRate ?? 16),
            discount: new Prisma.Decimal(0),
            total: new Prisma.Decimal(it.total),
            satProductKey: (it as any).satProductKey || '84111506',
            satUnitKey: (it as any).satUnitKey || 'E48',
            unitName: (it as any).unitName || 'Servicio',
            ivaRetAmount: (it as any).ivaRetAmount != null ? new Prisma.Decimal((it as any).ivaRetAmount) : null,
            isrRetAmount: (it as any).isrRetAmount != null ? new Prisma.Decimal((it as any).isrRetAmount) : null,
            iepsAmount: (it as any).iepsAmount != null ? new Prisma.Decimal((it as any).iepsAmount) : null,
            iepsRate: (it as any).iepsRate != null ? new Prisma.Decimal((it as any).iepsRate) : null,
          })),
        },
      },
      include: { items: true, client: true },
    });

    await this.prisma.invoice.update({
      where: { id: originalInvoiceId },
      data: { status: 'CREDITED' },
    });

    return creditNote;
  }

  /**
   * Timbra un Complemento de Pago (CFDI tipo P, Pagos 2.0) para un pago registrado
   * contra una factura PPD timbrada.
   */
  async stampPaymentComplement(paymentId: number, userId: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: { include: { items: true, payments: true } } },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.cfdiPaymentUuid) throw new BadRequestException('Este pago ya tiene complemento timbrado');
    const invoice = payment.invoice;
    if (!invoice?.cfdiUuid) throw new BadRequestException('La factura no está timbrada');
    if (invoice.satPaymentMethod !== 'PPD') {
      throw new BadRequestException('Complemento de pago solo aplica a facturas PPD (pago en parcialidades)');
    }
    if (!invoice.emisorRfc || !invoice.receptorRfc) {
      throw new BadRequestException('Faltan RFC emisor/receptor');
    }

    const issuerProfile = await this.getInvoiceIssuerProfile();
    const previousPayments = invoice.payments.filter((p) => p.id !== payment.id && p.cfdiPaymentUuid);
    const previousPaid = previousPayments.reduce((s, p) => s + Number(p.amount), 0);
    const previousBalance = Number(invoice.totalAmount) - previousPaid;
    const amountPaid = Number(payment.amount);
    const remainingBalance = Math.max(0, previousBalance - amountPaid);

    const stamp = await this.pacService.stampPayment({
      invoiceNumber: `PAGO-${invoice.invoiceNumber}-${payment.id}`,
      serie: 'P',
      folio: String(payment.id),
      emisor: {
        rfc: invoice.emisorRfc,
        name: invoice.emisorName || 'Emisor',
        regime: invoice.emisorRegime || 'R601',
        zipCode: issuerProfile.emisorZipCode,
      },
      receptor: {
        rfc: invoice.receptorRfc,
        name: invoice.receptorName || 'Receptor',
        zipCode: invoice.receptorZipCode,
        regime: invoice.receptorRegime,
      },
      payment: {
        date: payment.paymentDate.toISOString(),
        paymentForm: payment.satPaymentForm || 'FP03',
        amount: amountPaid,
        currency: invoice.currency || 'MXN',
        exchangeRate: payment.exchangeRate ? Number(payment.exchangeRate) : null,
        operationNumber: payment.operationNumber || payment.reference,
      },
      relatedDocs: [{
        uuid: invoice.cfdiUuid,
        serie: invoice.cfdiSerie,
        folio: invoice.cfdiFolio,
        currency: invoice.currency || 'MXN',
        paymentMethod: 'PPD',
        partialityNumber: previousPayments.length + 1,
        previousBalance,
        amountPaid,
        remainingBalance,
      }],
    });

    const claim = await this.prisma.payment.updateMany({
      where: { id: paymentId, cfdiPaymentUuid: null },
      data: { cfdiPaymentUuid: stamp.uuid },
    });
    if (claim.count === 0) {
      const existing = await this.prisma.payment.findUnique({ where: { id: paymentId } });
      if (existing?.cfdiPaymentUuid) {
        return {
          paymentId,
          cfdiPaymentUuid: existing.cfdiPaymentUuid,
          xml: stamp.xml,
          provider: stamp.provider,
        };
      }
      throw new BadRequestException('No se pudo persistir el complemento de pago');
    }

    return { paymentId, cfdiPaymentUuid: stamp.uuid, xml: stamp.xml, provider: stamp.provider };
  }

  // ── Overdue invoices ──────────────────────────────────────────────
  async getOverdueInvoices() {
    return this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        dueDate: { lt: new Date() },
        isCancelled: false,
      },
      include: { client: true, payments: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  // ── Dashboard ejecutivo financiero (P&L + cash + AR/AP) ─────────────
  async getFinancialDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      arAggregate,
      apAggregate,
      cashAccounts,
      monthRevenue,
      monthExpenses,
      ytdRevenue,
      ytdExpenses,
      prevMonthRevenue,
      topReceivables,
      topPayables,
      overdueCount,
      monthInvoiceCount,
      ytdInvoiceCount,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { deletedAt: null, type: 'ACCOUNTS_RECEIVABLE', status: { in: ['SENT', 'PARTIALLY_PAID'] }, isCancelled: false },
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { deletedAt: null, type: 'ACCOUNTS_PAYABLE', status: { in: ['SENT', 'PARTIALLY_PAID'] }, isCancelled: false },
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.bankAccount.findMany({
        where: { isActive: true },
        select: { id: true, name: true, bankName: true, currentBalance: true, currency: true },
      }).catch(() => []),
      this.prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          type: 'ACCOUNTS_RECEIVABLE',
          issueDate: { gte: startOfMonth },
          isCancelled: false,
        },
        _sum: { subtotal: true, totalAmount: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          type: 'ACCOUNTS_PAYABLE',
          issueDate: { gte: startOfMonth },
          isCancelled: false,
        },
        _sum: { subtotal: true, totalAmount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { deletedAt: null, type: 'ACCOUNTS_RECEIVABLE', issueDate: { gte: startOfYear }, isCancelled: false },
        _sum: { subtotal: true, totalAmount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { deletedAt: null, type: 'ACCOUNTS_PAYABLE', issueDate: { gte: startOfYear }, isCancelled: false },
        _sum: { subtotal: true, totalAmount: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          deletedAt: null,
          type: 'ACCOUNTS_RECEIVABLE',
          issueDate: { gte: startOfPrevMonth, lte: endOfPrevMonth },
          isCancelled: false,
        },
        _sum: { subtotal: true, totalAmount: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['receptorName'],
        where: { deletedAt: null, type: 'ACCOUNTS_RECEIVABLE', status: { in: ['SENT', 'PARTIALLY_PAID'] }, isCancelled: false },
        _sum: { totalAmount: true, paidAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 5,
      }),
      this.prisma.invoice.groupBy({
        by: ['receptorName'],
        where: { deletedAt: null, type: 'ACCOUNTS_PAYABLE', status: { in: ['SENT', 'PARTIALLY_PAID'] }, isCancelled: false },
        _sum: { totalAmount: true, paidAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 5,
      }),
      this.prisma.invoice.count({
        where: { deletedAt: null, status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: now }, isCancelled: false },
      }),
      this.prisma.invoice.count({ where: { deletedAt: null, issueDate: { gte: startOfMonth } } }),
      this.prisma.invoice.count({ where: { deletedAt: null, issueDate: { gte: startOfYear } } }),
    ]);

    const arTotal = Number(arAggregate._sum.totalAmount || 0);
    const arPaid = Number(arAggregate._sum.paidAmount || 0);
    const apTotal = Number(apAggregate._sum.totalAmount || 0);
    const apPaid = Number(apAggregate._sum.paidAmount || 0);

    const monthRev = Number(monthRevenue._sum.subtotal || 0);
    const monthExp = Number(monthExpenses._sum.subtotal || 0);
    const prevMonthRev = Number(prevMonthRevenue._sum.subtotal || 0);
    const monthProfit = monthRev - monthExp;
    const ytdRev = Number(ytdRevenue._sum.subtotal || 0);
    const ytdExp = Number(ytdExpenses._sum.subtotal || 0);
    const ytdProfit = ytdRev - ytdExp;

    const cashBalance = (cashAccounts as any[]).reduce(
      (acc, a) => acc + Number(a.currentBalance || 0),
      0,
    );

    const monthGrowth = prevMonthRev > 0 ? ((monthRev - prevMonthRev) / prevMonthRev) * 100 : 0;

    return {
      cash: {
        totalBalance: cashBalance,
        accounts: cashAccounts,
      },
      profitAndLoss: {
        month: {
          revenue: monthRev,
          expenses: monthExp,
          profit: monthProfit,
          marginPct: monthRev > 0 ? +((monthProfit / monthRev) * 100).toFixed(1) : 0,
          growthVsPrev: +monthGrowth.toFixed(1),
        },
        ytd: {
          revenue: ytdRev,
          expenses: ytdExp,
          profit: ytdProfit,
          marginPct: ytdRev > 0 ? +((ytdProfit / ytdRev) * 100).toFixed(1) : 0,
        },
      },
      accountsReceivable: {
        total: arTotal,
        collected: arPaid,
        pending: arTotal - arPaid,
        invoices: arAggregate as any,
      },
      accountsPayable: {
        total: apTotal,
        paid: apPaid,
        pending: apTotal - apPaid,
      },
      workingCapital: cashBalance + (arTotal - arPaid) - (apTotal - apPaid),
      overdueInvoices: overdueCount,
      invoices: { month: monthInvoiceCount, ytd: ytdInvoiceCount },
      topReceivables: topReceivables.map((r: any) => ({
        name: r.receptorName,
        total: Number(r._sum.totalAmount || 0),
        paid: Number(r._sum.paidAmount || 0),
        pending: Number(r._sum.totalAmount || 0) - Number(r._sum.paidAmount || 0),
      })),
      topPayables: topPayables.map((r: any) => ({
        name: r.receptorName,
        total: Number(r._sum.totalAmount || 0),
        paid: Number(r._sum.paidAmount || 0),
        pending: Number(r._sum.totalAmount || 0) - Number(r._sum.paidAmount || 0),
      })),
    };
  }

  // ── Invoice Dashboard ─────────────────────────────────────────────
  async getInvoiceDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [totalAR, totalAP, overdueCount, monthInvoices, recentPayments] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { deletedAt: null, type: 'ACCOUNTS_RECEIVABLE', status: { in: ['SENT', 'PARTIALLY_PAID'] }, isCancelled: false },
        _sum: { totalAmount: true, paidAmount: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { deletedAt: null, type: 'ACCOUNTS_PAYABLE', status: { in: ['SENT', 'PARTIALLY_PAID'] }, isCancelled: false },
        _sum: { totalAmount: true, paidAmount: true },
        _count: true,
      }),
      this.prisma.invoice.count({
        where: { deletedAt: null, status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: now }, isCancelled: false },
      }),
      this.prisma.invoice.count({
        where: { deletedAt: null, issueDate: { gte: startOfMonth, lte: endOfMonth } },
      }),
      this.prisma.payment.findMany({
        take: 10,
        orderBy: { paymentDate: 'desc' },
        include: { invoice: { select: { invoiceNumber: true, type: true, receptorName: true } } },
      }),
    ]);

    return {
      accountsReceivable: {
        total: Number(totalAR._sum.totalAmount || 0),
        collected: Number(totalAR._sum.paidAmount || 0),
        pending: Number(totalAR._sum.totalAmount || 0) - Number(totalAR._sum.paidAmount || 0),
        count: totalAR._count,
      },
      accountsPayable: {
        total: Number(totalAP._sum.totalAmount || 0),
        paid: Number(totalAP._sum.paidAmount || 0),
        pending: Number(totalAP._sum.totalAmount || 0) - Number(totalAP._sum.paidAmount || 0),
        count: totalAP._count,
      },
      overdueCount,
      monthInvoices,
      recentPayments,
    };
  }

  // ── Bank Account Summary ──────────────────────────────────────────
  async getBankAccountSummary(bankAccountId: number) {
    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) throw new NotFoundException('Cuenta bancaria no encontrada');

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [monthSummary, unreconciled, lastTransactions] = await Promise.all([
      this.prisma.bankTransaction.groupBy({
        by: ['isDebit'],
        where: { bankAccountId, transactionDate: { gte: startOfMonth } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.bankTransaction.count({
        where: { bankAccountId, reconciliation: null },
      }),
      this.prisma.bankTransaction.findMany({
        where: { bankAccountId },
        take: 20,
        orderBy: { transactionDate: 'desc' },
      }),
    ]);

    const debits = monthSummary.find((s) => s.isDebit)?._sum.amount || 0;
    const credits = monthSummary.find((s) => !s.isDebit)?._sum.amount || 0;

    return {
      account,
      monthDebits: Number(debits),
      monthCredits: Number(credits),
      monthNet: Number(credits) - Number(debits),
      unreconciledCount: unreconciled,
      lastTransactions,
    };
  }

  // ── SPEI Transaction lookup ───────────────────────────────────────
  async findTransactionBySpei(trackingKey: string) {
    const tx = await this.prisma.bankTransaction.findFirst({
      where: { speiTrackingKey: trackingKey.trim() },
      include: { bankAccount: true, reconciliation: true },
    });
    if (!tx) throw new NotFoundException('Transacción SPEI no encontrada');
    return tx;
  }

  // ── Financial Reports PDF ────────────────────────────────────────
  async getFinancialReportsForPdf(fromDate?: string, toDate?: string, asOfDate?: string) {
    // Get all three reports
    const [trialBalance, incomeStatement, balanceSheet] = await Promise.all([
      this.getTrialBalance(),
      this.getIncomeStatement(fromDate, toDate),
      this.getBalanceSheet(asOfDate),
    ]);

    return {
      fromDate,
      toDate,
      asOfDate,
      trialBalance: trialBalance.map((t) => ({
        code: t.code,
        name: t.name,
        type: t.type,
        debit: t.debit,
        credit: t.credit,
        balance: t.debit - t.credit,
      })),
      incomeStatement: {
        totalRevenue: incomeStatement.totalRevenue,
        totalExpenses: incomeStatement.totalExpenses,
        netIncome: incomeStatement.netIncome,
        revenue: incomeStatement.revenue,
        expenses: incomeStatement.expenses,
      },
      balanceSheet,
    };
  }
}
