import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

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

  async postJournalEntry(id: number) {
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

    return this.prisma.journalEntry.update({
      where: { id },
      data: { status: 'POSTED', postedAt: new Date() },
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
    });
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

    return this.prisma.invoice.create({
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
        cfdiUsage: (dto.cfdiUsage as any) || undefined,
        satPaymentForm: (dto.satPaymentForm as any) || undefined,
        satPaymentMethod: (dto.satPaymentMethod as any) || undefined,
        emisorRfc: dto.emisorRfc?.trim() || null,
        emisorName: dto.emisorName?.trim() || null,
        emisorRegime: (dto.emisorRegime as any) || undefined,
        receptorRfc: dto.receptorRfc?.trim() || null,
        receptorName: dto.receptorName?.trim() || null,
        receptorRegime: (dto.receptorRegime as any) || undefined,
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
            satProductKey: i.satProductKey?.trim() || null,
            satUnitKey: i.satUnitKey?.trim() || null,
            unitName: i.unitName?.trim() || null,
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
  }

  async listInvoices(filters?: { type?: string; status?: string; from?: string; to?: string }, query?: PaginationQueryDto) {
    const where: any = {};
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
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, client: true, supplier: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return invoice;
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

    const newPaid = Number(invoice.paidAmount) + dto.amount;
    const newStatus = newPaid >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';

    const [payment] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          invoiceId: dto.invoiceId,
          amount: new Prisma.Decimal(dto.amount),
          paymentDate: new Date(dto.paymentDate),
          method: (dto.method as any) || 'SPEI',
          reference: dto.reference?.trim() || null,
          bankAccountId: dto.bankAccountId ?? null,
          notes: dto.notes?.trim() || null,
          createdById: userId,
          satPaymentForm: (dto.satPaymentForm as any) || undefined,
          speiTrackingKey: dto.speiTrackingKey?.trim() || null,
          exchangeRate: dto.exchangeRate ? new Prisma.Decimal(dto.exchangeRate) : null,
          operationNumber: dto.operationNumber?.trim() || null,
        },
      }),
      this.prisma.invoice.update({
        where: { id: dto.invoiceId },
        data: { paidAmount: new Prisma.Decimal(newPaid), status: newStatus },
      }),
    ]);

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
  async cancelInvoice(id: number, dto: { cancelReason: string; substitutionUuid?: string }, userId: number) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.isCancelled) throw new BadRequestException('La factura ya está cancelada');
    if (!invoice.cfdiUuid) throw new BadRequestException('La factura no tiene UUID CFDI para cancelar');

    return this.prisma.invoice.update({
      where: { id },
      data: {
        isCancelled: true,
        cancelledAt: new Date(),
        cancelReason: dto.cancelReason.trim(),
        substitutionUuid: dto.substitutionUuid?.trim() || null,
        status: 'CANCELLED',
      },
      include: { items: true, client: true, supplier: true },
    });
  }

  // ── Overdue invoices ──────────────────────────────────────────────
  async getOverdueInvoices() {
    return this.prisma.invoice.findMany({
      where: {
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        dueDate: { lt: new Date() },
        isCancelled: false,
      },
      include: { client: true, payments: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  // ── Invoice Dashboard ─────────────────────────────────────────────
  async getInvoiceDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [totalAR, totalAP, overdueCount, monthInvoices, recentPayments] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { type: 'ACCOUNTS_RECEIVABLE', status: { in: ['SENT', 'PARTIALLY_PAID'] }, isCancelled: false },
        _sum: { totalAmount: true, paidAmount: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: { type: 'ACCOUNTS_PAYABLE', status: { in: ['SENT', 'PARTIALLY_PAID'] }, isCancelled: false },
        _sum: { totalAmount: true, paidAmount: true },
        _count: true,
      }),
      this.prisma.invoice.count({
        where: { status: { in: ['SENT', 'PARTIALLY_PAID'] }, dueDate: { lt: now }, isCancelled: false },
      }),
      this.prisma.invoice.count({
        where: { issueDate: { gte: startOfMonth, lte: endOfMonth } },
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
}
