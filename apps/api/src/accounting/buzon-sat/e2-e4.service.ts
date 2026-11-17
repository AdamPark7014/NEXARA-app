import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { crucesSatLibros, type CfdiCruce, type PolizaCruce } from './cruces-sat.js';
import { armarMiCierre } from './mi-cierre.js';
import { PLANTILLAS_DEFAULT, plantillaPorTipo } from './poliza-plantillas.js';
import { buildPolizasPeriodoXml, type PolizaXml } from './polizas-plz-xml.js';

@Injectable()
export class E2E4ContabilidadService {
  constructor(private readonly prisma: PrismaService) {}

  private sat() {
    return (this.prisma as unknown as { satCfdi: PrismaService['invoice'] }).satCfdi as {
      findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
      count: (args: unknown) => Promise<number>;
    };
  }

  private plantillas() {
    return (this.prisma as unknown as { polizaPlantilla: { findMany: Function; upsert: Function } })
      .polizaPlantilla;
  }

  async cruces(companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const cfdisRaw = await this.sat().findMany({
      where: { companyId },
      take: 2000,
      orderBy: { fecha: 'desc' },
    });
    const cfdis: CfdiCruce[] = cfdisRaw.map((c) => ({
      id: Number(c.id),
      uuid: String(c.uuid),
      total: Number(c.total),
      estatusSat: String(c.estatusSat ?? 'vigente'),
      journalEntryId: (c.journalEntryId as number | null) ?? null,
      invoiceId: (c.invoiceId as number | null) ?? null,
      lista69B: (c.lista69B as string | null) ?? null,
    }));
    const polizasRaw = await this.prisma.journalEntry.findMany({
      where: { companyId, status: 'POSTED' },
      take: 2000,
      select: { id: true, entryNumber: true, date: true, cfdiUuid: true },
    });
    const polizas: PolizaCruce[] = polizasRaw.map((p) => ({
      id: p.id,
      entryNumber: p.entryNumber,
      uuid: (p as { cfdiUuid?: string | null }).cfdiUuid ?? null,
      date: p.date.toISOString().slice(0, 10),
    }));
    return { total: crucesSatLibros(cfdis, polizas).length, items: crucesSatLibros(cfdis, polizas) };
  }

  async miCierre(companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const cuentas = await this.prisma.bankAccount.findMany({
      where: { companyId },
      select: { id: true },
      take: 100,
    });
    let bancosConciliados = 0;
    for (const c of cuentas) {
      const pendientes = await this.prisma.bankTransaction.count({
        where: { bankAccountId: c.id, reconciliation: { is: null } },
      });
      if (pendientes === 0) bancosConciliados += 1;
    }
    const cfdiRecibidosVigentes = await this.sat().count({
      where: { companyId, sentido: 'recibido', estatusSat: 'vigente' },
    });
    const cfdiSinPoliza = await this.sat().count({
      where: { companyId, sentido: 'recibido', estatusSat: 'vigente', journalEntryId: null },
    });
    const ppdRows = await this.prisma.invoice.findMany({
      where: {
        companyId,
        deletedAt: null,
        type: 'ACCOUNTS_RECEIVABLE',
        satPaymentMethod: 'PPD',
        isCancelled: false,
      },
      select: { totalAmount: true, paidAmount: true },
      take: 500,
    });
    const ppd = ppdRows.length;
    const ppdConSaldo = ppdRows.filter((r) => Number(r.paidAmount) < Number(r.totalAmount) - 0.01).length;
    const efos69b = await this.sat().count({
      where: { companyId, NOT: { lista69B: null } },
    });
    return armarMiCierre({
      bancosConciliados,
      bancosTotal: Math.max(cuentas.length, 1),
      cfdiSinPoliza,
      cfdiRecibidosVigentes: Math.max(cfdiRecibidosVigentes, 1),
      repPendientes: ppdConSaldo,
      repTotal: Math.max(ppd, 1),
      diotPendiente: false,
      efos69b,
    });
  }

  async listarPlantillas(companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    try {
      const rows = await this.plantillas().findMany({ where: { companyId, activa: true } });
      if (rows?.length) return { items: rows, fuente: 'db' as const };
    } catch {
      /* tabla aún no migrada */
    }
    return { items: PLANTILLAS_DEFAULT, fuente: 'default' as const };
  }

  async guardarPlantilla(
    companyIdRaw: number | null,
    body: { tipo: string; nombre: string; renglones: unknown },
  ) {
    const companyId = requireCompanyId(companyIdRaw);
    const tipo = String(body.tipo || '').toUpperCase().slice(0, 1);
    const base = plantillaPorTipo(tipo);
    return this.plantillas().upsert({
      where: { companyId_tipo: { companyId, tipo } },
      create: {
        companyId,
        tipo,
        nombre: (body.nombre || base?.nombre || tipo).slice(0, 120),
        renglones: (body.renglones ?? base?.renglones ?? []) as Prisma.InputJsonValue,
        activa: true,
      },
      update: {
        nombre: (body.nombre || base?.nombre || tipo).slice(0, 120),
        renglones: (body.renglones ?? base?.renglones ?? []) as Prisma.InputJsonValue,
        activa: true,
      },
    });
  }

  async exportPolizasXml(companyIdRaw: number | null, mes: number, anio: number) {
    const companyId = requireCompanyId(companyIdRaw);
    const empresa = await this.prisma.companyProfile.findFirst({
      where: { id: companyId },
      select: { rfc: true },
    });
    const inicio = new Date(Date.UTC(anio, mes - 1, 1));
    const fin = new Date(Date.UTC(anio, mes, 0, 23, 59, 59));
    const entries = await this.prisma.journalEntry.findMany({
      where: { companyId, status: 'POSTED', date: { gte: inicio, lte: fin } },
      include: {
        lines: {
          include: {
            debitAccount: { select: { code: true } },
            creditAccount: { select: { code: true } },
          },
        },
      },
      take: 500,
      orderBy: { date: 'asc' },
    });
    const polizas: PolizaXml[] = entries.map((e) => ({
      numUnIdenPol: e.entryNumber,
      fecha: e.date.toISOString().slice(0, 10),
      concepto: e.description.slice(0, 300),
      lineas: e.lines.flatMap((l) => {
        const out: PolizaXml['lineas'] = [];
        const debe = Number(l.debit);
        const haber = Number(l.credit ?? 0);
        if (debe > 0 && l.debitAccount) {
          out.push({
            numCta: l.debitAccount.code,
            concepto: (l.description || e.description).slice(0, 300),
            debe,
            haber: 0,
          });
        }
        if (haber > 0) {
          const code = l.creditAccount?.code || l.debitAccount.code;
          out.push({
            numCta: code,
            concepto: (l.description || e.description).slice(0, 300),
            debe: 0,
            haber,
          });
        }
        return out;
      }),
    }));
    return buildPolizasPeriodoXml({
      rfc: empresa?.rfc || '',
      mes,
      anio,
      polizas,
    });
  }

  async tableroPpd(companyIdRaw: number | null) {
    const companyId = requireCompanyId(companyIdRaw);
    const facturas = await this.prisma.invoice.findMany({
      where: {
        companyId,
        deletedAt: null,
        type: 'ACCOUNTS_RECEIVABLE',
        satPaymentMethod: 'PPD',
        isCancelled: false,
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        paidAmount: true,
        cfdiUuid: true,
        issueDate: true,
      },
      take: 200,
      orderBy: { issueDate: 'desc' },
    });
    const conSaldo = facturas
      .filter((f) => Number(f.paidAmount) < Number(f.totalAmount) - 0.01)
      .map((f) => ({
        id: f.id,
        folio: f.invoiceNumber,
        saldo: Number(f.totalAmount) - Number(f.paidAmount),
        uuid: f.cfdiUuid,
      }));
    const pagos = await this.prisma.payment.findMany({
      where: { invoice: { companyId, satPaymentMethod: 'PPD' } },
      select: { id: true, amount: true, paymentDate: true, invoiceId: true },
      take: 200,
      orderBy: { paymentDate: 'desc' },
    });
    return {
      facturasConSaldo: conSaldo,
      pagosRecibidos: pagos.length,
      pagosSinRepEmitido: pagos.length,
      nota: 'REP emitido/recibido se completa al ligar CFDI tipo P del buzón SAT.',
    };
  }
}
