import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PacService } from '../../pac/pac.service.js';
import { AccountingService } from '../accounting.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { ACTIVITY_STATUS, statusVariants } from '../../activities/activity-status.js';
import { factorMargen } from '../../cotizaciones/cotizacion-totals.js';
import {
  ANTICIPO_SAT,
  ORIGENES_POR_FACTURAR,
  cents,
  conceptosDesdeCotizacion,
  diaMexico,
  diasHabiles,
  diasNaturales,
  fechaCorta,
  importeAnticipo,
  nombreMes,
  ordenarPorFacturar,
  pendientesReceptor,
  semaforoFacturacion,
  venceComplemento,
  type OrigenPorFacturar,
  type Pendiente,
  type PorFacturarItem,
} from './por-facturar.js';

/** Lo que se busca hacia atrás: más viejo que esto ya no es «por facturar», es un pendiente perdido. */
const VENTANA_DIAS = 120;

const CLIENTE_FACTURACION = {
  id: true,
  name: true,
  legalName: true,
  taxId: true,
  fiscalZipCode: true,
  fiscalRegime: true,
  billingEmail: true,
} satisfies Prisma.SalesClientSelect;

type ClienteFacturacion = Prisma.SalesClientGetPayload<{ select: typeof CLIENTE_FACTURACION }>;

const FACTURA_LIGADA = {
  id: true,
  status: true,
  esAnticipo: true,
  isCancelled: true,
  deletedAt: true,
  invoiceNumber: true,
  cfdiSerie: true,
  cfdiFolio: true,
  cfdiUuid: true,
  totalAmount: true,
  subtotal: true,
} satisfies Prisma.InvoiceSelect;

type FacturaLigada = Prisma.InvoiceGetPayload<{ select: typeof FACTURA_LIGADA }>;

export interface Timbrado {
  conectado: boolean;
  proveedor: string;
  mensaje: string | null;
}

export function folioFactura(f: { cfdiSerie?: string | null; cfdiFolio?: string | null; invoiceNumber: string }): string {
  return f.cfdiSerie && f.cfdiFolio ? `${f.cfdiSerie}-${f.cfdiFolio}` : f.invoiceNumber;
}

const activas = (facturas: FacturaLigada[]) => facturas.filter((f) => !f.deletedAt && !f.isCancelled);

@Injectable()
export class PorFacturarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly pac: PacService,
  ) {}

  timbrado(): Timbrado {
    const proveedor = this.pac.provider;
    const conectado = !(this.pac.isProduction && proveedor === 'mock');
    return {
      conectado,
      proveedor,
      mensaje: conectado
        ? proveedor === 'mock'
          ? 'Timbrado de prueba: el UUID no es real.'
          : null
        : 'El timbrado todavía no está conectado. Puedes preparar y revisar cada CFDI; se timbra en cuanto administración contrate el PAC y cargue el sello digital (CSD).',
    };
  }

  async listar(companyId: number | null | undefined, origen?: string) {
    const tenantId = requireCompanyId(companyId);
    const ahora = new Date();
    const hoy = diaMexico(ahora);
    const desde = new Date(ahora.getTime() - VENTANA_DIAS * 86_400_000);

    const descartes = await this.prisma.porFacturarDescarte.findMany({
      where: { companyId: tenantId },
      select: { origen: true, origenId: true },
    });
    const descartado = new Set(descartes.map((d) => `${d.origen}:${d.origenId}`));

    const [servicios, cotizaciones, pedidos, complementos] = await Promise.all([
      this.servicios(tenantId, desde, hoy),
      this.cotizaciones(tenantId, hoy),
      this.pedidos(tenantId, hoy),
      this.complementos(tenantId, hoy),
    ]);

    // Una cotización cuyo servicio ya terminó se factura desde el servicio, no dos veces.
    const cotizacionesDeServicios = new Set(servicios.map((s) => s.cotizacionId).filter((id): id is number => id != null));
    const todos = ordenarPorFacturar(
      [
        ...servicios.map((s) => s.item),
        ...cotizaciones.filter((c) => !cotizacionesDeServicios.has(c.origenId)),
        ...pedidos,
        ...complementos,
      ].filter((i) => !descartado.has(`${i.origen}:${i.origenId}`)),
    );

    const conteos = Object.fromEntries([
      ['TODO', todos.length],
      ...ORIGENES_POR_FACTURAR.map((o) => [o, todos.filter((i) => i.origen === o).length]),
    ]) as Record<'TODO' | OrigenPorFacturar, number>;

    const filtro = String(origen ?? '').toUpperCase();
    const items = ORIGENES_POR_FACTURAR.includes(filtro as OrigenPorFacturar)
      ? todos.filter((i) => i.origen === filtro)
      : todos;

    const neto = (i: PorFacturarItem) => (i.importe ?? 0) - (i.menos?.importe ?? 0);
    const sumar = (lista: PorFacturarItem[]) => cents(lista.reduce((s, i) => s + neto(i), 0));
    const anticipos = todos.filter((i) => i.origen === 'ANTICIPO');
    const compl = todos.filter((i) => i.origen === 'COMPLEMENTO');
    const facturables = todos.filter((i) => i.origen !== 'COMPLEMENTO');
    const masAntiguo = facturables[0] ?? null;

    const [mesY, mesM] = hoy.split('-').map(Number);
    const inicioMes = new Date(Date.UTC(mesY, mesM - 1, 1, 6));
    const facturadoMes = await this.prisma.invoice.aggregate({
      where: {
        companyId: tenantId,
        type: 'ACCOUNTS_RECEIVABLE',
        deletedAt: null,
        isCancelled: false,
        cfdiUuid: { not: null },
        cfdiStampDate: { gte: inicioMes },
      },
      _sum: { totalAmount: true },
      _count: { _all: true },
    });

    return {
      resumen: {
        importe: sumar(facturables),
        conceptos: facturables.length,
        clientes: new Set(facturables.map((i) => i.cliente.id ?? i.cliente.nombre)).size,
        masAntiguoDias: masAntiguo?.diasEsperando ?? null,
        masAntiguoHabiles: masAntiguo?.diasHabiles ?? null,
        anticipos: { conteo: anticipos.length, importe: sumar(anticipos) },
        complementos: { conteo: compl.length, importe: sumar(compl) },
        facturadoMes: {
          importe: cents(Number(facturadoMes._sum.totalAmount ?? 0)),
          conteo: facturadoMes._count._all,
          // La cancelación «en trámite» llega con el PAC real; hoy el sistema no la distingue.
          cancelacionesPendientes: 0,
          mes: nombreMes(mesM),
        },
      },
      conteos,
      items,
      timbrado: this.timbrado(),
    };
  }

  async resumenConteo(companyId: number | null | undefined): Promise<number> {
    const r = await this.listar(companyId);
    return r.conteos.TODO;
  }

  // ───────────────────────── fuentes ─────────────────────────

  private base(
    origen: OrigenPorFacturar,
    origenId: number,
    listoDesde: string,
    hoy: string,
  ): Pick<PorFacturarItem, 'clave' | 'origen' | 'origenId' | 'listoDesde' | 'diasEsperando' | 'diasHabiles' | 'semaforo'> {
    const habiles = diasHabiles(listoDesde, hoy);
    return {
      clave: `${origen}:${origenId}`,
      origen,
      origenId,
      listoDesde,
      diasEsperando: diasNaturales(listoDesde, hoy),
      diasHabiles: habiles,
      semaforo: semaforoFacturacion(habiles),
    };
  }

  private clienteDe(c: ClienteFacturacion | null | undefined, respaldo: string): PorFacturarItem['cliente'] {
    return { id: c?.id ?? null, nombre: (c?.legalName || c?.name || respaldo || 'Sin cliente').trim(), rfc: c?.taxId?.trim() || null };
  }

  /** Lo que le falta al cliente para timbrar y a dónde ir a completarlo. */
  private revisarCliente(c: ClienteFacturacion | null | undefined): { pendientes: Pendiente[]; href: string | null } {
    if (!c) {
      return {
        pendientes: [{ clave: 'cliente', texto: 'No tiene cliente de facturación (razón social y RFC)' }],
        href: '/erp/clientes',
      };
    }
    return {
      pendientes: pendientesReceptor({ rfc: c.taxId, nombre: c.legalName || c.name, cp: c.fiscalZipCode, regimen: c.fiscalRegime }),
      href: `/erp/clientes/${c.id}`,
    };
  }

  private async servicios(tenantId: number, desde: Date, hoy: string) {
    const actividades = await this.prisma.activity.findMany({
      where: {
        companyId: tenantId,
        deletedAt: null,
        estatus: { in: statusVariants(ACTIVITY_STATUS.FINALIZADA) },
        fechaFinalizacion: { gte: desde },
        OR: [{ clientId: { not: null } }, { cotizacionId: { not: null } }],
        invoices: { none: { deletedAt: null, isCancelled: false, status: { not: 'DRAFT' } } },
      },
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        fechaFinalizacion: true,
        responsable: { select: { nombre: true } },
        client: { select: { name: true, salesClients: { select: CLIENTE_FACTURACION, take: 1, orderBy: { id: 'asc' } } } },
        cotizacion: {
          select: {
            id: true,
            quoteNumber: true,
            folioEnviado: true,
            status: true,
            total: true,
            salesClient: { select: CLIENTE_FACTURACION },
            facturas: { select: FACTURA_LIGADA },
          },
        },
        invoices: { where: { deletedAt: null, status: 'DRAFT' }, select: { id: true }, take: 1 },
      },
      orderBy: { fechaFinalizacion: 'asc' },
      take: 300,
    });

    const out: Array<{ cotizacionId: number | null; item: PorFacturarItem }> = [];
    for (const a of actividades) {
      const cot = a.cotizacion;
      const facturasCot = activas(cot?.facturas ?? []);
      // Si la cotización ya tiene su factura final, el servicio está cobrado por ahí.
      if (facturasCot.some((f) => !f.esAnticipo && f.status !== 'DRAFT')) continue;
      const anticipo = facturasCot.find((f) => f.esAnticipo && f.status !== 'DRAFT') ?? null;

      const cliente = cot?.salesClient ?? a.client?.salesClients?.[0] ?? null;
      const revision = this.revisarCliente(cliente);
      const pendientes = [...revision.pendientes];
      const importe = cot ? cents(Number(cot.total)) : null;
      if (!cot) pendientes.push({ clave: 'precio', texto: 'No tiene cotización: captura el precio en el borrador' });

      const listo = diaMexico(a.fechaFinalizacion ?? new Date());
      const borrador = a.invoices[0]?.id ?? null;
      const folioCot = cot ? cot.folioEnviado || cot.quoteNumber : null;
      const bloqueado = revision.pendientes.length > 0;
      out.push({
        cotizacionId: cot?.id ?? null,
        item: {
          ...this.base('SERVICIO', a.id, listo, hoy),
          cliente: this.clienteDe(cliente, a.client?.name ?? ''),
          folio: a.anNumber,
          folioHref: `/erp/actividades/${a.id}`,
          concepto: a.titulo,
          detalle: cot
            ? `Cotización ${folioCot}${cot.status === 'APPROVED' ? ' · aprobada' : ''}`
            : `Terminada el ${fechaCorta(listo)}${a.responsable?.nombre ? ` · ${a.responsable.nombre}` : ''}`,
          importe,
          menos: anticipo ? { etiqueta: 'menos anticipo', importe: cents(Number(anticipo.totalAmount)) } : null,
          pendientes,
          nota:
            anticipo != null
              ? `Se relaciona con el anticipo ${folioFactura(anticipo)} (07)`
              : cot && cot.status !== 'APPROVED'
                ? 'La cotización no está marcada como aprobada'
                : null,
          accion: bloqueado ? 'COMPLETAR_CLIENTE' : borrador ? 'ABRIR_BORRADOR' : 'PREPARAR',
          facturaBorradorId: borrador,
          ...(bloqueado ? { folioHref: revision.href } : {}),
        },
      });
    }
    return out;
  }

  private async cotizaciones(tenantId: number, hoy: string): Promise<PorFacturarItem[]> {
    const lista = await this.prisma.cotizacion.findMany({
      where: { companyId: tenantId, deletedAt: null, status: 'APPROVED' },
      select: {
        id: true,
        quoteNumber: true,
        folioEnviado: true,
        projectName: true,
        trabajo: true,
        clientCompany: true,
        clientName: true,
        signedAt: true,
        updatedAt: true,
        depositPercent: true,
        subtotal: true,
        discountTotal: true,
        taxTotal: true,
        total: true,
        salesClient: { select: CLIENTE_FACTURACION },
        facturas: { select: FACTURA_LIGADA },
      },
      orderBy: { updatedAt: 'asc' },
      take: 300,
    });

    const out: PorFacturarItem[] = [];
    for (const c of lista) {
      const facturas = activas(c.facturas);
      if (facturas.some((f) => !f.esAnticipo && f.status !== 'DRAFT')) continue;
      const anticipo = facturas.find((f) => f.esAnticipo && f.status !== 'DRAFT') ?? null;
      const borradorFinal = facturas.find((f) => !f.esAnticipo && f.status === 'DRAFT') ?? null;
      const borradorAnticipo = facturas.find((f) => f.esAnticipo && f.status === 'DRAFT') ?? null;

      const listo = diaMexico(c.signedAt ?? c.updatedAt);
      const folio = c.folioEnviado || c.quoteNumber;
      const concepto = c.projectName || c.trabajo || 'Cotización aprobada';
      const revision = this.revisarCliente(c.salesClient);
      const bloqueado = revision.pendientes.length > 0;
      const cliente = this.clienteDe(c.salesClient, c.clientCompany || c.clientName || '');

      if (c.depositPercent > 0 && !anticipo) {
        const a = importeAnticipo({
          total: Number(c.total),
          subtotal: Number(c.subtotal),
          discountTotal: Number(c.discountTotal),
          taxTotal: Number(c.taxTotal),
          depositPercent: c.depositPercent,
        });
        out.push({
          ...this.base('ANTICIPO', c.id, listo, hoy),
          cliente,
          folio,
          folioHref: bloqueado ? revision.href : `/erp/cotizaciones/${c.id}`,
          concepto,
          detalle: `Anticipo pactado: ${c.depositPercent} % de $${Number(c.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
          importe: a.total,
          menos: null,
          pendientes: revision.pendientes,
          nota: null,
          accion: bloqueado ? 'COMPLETAR_CLIENTE' : borradorAnticipo ? 'ABRIR_BORRADOR' : 'PREPARAR',
          facturaBorradorId: borradorAnticipo?.id ?? null,
        });
        continue;
      }

      out.push({
        ...this.base('COTIZACION', c.id, listo, hoy),
        cliente,
        folio,
        folioHref: bloqueado ? revision.href : `/erp/cotizaciones/${c.id}`,
        concepto,
        detalle: `Aprobada el ${fechaCorta(listo)}${anticipo ? ` · ya tiene anticipo ${folioFactura(anticipo)}` : ''}`,
        importe: cents(Number(c.total)),
        menos: anticipo ? { etiqueta: 'menos anticipo', importe: cents(Number(anticipo.totalAmount)) } : null,
        pendientes: revision.pendientes,
        nota: anticipo ? `Se relaciona con el anticipo ${folioFactura(anticipo)} (07)` : null,
        accion: bloqueado ? 'COMPLETAR_CLIENTE' : borradorFinal ? 'ABRIR_BORRADOR' : 'PREPARAR',
        facturaBorradorId: borradorFinal?.id ?? null,
      });
    }
    return out;
  }

  private async pedidos(tenantId: number, hoy: string): Promise<PorFacturarItem[]> {
    const pedidos = await this.prisma.salesProjectOrder.findMany({
      where: {
        companyId: tenantId,
        status: { notIn: ['CANCELLED', 'CANCELED', 'CANCELADA', 'CANCELADO'] },
        lines: { some: { OR: [{ invoiceItem: { is: null } }, { invoiceItem: { is: { invoice: { status: 'DRAFT', deletedAt: null } } } }] } },
      },
      select: {
        id: true,
        orderId: true,
        projectId: true,
        createdAt: true,
        lines: {
          select: {
            id: true,
            qty: true,
            unitPrice: true,
            tax: true,
            discount: true,
            invoiceItem: { select: { invoice: { select: { id: true, status: true, deletedAt: true } } } },
          },
        },
        project: { select: { name: true, opportunity: { select: { client: { select: CLIENTE_FACTURACION } } } } },
      },
      take: 200,
    });

    return pedidos.map((p) => {
      const sinFactura = p.lines.filter((l) => !l.invoiceItem);
      const borrador = p.lines.find((l) => l.invoiceItem?.invoice.status === 'DRAFT' && !l.invoiceItem.invoice.deletedAt)
        ?.invoiceItem?.invoice.id;
      const importe = cents(
        sinFactura.reduce((s, l) => {
          const base = Number(l.qty) * Number(l.unitPrice) * (1 - Number(l.discount ?? 0) / 100);
          return s + base * (1 + (l.tax == null ? 16 : Number(l.tax)) / 100);
        }, 0),
      );
      const clienteFact = p.project?.opportunity?.client ?? null;
      const revision = this.revisarCliente(clienteFact);
      const bloqueado = revision.pendientes.length > 0;
      const listo = diaMexico(p.createdAt);
      return {
        ...this.base('PEDIDO', p.projectId, listo, hoy),
        cliente: this.clienteDe(clienteFact, ''),
        folio: p.orderId,
        folioHref: bloqueado ? revision.href : `/crm/projects/${p.projectId}`,
        concepto: p.project?.name ?? 'Pedido de venta',
        detalle: `${sinFactura.length} de ${p.lines.length} partidas sin facturar`,
        importe: sinFactura.length ? importe : null,
        menos: null,
        pendientes: revision.pendientes,
        nota: null,
        accion: bloqueado ? 'COMPLETAR_CLIENTE' : borrador ? 'ABRIR_BORRADOR' : 'PREPARAR',
        facturaBorradorId: borrador ?? null,
      } satisfies PorFacturarItem;
    });
  }

  private async complementos(tenantId: number, hoy: string): Promise<PorFacturarItem[]> {
    const pagos = await this.prisma.payment.findMany({
      where: {
        companyId: tenantId,
        cfdiPaymentUuid: null,
        invoice: {
          type: 'ACCOUNTS_RECEIVABLE',
          satPaymentMethod: 'PPD',
          cfdiUuid: { not: null },
          isCancelled: false,
          deletedAt: null,
        },
      },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            cfdiSerie: true,
            cfdiFolio: true,
            receptorName: true,
            receptorRfc: true,
            client: { select: { id: true } },
          },
        },
      },
      orderBy: { paymentDate: 'asc' },
      take: 200,
    });

    return pagos.map((p) => {
      const fecha = p.paymentDate.toISOString().slice(0, 10);
      const folio = folioFactura(p.invoice);
      return {
        ...this.base('COMPLEMENTO', p.id, fecha, hoy),
        cliente: { id: p.invoice.client?.id ?? null, nombre: p.invoice.receptorName || 'Cliente', rfc: p.invoice.receptorRfc },
        folio,
        folioHref: `/erp/invoicing/${p.invoice.id}`,
        concepto: `Pago del ${fechaCorta(fecha)} a la factura ${folio}`,
        detalle: `Factura a crédito (PPD) · el complemento vence el ${fechaCorta(venceComplemento(fecha))}`,
        importe: cents(Number(p.amount)),
        menos: null,
        pendientes: [],
        nota: null,
        accion: 'COMPLEMENTO',
        facturaBorradorId: null,
      } satisfies PorFacturarItem;
    });
  }

  // ───────────────────────── acciones ─────────────────────────

  async descartar(
    dto: { origen: string; origenId: number; motivo: string },
    userId: number,
    companyId: number | null | undefined,
  ) {
    const tenantId = requireCompanyId(companyId);
    const origen = this.validarOrigen(dto.origen);
    const motivo = String(dto.motivo ?? '').trim();
    if (motivo.length < 3) throw new BadRequestException('Escribe por qué no se factura.');
    await this.prisma.porFacturarDescarte.upsert({
      where: { companyId_origen_origenId: { companyId: tenantId, origen, origenId: dto.origenId } },
      create: { companyId: tenantId, origen, origenId: dto.origenId, motivo: motivo.slice(0, 300), createdById: userId },
      update: { motivo: motivo.slice(0, 300), createdById: userId },
    });
    return { ok: true };
  }

  private validarOrigen(origen: string): OrigenPorFacturar {
    const o = String(origen ?? '').toUpperCase() as OrigenPorFacturar;
    if (!ORIGENES_POR_FACTURAR.includes(o)) throw new BadRequestException(`Origen inválido: ${origen}`);
    return o;
  }

  /** Crea el borrador del CFDI (o devuelve el que ya existe) y regresa su id. */
  async preparar(dto: { origen: string; origenId: number }, userId: number, companyId: number | null | undefined) {
    const tenantId = requireCompanyId(companyId);
    const origen = this.validarOrigen(dto.origen);
    const id = Number(dto.origenId);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Falta el origen a facturar.');

    if (origen === 'COMPLEMENTO') {
      throw new BadRequestException('El complemento de pago se emite desde el pago, no se prepara como factura.');
    }
    if (origen === 'PEDIDO') {
      const factura = await this.accounting.createInvoiceFromSalesProject(id, userId, undefined, tenantId);
      return { invoiceId: factura.id };
    }
    if (origen === 'SERVICIO') return this.prepararServicio(id, userId, tenantId);
    return this.prepararCotizacion(id, origen === 'ANTICIPO', userId, tenantId);
  }

  private hoyMas(dias: number): string {
    return diaMexico(new Date(Date.now() + dias * 86_400_000));
  }

  private receptor(c: ClienteFacturacion) {
    return {
      clientId: c.id,
      receptorRfc: c.taxId?.trim() || undefined,
      receptorName: (c.legalName || c.name).trim(),
      receptorZipCode: c.fiscalZipCode?.trim() || undefined,
      receptorRegime: c.fiscalRegime?.trim() || undefined,
    };
  }

  private async prepararServicio(id: number, userId: number, tenantId: number) {
    const a = await this.prisma.activity.findFirst({
      where: { id, companyId: tenantId, deletedAt: null },
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        cotizacionId: true,
        client: { select: { salesClients: { select: CLIENTE_FACTURACION, take: 1, orderBy: { id: 'asc' } } } },
        cotizacion: { select: { salesClient: { select: CLIENTE_FACTURACION } } },
        invoices: { where: { deletedAt: null, isCancelled: false }, select: { id: true, status: true } },
      },
    });
    if (!a) throw new NotFoundException('Servicio no encontrado');
    const borrador = a.invoices.find((f) => f.status === 'DRAFT');
    if (borrador) return { invoiceId: borrador.id };
    if (a.invoices.length) throw new BadRequestException(`${a.anNumber} ya está facturado.`);

    const cliente = a.cotizacion?.salesClient ?? a.client?.salesClients?.[0] ?? null;
    if (!cliente) {
      throw new BadRequestException(`${a.anNumber} no tiene cliente de facturación: complétalo en Clientes.`);
    }

    if (a.cotizacionId) {
      return this.prepararCotizacion(a.cotizacionId, false, userId, tenantId, { activityId: a.id, cliente });
    }

    const factura = await this.accounting.createInvoice(
      {
        type: 'ACCOUNTS_RECEIVABLE',
        issueDate: diaMexico(new Date()),
        dueDate: this.hoyMas(30),
        ...this.receptor(cliente),
        cfdiUsage: 'G03',
        satPaymentMethod: 'PPD',
        satPaymentForm: '99',
        notes: `Servicio ${a.anNumber}`,
        companyId: tenantId,
        activityId: a.id,
        items: [{ description: `${a.anNumber} · ${a.titulo}`, quantity: 1, unitPrice: 0, ivaRate: 16 }],
      },
      userId,
    );
    return { invoiceId: factura.id };
  }

  private async prepararCotizacion(
    id: number,
    esAnticipo: boolean,
    userId: number,
    tenantId: number,
    desdeServicio?: { activityId: number; cliente: ClienteFacturacion },
  ) {
    const c = await this.prisma.cotizacion.findFirst({
      where: { id, companyId: tenantId, deletedAt: null },
      include: {
        items: { include: { product: true }, orderBy: { id: 'asc' } },
        salesClient: { select: CLIENTE_FACTURACION },
        facturas: { select: FACTURA_LIGADA },
      },
    });
    if (!c) throw new NotFoundException('Cotización no encontrada');
    const folio = c.folioEnviado || c.quoteNumber;
    const facturas = activas(c.facturas);
    const borrador = facturas.find((f) => f.status === 'DRAFT' && f.esAnticipo === esAnticipo);
    if (borrador) return { invoiceId: borrador.id };
    if (facturas.some((f) => !f.esAnticipo && f.status !== 'DRAFT')) {
      throw new BadRequestException(`La cotización ${folio} ya está facturada.`);
    }
    const cliente = desdeServicio?.cliente ?? c.salesClient;
    if (!cliente) throw new BadRequestException(`La cotización ${folio} no tiene cliente de facturación.`);

    const comunes = {
      type: 'ACCOUNTS_RECEIVABLE',
      issueDate: diaMexico(new Date()),
      dueDate: this.hoyMas(30),
      ...this.receptor(cliente),
      cfdiUsage: 'G03',
      companyId: tenantId,
      cotizacionId: c.id,
      activityId: desdeServicio?.activityId,
    };

    if (esAnticipo) {
      if (facturas.some((f) => f.esAnticipo && f.status !== 'DRAFT')) {
        throw new BadRequestException(`La cotización ${folio} ya tiene su anticipo facturado.`);
      }
      const a = importeAnticipo({
        total: Number(c.total),
        subtotal: Number(c.subtotal),
        discountTotal: Number(c.discountTotal),
        taxTotal: Number(c.taxTotal),
        depositPercent: c.depositPercent,
      });
      if (!(a.base > 0)) throw new BadRequestException(`La cotización ${folio} no tiene anticipo pactado.`);
      const factura = await this.accounting.createInvoice(
        {
          ...comunes,
          esAnticipo: true,
          satPaymentMethod: 'PUE',
          satPaymentForm: '03',
          notes: `Anticipo de la cotización ${folio} (${c.depositPercent} %)`,
          items: [
            {
              description: ANTICIPO_SAT.descripcion,
              quantity: 1,
              unitPrice: a.base,
              ivaRate: a.ivaPct,
              satProductKey: ANTICIPO_SAT.claveProdServ,
              satUnitKey: ANTICIPO_SAT.claveUnidad,
              unitName: ANTICIPO_SAT.unidad,
            },
          ],
        },
        userId,
      );
      return { invoiceId: factura.id };
    }

    const conceptos = conceptosDesdeCotizacion({
      conIva: c.conIva,
      factorMargen: factorMargen(c.marginPercent),
      partidas: c.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: Number(i.unitPrice),
        laborHours: Number(i.laborHours),
        laborRate: Number(i.laborRate),
        discount: i.discount,
        tax: i.tax,
        ieps: i.ieps,
        retention: i.retention,
        unit: i.unit,
      })),
    });
    if (!conceptos.length) throw new BadRequestException(`La cotización ${folio} no tiene partidas con importe.`);

    // Factura del remanente (procedimiento con anticipo): se relaciona con el anticipo (07) y se
    // descuenta su base, repartida entre los conceptos en proporción.
    const anticipo = facturas.find((f) => f.esAnticipo && f.status !== 'DRAFT' && f.cfdiUuid) ?? null;
    const baseAnticipo = anticipo ? cents(Number(anticipo.subtotal)) : 0;
    const baseTotal = conceptos.reduce((s, k) => s + k.quantity * k.unitPrice - k.discount, 0);
    let repartido = 0;

    const factura = await this.accounting.createInvoice(
      {
        ...comunes,
        satPaymentMethod: 'PPD',
        satPaymentForm: '99',
        notes: `Cotización ${folio}${anticipo ? ` · remanente, anticipo ${folioFactura(anticipo)}` : ''}`,
        cfdiRelationType: anticipo ? '07' : undefined,
        cfdiRelatedUuids: anticipo?.cfdiUuid ? [anticipo.cfdiUuid] : undefined,
        items: conceptos.map((k, idx) => {
          const sat = this.accounting.resolveSatKeysForOrderLine({
            product: c.items[k.indice]?.product ?? null,
            unit: c.items[k.indice]?.unit ?? null,
            category: c.items[k.indice]?.category ?? null,
          });
          const lineaBase = k.quantity * k.unitPrice - k.discount;
          const parte =
            baseAnticipo > 0 && baseTotal > 0
              ? idx === conceptos.length - 1
                ? cents(baseAnticipo - repartido)
                : cents((lineaBase / baseTotal) * baseAnticipo)
              : 0;
          repartido = cents(repartido + parte);
          return {
            description: k.description,
            quantity: k.quantity,
            unitPrice: k.unitPrice,
            discount: cents(k.discount + parte),
            ivaRate: k.ivaRate,
            iepsRate: k.iepsRate,
            isrRetRate: k.isrRetRate,
            productId: c.items[k.indice]?.productId ?? undefined,
            satProductKey: sat.satProductKey,
            satUnitKey: sat.satUnitKey,
            unitName: sat.unitName,
          };
        }),
      },
      userId,
    );
    return { invoiceId: factura.id };
  }
}
