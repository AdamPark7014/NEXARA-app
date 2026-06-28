import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { PacService } from '../pac/pac.service.js';

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly pacService: PacService,
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
    lines: Array<{ debitAccountId: number; creditAccountId?: number; description?: string; debit: number; credit: number; costCenterId?: number }>;
  }, userId: number) {
    const totalDebit = dto.lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = dto.lines.reduce((s, l) => s + (l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException('Debe y Haber no cuadran');
    }

    const entryNumber = await this.generateEntryNumber();
    return this.prisma.journalEntry.create({
      data: {
        entryNumber,
        date: new Date(dto.date),
        description: dto.description.trim(),
        reference: dto.reference?.trim() || null,
        fiscalPeriodId: dto.fiscalPeriodId ?? null,
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

  async listJournalEntries(filters?: { status?: string; from?: string; to?: string }, query?: PaginationQueryDto) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.from || filters?.to) {
      where.date = {};
      if (filters.from) where.date.gte = new Date(filters.from);
      if (filters.to) where.date.lte = new Date(filters.to);
    }
    const include = { lines: { include: { debitAccount: true, creditAccount: true } }, createdBy: { select: { id: true, nombre: true } } };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.journalEntry.findMany({ where, include, orderBy: { date: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.journalEntry.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.journalEntry.findMany({ where, include, orderBy: { date: 'desc' } });
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

    // Update account balances
    for (const line of entry.lines) {
      if (line.debit.greaterThan(0)) {
        await this.prisma.account.update({
          where: { id: line.debitAccountId },
          data: { balance: { increment: line.debit } },
        });
      }
      if (line.credit.greaterThan(0) && line.creditAccountId) {
        await this.prisma.account.update({
          where: { id: line.creditAccountId },
          data: { balance: { decrement: line.credit } },
        });
      }
    }

    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: { status: 'POSTED', postedAt: new Date() },
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
    });
    const desc = entry.description?.trim() || 'Sin descripción';
    void this.notificationHierarchy
      .notifyJournalEntryPosted(postedByUserId, updated.id, entry.entryNumber, desc)
      .catch(() => undefined);
    return updated;
  }

  async reverseJournalEntry(id: number, userId: number) {
    const original = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
    if (!original) throw new NotFoundException('Asiento no encontrado');
    if (original.status !== 'POSTED') throw new BadRequestException('Solo se pueden revertir asientos contabilizados');

    const entryNumber = await this.generateEntryNumber();
    const reversal = await this.prisma.journalEntry.create({
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
          })),
        },
      },
      include: { lines: true },
    });

    await this.prisma.journalEntry.update({ where: { id }, data: { status: 'REVERSED' } });
    return reversal;
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
    const issuer = await this.getInvoiceIssuerProfile();
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
        lines: { orderBy: { sortOrder: 'asc' } },
        invoice: true,
        project: { include: { opportunity: { include: { client: true } } } },
      },
    });

    if (!order) {
      throw new NotFoundException('No hay orden de cierre para este proyecto');
    }
    if (order.invoice) {
      throw new BadRequestException('Este proyecto ya tiene una factura vinculada');
    }
    if (!order.lines.length) {
      throw new BadRequestException('La orden no tiene líneas para facturar');
    }

    const client = order.project?.opportunity?.client;
    if (!client?.id) {
      throw new BadRequestException('Cliente comercial no encontrado para facturar');
    }

    const selectedLines = options?.lineIds?.length
      ? order.lines.filter((line) => options.lineIds!.includes(line.id))
      : order.lines;

    if (!selectedLines.length) {
      throw new BadRequestException('No hay líneas seleccionadas para facturar');
    }

    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const invoice = await this.createInvoice(
      {
        type: 'ACCOUNTS_RECEIVABLE',
        issueDate: today,
        dueDate: due,
        clientId: client.id,
        notes: `Factura generada desde orden ${order.orderId} — ${order.project.name}`,
        receptorRfc: client.taxId ?? undefined,
        receptorName: client.legalName || client.name,
        items: selectedLines.map((line) => {
          const qty = Number(line.qty);
          const unitPrice = Number(line.unitPrice);
          const lineSubtotal = qty * unitPrice;
          return {
            description: line.name,
            quantity: qty,
            unitPrice,
            taxRate: Number(line.tax),
            ivaRate: Number(line.tax),
            productId: line.productId ?? undefined,
            unitName: line.unit || 'Servicio',
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

    // Tras las validaciones, TS sigue viendo estos campos como `string | null`
    // (Prisma optional), pero el flujo asegura que existen. Casteo explícito.
    const emisorRfc = invoice.emisorRfc as string;
    const receptorRfc = invoice.receptorRfc as string;

    const stamp = await this.pacService.stamp({
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
      emisor: {
        rfc: emisorRfc,
        name: invoice.emisorName || 'Emisor',
        regime: invoice.emisorRegime || 'R601',
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
      })),
    });

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        cfdiUuid: stamp.uuid,
        cfdiStampDate: stamp.stampedAt,
        satCertNumber: stamp.satCertNumber,
        status: 'SENT',
        cfdiSerie: invoice.cfdiSerie || 'A',
        cfdiFolio: invoice.cfdiFolio || invoice.invoiceNumber.replace(/[^0-9]/g, '').slice(0, 12) || String(invoice.id),
        cfdiXml: stamp.xml || invoice.cfdiXml,
        pdfUrl: stamp.pdfUrl || invoice.pdfUrl,
        createdById: invoice.createdById ?? userId,
      },
      include: { items: { include: { product: true } }, client: true, supplier: true, payments: true },
    });

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
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.invoice.findMany({ where, include, orderBy: { issueDate: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.invoice.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.invoice.findMany({ where, include, orderBy: { issueDate: 'desc' } });
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

  async getInvoiceIssuerProfile() {
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
  }, userId: number) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: dto.invoiceId } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    if (dto.bankAccountId) {
      const bankAccount = await this.prisma.bankAccount.findUnique({ where: { id: dto.bankAccountId } });
      if (!bankAccount) {
        throw new NotFoundException('Cuenta bancaria no encontrada');
      }
    }

    const newPaid = Number(invoice.paidAmount) + dto.amount;
    const newStatus = newPaid >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';
    const isDebit = invoice.type === 'ACCOUNTS_PAYABLE';

    const [payment] = await this.prisma.$transaction(async (tx) => {
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
          satPaymentForm: this.normalizeSatPaymentForm(dto.satPaymentForm) as any,
          speiTrackingKey: dto.speiTrackingKey?.trim() || null,
          exchangeRate: dto.exchangeRate ? new Prisma.Decimal(dto.exchangeRate) : null,
          operationNumber: dto.operationNumber?.trim() || null,
        },
      });

      await tx.invoice.update({
        where: { id: dto.invoiceId },
        data: { paidAmount: new Prisma.Decimal(newPaid), status: newStatus },
      });

      if (dto.bankAccountId) {
        await tx.bankTransaction.create({
          data: {
            bankAccountId: dto.bankAccountId,
            transactionDate: new Date(dto.paymentDate),
            description: `Pago factura ${invoice.invoiceNumber}`,
            amount: new Prisma.Decimal(dto.amount),
            isDebit,
            externalRef: dto.reference?.trim() || dto.operationNumber?.trim() || null,
            speiTrackingKey: dto.speiTrackingKey?.trim() || null,
            concept: dto.notes?.trim() || `Pago ${invoice.invoiceNumber}`,
            counterpartyName: invoice.receptorName?.trim() || null,
            counterpartyRfc: invoice.receptorRfc?.trim() || null,
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

      return [createdPayment] as const;
    });

    const amountLabel = `${invoice.currency} ${dto.amount.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    void this.notificationHierarchy
      .notifyPaymentRegistered(userId, payment.id, invoice.invoiceNumber, amountLabel)
      .catch(() => undefined);
    return payment;
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
      currentBalance: number;
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
        currentBalance: dto.currentBalance !== undefined ? new Prisma.Decimal(dto.currentBalance) : undefined,
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

  async listBankTransactions(bankAccountId: number, filters?: { from?: string; to?: string }) {
    const where: any = { bankAccountId };
    if (filters?.from || filters?.to) {
      where.transactionDate = {};
      if (filters.from) where.transactionDate.gte = new Date(filters.from);
      if (filters.to) where.transactionDate.lte = new Date(filters.to);
    }
    return this.prisma.bankTransaction.findMany({
      where,
      include: { reconciliation: true },
      orderBy: { transactionDate: 'desc' },
    });
  }

  async reconcileTransaction(transactionId: number, dto: { matchedAmount: number; notes?: string }, userId: number) {
    const tx = await this.prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transacción no encontrada');
    return this.prisma.bankReconciliation.create({
      data: {
        bankAccountId: tx.bankAccountId,
        bankTransactionId: transactionId,
        status: 'MATCHED',
        matchedAmount: new Prisma.Decimal(dto.matchedAmount),
        notes: dto.notes?.trim() || null,
        reconciledAt: new Date(),
        reconciledById: userId,
      },
    });
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
    let configured = false;
    if (provider === 'facturama') {
      configured = Boolean(process.env['FACTURAMA_USER'] && process.env['FACTURAMA_PASSWORD']);
    } else if (provider === 'sw') {
      configured = Boolean(process.env['SW_TOKEN'] || (process.env['SW_USER'] && process.env['SW_PASSWORD']));
    } else if (provider === 'finkok') {
      configured = Boolean(process.env['FINKOK_USER'] && process.env['FINKOK_PASSWORD']);
    } else {
      // mock no requiere credenciales reales
      configured = true;
    }
    return {
      provider,
      // Compat: la UI consume tanto `fallback` (legacy) como `fallbackToMock`.
      fallback: this.pacService.fallbackToMock,
      fallbackToMock: this.pacService.fallbackToMock,
      configured,
      env: process.env['NODE_ENV'] || 'development',
    };
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
