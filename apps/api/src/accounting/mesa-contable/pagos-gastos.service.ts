import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccountingService } from '../accounting.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { CfdiInvalidoError, leerCfdi, uuidCorto, type CfdiLeido } from './cfdi-xml.js';
import { diaMexico } from './por-facturar.js';
import {
  CUENTAS,
  cents,
  polizaComprobacionViatico,
  polizaGastoPagado,
  polizaPagoFactura,
  repartirDeducible,
  type RenglonPoliza,
} from './polizas-mesa.js';
import {
  ORIGENES_PAGO_GASTO,
  TIPOS_PAGO_GASTO,
  cuentaDeGasto,
  diaCorto,
  esPendiente,
  estadoBancoLigado,
  estadoCfdiCubierto,
  estadoPoliza,
  mejorSugerencia,
  puntuarSugerencia,
  rangoMes,
  type EstadoCelda,
  type OrigenPagoGasto,
  type PagoGastoItem,
  type SugerenciaBanco,
  type TipoPagoGasto,
} from './pagos-gastos.js';

const PAGADO = ['Pagado', 'pagado', 'PAGADO', 'Paid', 'PAID'];

/** Un movimiento antes de calcularle banco: lo que cada fuente sabe de sí misma. */
interface Crudo {
  origen: OrigenPagoGasto;
  origenId: number;
  fecha: string;
  tipo: TipoPagoGasto;
  tipoEtiqueta: string;
  titulo: string;
  subtitulo: string | null;
  folio: PagoGastoItem['folio'];
  importe: number;
  cfdi: EstadoCelda;
  poliza: EstadoCelda & { journalEntryId: number | null };
  /** false = no se concilia contra banco (p. ej. la recepción: se paga con su factura). */
  conciliable: boolean;
  nombreContraparte: string | null;
  responsable: { id: number; nombre: string } | null;
}

interface Vinculo {
  id: number;
  origen: string;
  origenId: number;
  invoiceId: number | null;
  bankTransactionId: number | null;
  importe: Prisma.Decimal | null;
  invoice: { id: number; cfdiUuid: string | null; emisorName: string | null; totalAmount: Prisma.Decimal; taxAmount: Prisma.Decimal } | null;
  bankTransaction: {
    id: number;
    transactionDate: Date;
    description: string;
    amount: Prisma.Decimal;
    bankAccount: { name: string; accountNumber: string };
  } | null;
}

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
const ultimos4 = (cuenta: string) => `··${String(cuenta).replace(/\D/g, '').slice(-4)}`;

@Injectable()
export class PagosGastosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async listar(companyId: number | null | undefined, q: { mes?: string; tipo?: string; soloPendientes?: string }) {
    const tenantId = requireCompanyId(companyId);
    const periodo = rangoMes(q.mes, diaMexico(new Date()));
    const todos = await this.movimientos(tenantId, periodo.from, periodo.to);

    const conteos = Object.fromEntries([
      ['TODO', todos.length],
      ...TIPOS_PAGO_GASTO.map((t) => [t, todos.filter((i) => i.tipo === t).length]),
    ]) as Record<'TODO' | TipoPagoGasto, number>;

    const tipo = String(q.tipo ?? '').toUpperCase();
    const soloPendientes = q.soloPendientes === '1' || q.soloPendientes === 'true';
    const items = todos
      .filter((i) => !TIPOS_PAGO_GASTO.includes(tipo as TipoPagoGasto) || i.tipo === tipo)
      .filter((i) => !soloPendientes || i.pendiente);

    const entra = todos.filter((i) => i.importe > 0);
    const sale = todos.filter((i) => i.importe < 0);
    const sinCfdi = todos.filter((i) => i.cfdi.estado === 'falta' || i.cfdi.estado === 'parcial');
    const porConciliar = todos.filter((i) => i.banco.estado === 'falta' || i.banco.estado === 'sugerencia');
    const saldo = await this.prisma.bankAccount.aggregate({
      where: { companyId: tenantId, isActive: true },
      _sum: { currentBalance: true },
      _count: { _all: true },
    });

    return {
      periodo,
      resumen: {
        entro: { importe: cents(entra.reduce((s, i) => s + i.importe, 0)), conteo: entra.length },
        salio: { importe: cents(Math.abs(sale.reduce((s, i) => s + i.importe, 0))), conteo: sale.length },
        sinCfdi: { conteo: sinCfdi.length, importe: cents(sinCfdi.reduce((s, i) => s + Math.abs(i.importe), 0)) },
        porConciliar: { conteo: porConciliar.length, conSugerencia: porConciliar.filter((i) => i.banco.sugerencia).length },
        sinPoliza: { conteo: todos.filter((i) => i.poliza.estado === 'falta').length },
        saldoBancos: saldo._count._all ? cents(Number(saldo._sum.currentBalance ?? 0)) : null,
      },
      conteos,
      pendientes: todos.filter((i) => i.pendiente).length,
      items,
    };
  }

  async conteoPendientes(companyId: number | null | undefined): Promise<number> {
    const tenantId = requireCompanyId(companyId);
    const periodo = rangoMes(undefined, diaMexico(new Date()));
    return (await this.movimientos(tenantId, periodo.from, periodo.to)).filter((i) => i.pendiente).length;
  }

  // ───────────────────────── armado ─────────────────────────

  private async vinculos(tenantId: number, origen?: string, origenId?: number): Promise<Vinculo[]> {
    return this.prisma.movimientoVinculo.findMany({
      where: { companyId: tenantId, ...(origen ? { origen, origenId } : {}) },
      select: {
        id: true,
        origen: true,
        origenId: true,
        invoiceId: true,
        bankTransactionId: true,
        importe: true,
        invoice: { select: { id: true, cfdiUuid: true, emisorName: true, totalAmount: true, taxAmount: true } },
        bankTransaction: {
          select: {
            id: true,
            transactionDate: true,
            description: true,
            amount: true,
            bankAccount: { select: { name: true, accountNumber: true } },
          },
        },
      },
    });
  }

  private async movimientos(tenantId: number, from: string, to: string): Promise<PagoGastoItem[]> {
    const crudos = await this.fuentes(tenantId, from, to);
    const vinculos = await this.vinculos(tenantId);
    const porClave = new Map<string, Vinculo[]>();
    for (const v of vinculos) {
      const k = `${v.origen}:${v.origenId}`;
      porClave.set(k, [...(porClave.get(k) ?? []), v]);
    }

    // Candidatos de banco: lo del periodo ±7 días que no está ligado ni conciliado contra otra cosa.
    const desde = new Date(`${from}T00:00:00Z`);
    desde.setUTCDate(desde.getUTCDate() - 7);
    const hasta = new Date(`${to}T00:00:00Z`);
    hasta.setUTCDate(hasta.getUTCDate() + 7);
    const libres = await this.prisma.bankTransaction.findMany({
      where: {
        companyId: tenantId,
        transactionDate: { gte: desde, lte: hasta },
        vinculos: { none: {} },
        reconciliation: { is: null },
      },
      select: { id: true, amount: true, isDebit: true, transactionDate: true, description: true, counterpartyName: true },
      take: 1000,
    });

    return crudos
      .map((c) => this.completar(c, porClave.get(`${c.origen}:${c.origenId}`) ?? [], libres))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.origenId - a.origenId);
  }

  private completar(
    c: Crudo,
    vinculos: Vinculo[],
    libres: Array<{ id: number; amount: Prisma.Decimal; isDebit: boolean; transactionDate: Date; description: string; counterpartyName: string | null }>,
  ): PagoGastoItem {
    const conBanco = vinculos.find((v) => v.bankTransaction);
    let banco: PagoGastoItem['banco'];
    if (!c.conciliable) banco = { estado: 'no_aplica', texto: 'Se paga con su factura', accion: null, sugerencia: null };
    else if (conBanco?.bankTransaction) {
      const t = conBanco.bankTransaction;
      banco = { ...estadoBancoLigado(ymd(t.transactionDate), `${/spei/i.test(t.description) ? 'SPEI' : 'Banco'} ${diaCorto(ymd(t.transactionDate))}`), sugerencia: null };
    } else {
      const sugerencia = mejorSugerencia<SugerenciaBanco>(
        libres.map((t) => ({
          bankTransactionId: t.id,
          score: puntuarSugerencia(
            { importe: c.importe, fecha: c.fecha, nombre: c.nombreContraparte },
            { amount: Number(t.amount), isDebit: t.isDebit, fecha: ymd(t.transactionDate), descripcion: t.description, contraparte: t.counterpartyName },
          ),
          fecha: ymd(t.transactionDate),
          importe: Number(t.amount),
          descripcion: t.description,
        })),
      );
      banco = sugerencia
        ? { estado: 'sugerencia', texto: `Sugerencia ${sugerencia.score} %`, accion: 'LIGAR_BANCO', sugerencia }
        : { estado: 'falta', texto: 'Por conciliar', accion: null, sugerencia: null };
    }

    // El CFDI de viáticos, gastos y compras sale de los XML ligados; el de cobros y pagos ya viene calculado.
    let cfdi = c.cfdi;
    if (c.cfdi.accion === 'LIGAR_XML' && (c.origen === 'VIATICO' || c.origen === 'GASTO' || c.origen === 'RECEPCION')) {
      const conXml = vinculos.filter((v) => v.invoice);
      const cubierto = conXml.reduce((s, v) => s + Number(v.importe ?? v.invoice?.totalAmount ?? 0), 0);
      cfdi = estadoCfdiCubierto(c.importe, cubierto, conXml.length, 'LIGAR_XML');
    }

    const item: PagoGastoItem = {
      clave: `${c.origen}:${c.origenId}`,
      origen: c.origen,
      origenId: c.origenId,
      fecha: c.fecha,
      tipo: c.tipo,
      tipoEtiqueta: c.tipoEtiqueta,
      titulo: c.titulo,
      subtitulo: c.subtitulo,
      folio: c.folio,
      importe: c.importe,
      cfdi,
      banco,
      poliza: c.poliza,
      pendiente: false,
    };
    item.pendiente = esPendiente(item);
    return item;
  }

  private async numerosPoliza(tenantId: number, referencias: string[]) {
    if (!referencias.length) return new Map<string, { id: number; entryNumber: string }>();
    const filas = await this.prisma.journalEntry.findMany({
      where: { companyId: tenantId, reference: { in: referencias }, status: 'POSTED' },
      select: { id: true, entryNumber: true, reference: true },
    });
    return new Map(filas.map((f) => [f.reference ?? '', { id: f.id, entryNumber: f.entryNumber }]));
  }

  private async fuentes(tenantId: number, from: string, to: string): Promise<Crudo[]> {
    const gte = new Date(`${from}T06:00:00Z`); // medianoche de México
    const lte = new Date(`${to}T23:59:59.999-06:00`);
    const gteDia = new Date(`${from}T00:00:00Z`);
    const lteDia = new Date(`${to}T23:59:59.999Z`);

    const [viaticos, gastos, nomina, pagos, recepciones] = await Promise.all([
      this.prisma.viatico.findMany({
        where: {
          companyId: tenantId,
          deletedAt: null,
          estatus: { in: PAGADO },
          OR: [{ fechaComprobacion: { gte, lte } }, { fechaComprobacion: null, fechaSolicitud: { gte, lte } }],
        },
        select: {
          id: true,
          motivo: true,
          categoria: true,
          montoSolicitado: true,
          montoAprobado: true,
          montoComprobado: true,
          fechaSolicitud: true,
          fechaComprobacion: true,
          journalEntryId: true,
          journalEntry: { select: { entryNumber: true, date: true } },
          User: { select: { id: true, nombre: true } },
          Activity: { select: { id: true, anNumber: true } },
        },
        take: 500,
      }),
      this.prisma.expense.findMany({
        where: {
          companyId: tenantId,
          deletedAt: null,
          estatusPago: { in: PAGADO },
          OR: [{ fechaGasto: { gte, lte } }, { fechaGasto: null, fechaSolicitud: { gte, lte } }],
        },
        select: {
          id: true,
          concepto: true,
          categoria: true,
          razonGasto: true,
          montoSolicitado: true,
          fechaGasto: true,
          fechaSolicitud: true,
          journalEntryId: true,
          journalEntry: { select: { entryNumber: true } },
          usuario: { select: { id: true, nombre: true } },
          actividad: { select: { id: true, anNumber: true } },
        },
        take: 500,
      }),
      this.prisma.employeePayment.findMany({
        where: {
          companyId: tenantId,
          deletedAt: null,
          status: { in: PAGADO },
          OR: [{ paidAt: { gte, lte } }, { paidAt: null, periodTo: { gte: gteDia, lte: lteDia } }],
        },
        select: {
          id: true,
          amount: true,
          concepto: true,
          periodFrom: true,
          periodTo: true,
          paidAt: true,
          journalEntryId: true,
          journalEntry: { select: { entryNumber: true } },
          user: { select: { id: true, nombre: true } },
        },
        take: 500,
      }),
      this.prisma.payment.findMany({
        where: { companyId: tenantId, paymentDate: { gte: gteDia, lte: lteDia }, invoice: { deletedAt: null } },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          cfdiPaymentUuid: true,
          invoice: {
            select: {
              id: true,
              type: true,
              invoiceNumber: true,
              cfdiSerie: true,
              cfdiFolio: true,
              cfdiUuid: true,
              satPaymentMethod: true,
              receptorName: true,
              emisorName: true,
              supplier: { select: { name: true } },
              client: { select: { name: true } },
            },
          },
        },
        take: 500,
      }),
      this.prisma.goodsReceipt.findMany({
        where: { companyId: tenantId, receiptDate: { gte: gteDia, lte: lteDia } },
        select: {
          id: true,
          receiptNumber: true,
          receiptDate: true,
          journalEntryId: true,
          journalEntry: { select: { entryNumber: true, totalDebit: true } },
          purchaseOrder: { select: { id: true, poNumber: true, totalAmount: true, supplier: { select: { name: true } } } },
          invoices: { where: { deletedAt: null, isCancelled: false }, select: { id: true, cfdiUuid: true } },
        },
        take: 500,
      }),
    ]);

    const refs = [
      ...viaticos.map((v) => `VIAT-COMP-${v.id}`),
      ...pagos.map((p) => `PAY-${p.id}`),
    ];
    const polizas = await this.numerosPoliza(tenantId, refs);
    const out: Crudo[] = [];

    for (const v of viaticos) {
      const comprobado = v.fechaComprobacion != null && v.montoComprobado != null;
      const entregado = Number(v.montoAprobado ?? v.montoSolicitado);
      const comp = polizas.get(`VIAT-COMP-${v.id}`);
      const fecha = diaMexico(v.fechaComprobacion ?? v.journalEntry?.date ?? v.fechaSolicitud);
      out.push({
        origen: 'VIATICO',
        origenId: v.id,
        fecha,
        tipo: 'VIATICO',
        tipoEtiqueta: comprobado ? 'Viático comprobado' : 'Viático entregado',
        titulo: [v.User?.nombre, v.motivo].filter(Boolean).join(' · ') || `Viático #${v.id}`,
        subtitulo: v.categoria ?? null,
        folio: v.Activity ? { texto: v.Activity.anNumber, href: null } : null,
        importe: -cents(entregado),
        cfdi: comprobado
          ? { estado: 'falta', texto: 'Sin CFDI', accion: 'LIGAR_XML' }
          : { estado: 'espera', texto: 'Por comprobar', accion: null },
        poliza: comprobado
          ? { ...estadoPoliza(comp?.entryNumber ?? null), journalEntryId: comp?.id ?? null }
          : {
              ...estadoPoliza(v.journalEntry ? `${v.journalEntry.entryNumber} · por comprobar` : null),
              journalEntryId: v.journalEntryId,
            },
        conciliable: true,
        nombreContraparte: v.User?.nombre ?? null,
        responsable: v.User ? { id: v.User.id, nombre: v.User.nombre } : null,
      });
    }

    for (const g of gastos) {
      out.push({
        origen: 'GASTO',
        origenId: g.id,
        fecha: diaMexico(g.fechaGasto ?? g.fechaSolicitud),
        tipo: 'GASTO',
        tipoEtiqueta: 'Gasto',
        titulo: g.concepto || g.categoria || g.razonGasto || `Gasto #${g.id}`,
        subtitulo: g.usuario?.nombre ?? null,
        folio: g.actividad ? { texto: g.actividad.anNumber, href: null } : null,
        importe: -cents(Number(g.montoSolicitado)),
        cfdi: { estado: 'falta', texto: 'Sin CFDI', accion: 'LIGAR_XML' },
        poliza: { ...estadoPoliza(g.journalEntry?.entryNumber ?? null), journalEntryId: g.journalEntryId },
        conciliable: true,
        nombreContraparte: null,
        responsable: g.usuario ? { id: g.usuario.id, nombre: g.usuario.nombre } : null,
      });
    }

    for (const n of nomina) {
      const fecha = n.paidAt ? diaMexico(n.paidAt) : ymd(n.periodTo);
      out.push({
        origen: 'NOMINA',
        origenId: n.id,
        fecha,
        tipo: 'NOMINA',
        tipoEtiqueta: 'Nómina',
        titulo: n.user?.nombre ?? `Pago #${n.id}`,
        subtitulo: n.concepto || `${diaCorto(ymd(n.periodFrom))} – ${diaCorto(ymd(n.periodTo))}`,
        folio: null,
        importe: -cents(Number(n.amount)),
        cfdi: { estado: 'no_aplica', texto: 'Recibo de nómina aparte', accion: null },
        poliza: { ...estadoPoliza(n.journalEntry?.entryNumber ?? null), journalEntryId: n.journalEntryId },
        conciliable: true,
        nombreContraparte: n.user?.nombre ?? null,
        responsable: n.user ? { id: n.user.id, nombre: n.user.nombre } : null,
      });
    }

    for (const p of pagos) {
      const f = p.invoice;
      const cobro = f.type === 'ACCOUNTS_RECEIVABLE';
      const folio = f.cfdiSerie && f.cfdiFolio ? `${f.cfdiSerie}-${f.cfdiFolio}` : f.invoiceNumber;
      const pol = polizas.get(`PAY-${p.id}`);
      let cfdi: EstadoCelda;
      if (cobro) {
        if (!f.cfdiUuid) cfdi = { estado: 'falta', texto: 'Factura sin timbrar', accion: null };
        else if (f.satPaymentMethod === 'PPD' && !p.cfdiPaymentUuid) {
          cfdi = { estado: 'falta', texto: 'Falta complemento', accion: 'EMITIR_COMPLEMENTO' };
        } else cfdi = { estado: 'ok', texto: uuidCorto(p.cfdiPaymentUuid ?? f.cfdiUuid), accion: null };
      } else {
        cfdi = f.cfdiUuid
          ? { estado: 'ok', texto: uuidCorto(f.cfdiUuid), accion: null }
          : { estado: 'falta', texto: 'Sin CFDI', accion: 'LIGAR_XML' };
      }
      const contraparte = cobro ? f.receptorName || f.client?.name : f.supplier?.name || f.emisorName;
      out.push({
        origen: 'PAGO',
        origenId: p.id,
        fecha: ymd(p.paymentDate),
        tipo: cobro ? 'COBRO' : 'PROVEEDOR',
        tipoEtiqueta: cobro ? 'Cobro' : 'Pago a proveedor',
        titulo: contraparte || (cobro ? 'Cliente' : 'Proveedor'),
        subtitulo: null,
        folio: { texto: folio, href: `/erp/invoicing/${f.id}` },
        importe: cobro ? cents(Number(p.amount)) : -cents(Number(p.amount)),
        cfdi,
        poliza: { ...estadoPoliza(pol?.entryNumber ?? null), journalEntryId: pol?.id ?? null },
        conciliable: true,
        nombreContraparte: contraparte ?? null,
        responsable: null,
      });
    }

    for (const r of recepciones) {
      const conXml = r.invoices.some((i) => i.cfdiUuid);
      out.push({
        origen: 'RECEPCION',
        origenId: r.id,
        fecha: ymd(r.receiptDate),
        tipo: 'PROVEEDOR',
        tipoEtiqueta: 'Compra',
        titulo: r.purchaseOrder.supplier?.name ?? 'Proveedor',
        subtitulo: `Recepción ${r.receiptNumber}`,
        folio: { texto: r.purchaseOrder.poNumber, href: null },
        importe: -cents(Number(r.journalEntry?.totalDebit ?? r.purchaseOrder.totalAmount ?? 0)),
        cfdi: conXml ? { estado: 'ok', texto: '1 CFDI', accion: null } : { estado: 'falta', texto: 'Sin CFDI', accion: 'LIGAR_XML' },
        poliza: { ...estadoPoliza(r.journalEntry?.entryNumber ?? null, 'Sin póliza de recepción'), journalEntryId: r.journalEntryId, accion: null },
        conciliable: false,
        nombreContraparte: r.purchaseOrder.supplier?.name ?? null,
        responsable: null,
      });
    }
    return out;
  }

  // ───────────────────────── detalle ─────────────────────────

  private validarOrigen(origen: string): OrigenPagoGasto {
    const o = String(origen ?? '').toUpperCase() as OrigenPagoGasto;
    if (!ORIGENES_PAGO_GASTO.includes(o)) throw new BadRequestException(`Origen inválido: ${origen}`);
    return o;
  }

  /** El movimiento tal como sale en la tabla, buscándolo en su mes. */
  private async item(tenantId: number, origen: OrigenPagoGasto, origenId: number): Promise<{ item: PagoGastoItem; crudo: Crudo }> {
    const fecha = await this.fechaDe(tenantId, origen, origenId);
    const periodo = rangoMes(fecha.slice(0, 7), fecha);
    const crudos = await this.fuentes(tenantId, periodo.from, periodo.to);
    const crudo = crudos.find((c) => c.origen === origen && c.origenId === origenId);
    if (!crudo) throw new NotFoundException('Movimiento no encontrado o todavía no pagado');
    const vinculos = await this.vinculos(tenantId, origen, origenId);
    const libres = await this.prisma.bankTransaction.findMany({
      where: { companyId: tenantId, vinculos: { none: {} }, reconciliation: { is: null } },
      select: { id: true, amount: true, isDebit: true, transactionDate: true, description: true, counterpartyName: true },
      orderBy: { transactionDate: 'desc' },
      take: 500,
    });
    return { item: this.completar(crudo, vinculos, libres), crudo };
  }

  private async fechaDe(tenantId: number, origen: OrigenPagoGasto, id: number): Promise<string> {
    const where = { id, companyId: tenantId };
    switch (origen) {
      case 'VIATICO': {
        const v = await this.prisma.viatico.findFirst({ where, select: { fechaComprobacion: true, fechaSolicitud: true } });
        if (!v) break;
        return diaMexico(v.fechaComprobacion ?? v.fechaSolicitud);
      }
      case 'GASTO': {
        const g = await this.prisma.expense.findFirst({ where, select: { fechaGasto: true, fechaSolicitud: true } });
        if (!g) break;
        return diaMexico(g.fechaGasto ?? g.fechaSolicitud);
      }
      case 'NOMINA': {
        const n = await this.prisma.employeePayment.findFirst({ where, select: { paidAt: true, periodTo: true } });
        if (!n) break;
        return n.paidAt ? diaMexico(n.paidAt) : ymd(n.periodTo);
      }
      case 'PAGO': {
        const p = await this.prisma.payment.findFirst({ where, select: { paymentDate: true } });
        if (!p) break;
        return ymd(p.paymentDate);
      }
      case 'RECEPCION': {
        const r = await this.prisma.goodsReceipt.findFirst({ where, select: { receiptDate: true } });
        if (!r) break;
        return ymd(r.receiptDate);
      }
    }
    throw new NotFoundException('Movimiento no encontrado');
  }

  async detalle(companyId: number | null | undefined, origenRaw: string, origenId: number) {
    const tenantId = requireCompanyId(companyId);
    const origen = this.validarOrigen(origenRaw);
    const { item, crudo } = await this.item(tenantId, origen, origenId);
    const vinculos = await this.vinculos(tenantId, origen, origenId);
    const comprobantes = vinculos
      .filter((v) => v.invoice)
      .map((v) => ({
        vinculoId: v.id,
        invoiceId: v.invoice!.id,
        texto: v.invoice!.emisorName || 'CFDI recibido',
        uuidCorto: uuidCorto(v.invoice!.cfdiUuid),
        iva: cents(Number(v.invoice!.taxAmount)),
        total: cents(Number(v.importe ?? v.invoice!.totalAmount)),
      }));
    const cubierto = cents(comprobantes.reduce((s, c) => s + c.total, 0));

    const montos: Array<{ etiqueta: string; importe: number }> = [];
    let sinFactura: { importe: number; texto: string } | null = null;
    let propuesta: RenglonPoliza[] = [];
    let registrada: { id: number; numero: string } | null = null;
    let puedeRegistrar = false;
    let encabezado = item.tipoEtiqueta;

    if (origen === 'VIATICO') {
      const v = await this.prisma.viatico.findFirstOrThrow({
        where: { id: origenId, companyId: tenantId },
        select: { montoAprobado: true, montoSolicitado: true, montoComprobado: true, fechaComprobacion: true, Activity: { select: { anNumber: true } } },
      });
      const entregado = Number(v.montoAprobado ?? v.montoSolicitado);
      const comprobado = Number(v.montoComprobado ?? 0);
      encabezado = `${item.tipoEtiqueta}${v.Activity ? ` · ${v.Activity.anNumber}` : ''}`;
      montos.push(
        { etiqueta: 'Entregado', importe: cents(entregado) },
        { etiqueta: 'Comprobado', importe: cents(comprobado) },
        { etiqueta: 'Diferencia', importe: cents(entregado - comprobado) },
      );
      if (v.fechaComprobacion) {
        const cfdis = comprobantes.map((c) => ({ total: c.total, iva: c.iva }));
        const reparto = repartirDeducible(comprobado, cfdis);
        if (reparto.noDeducible > 0) sinFactura = { importe: reparto.noDeducible, texto: 'Solo ticket · no deducible' };
        propuesta = polizaComprobacionViatico({ entregado, comprobado, cfdis });
        puedeRegistrar = item.poliza.estado === 'falta';
      }
    } else if (origen === 'GASTO') {
      const g = await this.prisma.expense.findFirstOrThrow({
        where: { id: origenId, companyId: tenantId },
        select: { montoSolicitado: true, categoria: true },
      });
      const importe = Number(g.montoSolicitado);
      montos.push({ etiqueta: 'Importe', importe: cents(importe) }, { etiqueta: 'Con CFDI', importe: cubierto });
      const cfdis = comprobantes.map((c) => ({ total: c.total, iva: c.iva }));
      const reparto = repartirDeducible(importe, cfdis);
      if (reparto.noDeducible > 0 && cfdis.length) sinFactura = { importe: reparto.noDeducible, texto: 'Sin factura · no deducible' };
      propuesta = polizaGastoPagado({ importe, cuentaGasto: cuentaDeGasto(g.categoria), cfdis });
      puedeRegistrar = item.poliza.estado === 'falta';
    } else if (origen === 'PAGO') {
      const p = await this.prisma.payment.findFirstOrThrow({
        where: { id: origenId, companyId: tenantId },
        select: { amount: true, invoice: { select: { type: true, totalAmount: true, taxAmount: true, satPaymentMethod: true } } },
      });
      montos.push({ etiqueta: 'Importe', importe: cents(Number(p.amount)) });
      propuesta = polizaPagoFactura({
        tipo: p.invoice.type,
        importe: Number(p.amount),
        facturaTotal: Number(p.invoice.totalAmount),
        facturaIva: Number(p.invoice.taxAmount),
        metodoPago: p.invoice.satPaymentMethod,
      });
      puedeRegistrar = item.poliza.estado === 'falta';
    } else {
      montos.push({ etiqueta: 'Importe', importe: Math.abs(item.importe) });
      puedeRegistrar = origen === 'NOMINA' && item.poliza.estado === 'falta';
    }

    if (item.poliza.estado === 'ok' && item.poliza.journalEntryId) {
      registrada = { id: item.poliza.journalEntryId, numero: item.poliza.texto };
    }

    const nombres = await this.nombresCuentas(tenantId, propuesta.map((r) => r.codigo));
    const conBanco = vinculos.find((v) => v.bankTransaction);
    const sugerencias = crudo.conciliable && !conBanco ? await this.sugerencias(tenantId, item) : [];

    return {
      item,
      encabezado,
      montos,
      comprobantes,
      sinFactura,
      aceptaXml: origen === 'VIATICO' || origen === 'GASTO' || origen === 'RECEPCION' || (origen === 'PAGO' && item.tipo === 'PROVEEDOR' && item.cfdi.estado !== 'ok'),
      banco: {
        vinculado: conBanco?.bankTransaction
          ? {
              vinculoId: conBanco.id,
              bankTransactionId: conBanco.bankTransaction.id,
              texto: `${conBanco.bankTransaction.description} · ${conBanco.bankTransaction.bankAccount.name} ${ultimos4(conBanco.bankTransaction.bankAccount.accountNumber)}`,
              importe: cents(Number(conBanco.bankTransaction.amount)),
            }
          : null,
        sugerencias,
      },
      polizaPropuesta: propuesta.map((r) => ({ cuenta: `${r.codigo} ${nombres.get(r.codigo) ?? r.etiqueta}`, debe: r.debe, haber: r.haber })),
      polizaRegistrada: registrada,
      puedeRegistrarPoliza: puedeRegistrar,
      responsable: crudo.responsable,
    };
  }

  private async sugerencias(tenantId: number, item: PagoGastoItem) {
    const centro = new Date(`${item.fecha}T00:00:00Z`);
    const desde = new Date(centro.getTime() - 7 * 86_400_000);
    const hasta = new Date(centro.getTime() + 7 * 86_400_000);
    const libres = await this.prisma.bankTransaction.findMany({
      where: { companyId: tenantId, transactionDate: { gte: desde, lte: hasta }, vinculos: { none: {} }, reconciliation: { is: null } },
      select: {
        id: true,
        amount: true,
        isDebit: true,
        transactionDate: true,
        description: true,
        counterpartyName: true,
        bankAccount: { select: { name: true, accountNumber: true } },
      },
      take: 300,
    });
    return libres
      .map((t) => ({
        bankTransactionId: t.id,
        score: puntuarSugerencia(
          { importe: item.importe, fecha: item.fecha, nombre: item.titulo },
          { amount: Number(t.amount), isDebit: t.isDebit, fecha: ymd(t.transactionDate), descripcion: t.description, contraparte: t.counterpartyName },
        ),
        fecha: ymd(t.transactionDate),
        importe: cents(Number(t.amount)),
        descripcion: t.description,
        cuenta: `${t.bankAccount.name} ${ultimos4(t.bankAccount.accountNumber)}`,
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  private async nombresCuentas(tenantId: number, codigos: string[]) {
    if (!codigos.length) return new Map<string, string>();
    const cuentas = await this.prisma.account.findMany({
      where: { companyId: tenantId, code: { in: [...new Set(codigos)] } },
      select: { code: true, name: true },
    });
    return new Map(cuentas.map((c) => [c.code, c.name]));
  }

  // ───────────────────────── acciones ─────────────────────────

  async ligarCfdi(
    companyId: number | null | undefined,
    origenRaw: string,
    origenId: number,
    dto: { xml?: string; uuid?: string },
    userId: number,
  ) {
    const tenantId = requireCompanyId(companyId);
    const origen = this.validarOrigen(origenRaw);
    const { item } = await this.item(tenantId, origen, origenId);

    let cfdi: CfdiLeido | null = null;
    if (dto.xml?.trim()) {
      try {
        cfdi = leerCfdi(dto.xml);
      } catch (e) {
        if (e instanceof CfdiInvalidoError) throw new BadRequestException(e.message);
        throw e;
      }
    }
    const uuid = (cfdi?.uuid ?? String(dto.uuid ?? '')).trim().toUpperCase();
    if (!uuid) throw new BadRequestException('Sube el XML o escribe el UUID del CFDI.');

    const existente = await this.prisma.invoice.findFirst({
      where: { cfdiUuid: { equals: uuid, mode: 'insensitive' } },
      select: { id: true, companyId: true, totalAmount: true },
    });
    if (existente && existente.companyId !== tenantId) {
      throw new BadRequestException('Ese CFDI ya está registrado en otra empresa.');
    }
    if (!existente && !cfdi) throw new BadRequestException('No encuentro ese UUID: sube el XML.');

    if (cfdi) {
      const emisor = await this.accounting.getInvoiceIssuerProfile(tenantId);
      const rfcEmpresa = String(emisor.emisorRfc ?? '').trim().toUpperCase();
      if (rfcEmpresa && cfdi.receptor.rfc !== rfcEmpresa) {
        throw new BadRequestException(`Este CFDI está a nombre de ${cfdi.receptor.rfc}, no de la empresa (${rfcEmpresa}).`);
      }
    }

    // Un pago a proveedor ya tiene su factura: el XML la completa en vez de crear otra.
    if (origen === 'PAGO' && item.tipo === 'PROVEEDOR') {
      if (!cfdi) throw new BadRequestException('Sube el XML del proveedor.');
      const pago = await this.prisma.payment.findFirstOrThrow({
        where: { id: origenId, companyId: tenantId },
        select: { invoice: { select: { id: true, cfdiUuid: true, totalAmount: true } } },
      });
      if (pago.invoice.cfdiUuid) throw new BadRequestException('Esa factura ya tiene su CFDI.');
      if (Math.abs(Number(pago.invoice.totalAmount) - cfdi.total) > 1) {
        throw new BadRequestException(
          `El CFDI es por $${cfdi.total.toFixed(2)} y la factura registrada por $${Number(pago.invoice.totalAmount).toFixed(2)}.`,
        );
      }
      await this.prisma.invoice.update({
        where: { id: pago.invoice.id },
        data: this.datosCfdi(cfdi, dto.xml!),
      });
      return this.detalle(tenantId, origen, origenId);
    }

    let invoiceId = existente?.id ?? null;
    if (!invoiceId && cfdi) {
      const proveedor = await this.prisma.supplier.findFirst({
        where: { companyId: tenantId, rfc: cfdi.emisor.rfc },
        select: { id: true },
      });
      const recepcion =
        origen === 'RECEPCION'
          ? await this.prisma.goodsReceipt.findFirst({ where: { id: origenId, companyId: tenantId }, select: { id: true, purchaseOrderId: true } })
          : null;
      // Lo de viáticos y gastos ya se pagó con el movimiento: el CFDI entra saldado. El de una
      // compra queda por pagar (cuentas por pagar) hasta que se le registre su pago.
      const pagado = origen !== 'RECEPCION';
      const fecha = new Date(`${cfdi.fecha || diaMexico(new Date())}T12:00:00Z`);
      const creado = await this.prisma.invoice.create({
        data: {
          invoiceNumber: `CFDI-${uuid.slice(0, 8)}`,
          type: 'ACCOUNTS_PAYABLE',
          status: pagado ? 'PAID' : 'SENT',
          issueDate: fecha,
          dueDate: pagado ? fecha : new Date(fecha.getTime() + 30 * 86_400_000),
          subtotal: new Prisma.Decimal(cents(cfdi.subtotal - cfdi.descuento)),
          taxAmount: new Prisma.Decimal(cents(cfdi.iva + cfdi.otrosTraslados)),
          totalAmount: new Prisma.Decimal(cfdi.total),
          paidAmount: new Prisma.Decimal(pagado ? cfdi.total : 0),
          currency: cfdi.moneda || 'MXN',
          notes: `CFDI recibido · ${item.tipoEtiqueta} ${item.folio?.texto ?? `#${origenId}`}`,
          supplierId: proveedor?.id ?? null,
          goodsReceiptId: recepcion?.id ?? null,
          purchaseOrderId: recepcion?.purchaseOrderId ?? null,
          createdById: userId,
          companyId: tenantId,
          ...this.datosCfdi(cfdi, dto.xml!),
        },
        select: { id: true },
      });
      invoiceId = creado.id;
    }

    const importe = cfdi?.total ?? Number(existente?.totalAmount ?? 0);
    await this.prisma.movimientoVinculo.upsert({
      where: { companyId_origen_origenId_invoiceId: { companyId: tenantId, origen, origenId, invoiceId: invoiceId! } },
      create: { companyId: tenantId, origen, origenId, invoiceId, importe: new Prisma.Decimal(importe), createdById: userId },
      update: {},
    });
    return this.detalle(tenantId, origen, origenId);
  }

  private datosCfdi(c: CfdiLeido, xml: string) {
    return {
      cfdiUuid: c.uuid,
      cfdiXml: xml,
      cfdiVersion: c.version || '4.0',
      cfdiSerie: c.serie,
      cfdiFolio: c.folio,
      emisorRfc: c.emisor.rfc,
      emisorName: c.emisor.nombre,
      receptorRfc: c.receptor.rfc,
      receptorName: c.receptor.nombre,
      receptorZipCode: c.receptor.cp,
    };
  }

  async quitarVinculo(companyId: number | null | undefined, vinculoId: number) {
    const tenantId = requireCompanyId(companyId);
    const v = await this.prisma.movimientoVinculo.findFirst({ where: { id: vinculoId, companyId: tenantId } });
    if (!v) throw new NotFoundException('Vínculo no encontrado');
    await this.prisma.movimientoVinculo.delete({ where: { id: v.id } });
    return { ok: true };
  }

  async ligarBanco(
    companyId: number | null | undefined,
    origenRaw: string,
    origenId: number,
    bankTransactionId: number,
    userId: number,
  ) {
    const tenantId = requireCompanyId(companyId);
    const origen = this.validarOrigen(origenRaw);
    const { item, crudo } = await this.item(tenantId, origen, origenId);
    if (!crudo.conciliable) throw new BadRequestException('Este movimiento se concilia con el pago de su factura.');
    if (item.banco.estado === 'ok') throw new BadRequestException('Este movimiento ya está ligado a su banco.');

    const txn = await this.prisma.bankTransaction.findFirst({
      where: { id: bankTransactionId, companyId: tenantId },
      select: { id: true, amount: true, isDebit: true, reconciliation: { select: { id: true } }, _count: { select: { vinculos: true } } },
    });
    if (!txn) throw new NotFoundException('Movimiento de banco no encontrado');
    if (txn._count.vinculos > 0) throw new BadRequestException('Ese movimiento de banco ya está ligado a otro pago o gasto.');
    if (txn.isDebit !== item.importe < 0 || Math.abs(Math.abs(item.importe) - Number(txn.amount)) > 0.01) {
      throw new BadRequestException(
        `El movimiento de banco es por $${Number(txn.amount).toFixed(2)} y este ${item.tipoEtiqueta.toLowerCase()} por $${Math.abs(item.importe).toFixed(2)}.`,
      );
    }

    await this.prisma.movimientoVinculo.create({
      data: { companyId: tenantId, origen, origenId, bankTransactionId: txn.id, createdById: userId },
    });
    if (!txn.reconciliation) {
      await this.accounting.reconcileTransaction(
        txn.id,
        { matchedAmount: Number(txn.amount), notes: `${item.tipoEtiqueta} ${item.folio?.texto ?? `#${origenId}`} (Mesa contable)` },
        userId,
        tenantId,
      );
    }
    return this.detalle(tenantId, origen, origenId);
  }

  async registrarPoliza(companyId: number | null | undefined, origenRaw: string, origenId: number, userId: number) {
    const tenantId = requireCompanyId(companyId);
    const origen = this.validarOrigen(origenRaw);
    const det = await this.detalle(tenantId, origen, origenId);
    if (!det.puedeRegistrarPoliza) throw new BadRequestException('Este movimiento ya tiene su póliza o no lleva una aquí.');

    if (origen === 'NOMINA') {
      const n = await this.prisma.employeePayment.findFirstOrThrow({
        where: { id: origenId, companyId: tenantId },
        select: { amount: true, paidAt: true, periodTo: true, concepto: true, user: { select: { nombre: true } } },
      });
      const poliza = await this.accounting.postOperationalDisbursement({
        kind: 'payroll',
        entityId: origenId,
        amount: Number(n.amount),
        date: n.paidAt ?? n.periodTo,
        description: `Pago a ${n.user?.nombre ?? 'empleado'}${n.concepto ? ` · ${n.concepto}` : ''}`,
        userId,
        companyId: tenantId,
      });
      await this.prisma.employeePayment.update({ where: { id: origenId }, data: { journalEntryId: poliza.id } });
      return this.detalle(tenantId, origen, origenId);
    }

    // Lo propuesto en el detalle ya trae los códigos del catálogo; se vuelve a armar para no
    // confiar en lo que mande la pantalla.
    let renglones: RenglonPoliza[];
    let referencia: string;
    let descripcion: string;
    let fecha: string;
    if (origen === 'VIATICO') {
      const v = await this.prisma.viatico.findFirstOrThrow({
        where: { id: origenId, companyId: tenantId },
        select: {
          montoAprobado: true,
          montoSolicitado: true,
          montoComprobado: true,
          fechaComprobacion: true,
          journalEntry: { select: { lines: { select: { debitAccount: { select: { code: true } }, debit: true } } } },
          User: { select: { nombre: true } },
        },
      });
      if (!v.fechaComprobacion) throw new BadRequestException('El viático todavía no se comprueba.');
      // Un viático contabilizado con el esquema de antes (directo a gasto) no se salda contra
      // «por comprobar»: duplicaría el gasto.
      const entregaAGasto = v.journalEntry?.lines.some((l) => l.debitAccount.code === CUENTAS.viaticos && Number(l.debit) > 0);
      if (entregaAGasto) {
        throw new BadRequestException('Este viático se contabilizó al entregarse directo a gasto (esquema anterior): regístralo a mano.');
      }
      renglones = polizaComprobacionViatico({
        entregado: Number(v.montoAprobado ?? v.montoSolicitado),
        comprobado: Number(v.montoComprobado ?? 0),
        cfdis: det.comprobantes.map((c) => ({ total: c.total, iva: c.iva })),
      });
      referencia = `VIAT-COMP-${origenId}`;
      descripcion = `Comprobación de viático #${origenId}${v.User?.nombre ? ` · ${v.User.nombre}` : ''}`;
      fecha = diaMexico(v.fechaComprobacion);
    } else if (origen === 'GASTO') {
      const g = await this.prisma.expense.findFirstOrThrow({
        where: { id: origenId, companyId: tenantId },
        select: { montoSolicitado: true, categoria: true, concepto: true, fechaGasto: true, fechaSolicitud: true },
      });
      renglones = polizaGastoPagado({
        importe: Number(g.montoSolicitado),
        cuentaGasto: cuentaDeGasto(g.categoria),
        cfdis: det.comprobantes.map((c) => ({ total: c.total, iva: c.iva })),
      });
      referencia = `EXP-PAY-${origenId}`;
      descripcion = `Gasto #${origenId}${g.concepto ? ` · ${g.concepto}` : ''}`;
      fecha = diaMexico(g.fechaGasto ?? g.fechaSolicitud);
    } else if (origen === 'PAGO') {
      const p = await this.prisma.payment.findFirstOrThrow({
        where: { id: origenId, companyId: tenantId },
        select: { amount: true, paymentDate: true, invoice: { select: { type: true, invoiceNumber: true, totalAmount: true, taxAmount: true, satPaymentMethod: true } } },
      });
      renglones = polizaPagoFactura({
        tipo: p.invoice.type,
        importe: Number(p.amount),
        facturaTotal: Number(p.invoice.totalAmount),
        facturaIva: Number(p.invoice.taxAmount),
        metodoPago: p.invoice.satPaymentMethod,
      });
      referencia = `PAY-${origenId}`;
      descripcion = `${p.invoice.type === 'ACCOUNTS_RECEIVABLE' ? 'Cobro' : 'Pago proveedor'} factura ${p.invoice.invoiceNumber}`;
      fecha = ymd(p.paymentDate);
    } else {
      throw new BadRequestException('Este movimiento no lleva póliza desde aquí.');
    }

    const poliza = await this.accounting.registrarPolizaMesa(referencia, descripcion, fecha, renglones, userId, tenantId);
    if (origen === 'GASTO') {
      await this.prisma.expense.update({ where: { id: origenId }, data: { journalEntryId: poliza.id } });
    }
    return this.detalle(tenantId, origen, origenId);
  }
}
