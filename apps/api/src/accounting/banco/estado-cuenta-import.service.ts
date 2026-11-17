import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccountingService } from '../accounting.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import {
  type BancoLayout,
  parseCsvEstadoCuenta,
  parseExcelFilasEstadoCuenta,
  parseOfxEstadoCuenta,
} from './estado-cuenta-parsers.js';
import { topPropuestas, type CandidatoMatch } from './reglas-conciliacion.js';

@Injectable()
export class EstadoCuentaImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async importarArchivo(
    accountId: number,
    companyIdRaw: number | null,
    texto: string,
    filename: string,
    layout: BancoLayout = 'auto',
  ) {
    const companyId = requireCompanyId(companyIdRaw);
    const lower = filename.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      throw new BadRequestException('Excel binario: convierte a CSV/OFX o envía filas ya parseadas.');
    }
    const movs = lower.endsWith('.ofx') || lower.endsWith('.qfx')
      ? parseOfxEstadoCuenta(texto)
      : parseCsvEstadoCuenta(texto, layout);
    if (!movs.length) throw new BadRequestException('No se leyeron movimientos del archivo.');
    const transactions = movs.map((m) => ({
      transactionDate: m.date,
      description: m.description,
      amount: m.amount,
      isDebit: m.isDebit,
      externalRef: m.reference ?? undefined,
    }));
    return this.accounting.importBankTransactions(accountId, transactions, companyId);
  }

  async importarFilasExcel(
    accountId: number,
    companyIdRaw: number | null,
    filas: Array<Array<string | number | null | undefined>>,
    layout: BancoLayout = 'auto',
  ) {
    const companyId = requireCompanyId(companyIdRaw);
    const movs = parseExcelFilasEstadoCuenta(filas, layout);
    const transactions = movs.map((m) => ({
      transactionDate: m.date,
      description: m.description,
      amount: m.amount,
      isDebit: m.isDebit,
      externalRef: m.reference ?? undefined,
    }));
    return this.accounting.importBankTransactions(accountId, transactions, companyId);
  }

  async proponerMatches(accountId: number, companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const pagina = Object.assign(new PaginationQueryDto(), { page: 1, limit: 100 });
    const txs = await this.accounting.listBankTransactions(accountId, {}, pagina, companyId);
    const items: unknown[] = Array.isArray(txs) ? txs : (txs as { data?: unknown[] }).data ?? [];
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, deletedAt: null },
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        totalAmount: true,
        emisorRfc: true,
        receptorRfc: true,
        type: true,
      },
      take: 300,
    });
    const candidatos: CandidatoMatch[] = invoices.map((inv) => ({
      id: inv.id,
      kind: 'INVOICE' as const,
      folio: inv.invoiceNumber,
      date: inv.issueDate.toISOString().slice(0, 10),
      amount: Number(inv.totalAmount),
      rfc: inv.type === 'ACCOUNTS_PAYABLE' ? inv.emisorRfc : inv.receptorRfc,
    }));
    return (items as Array<Record<string, unknown>>).slice(0, 50).map((t) => {
      const mov = {
        id: Number(t.id),
        date: String(t.transactionDate ?? t.date ?? '').slice(0, 10),
        amount: Math.abs(Number(t.amount ?? 0)),
        isDebit: Boolean(t.isDebit),
        description: (t.description as string) ?? null,
        reference: (t.reference as string) ?? null,
        counterpartyRfc: (t.counterpartyRfc as string) ?? null,
      };
      return {
        movimientoId: mov.id,
        propuestas: topPropuestas(mov, candidatos, 3),
      };
    });
  }
}
