import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { BASE_CHART_OF_ACCOUNTS } from '../base-chart-of-accounts.js';
import { PorFacturarService, folioFactura } from './por-facturar.service.js';
import { polizaFacturaEmitida, PolizaDescuadradaError } from './polizas-mesa.js';
import { REGIMENES, claveSat, puedeTimbrar, revisarFactura } from './revision-factura.js';
import type { OrigenPorFacturar } from './por-facturar.js';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class RevisionFacturaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly porFacturar: PorFacturarService,
  ) {}

  async revisar(companyId: number | null | undefined, id: number) {
    const tenantId = requireCompanyId(companyId);
    const f = await this.prisma.invoice.findFirst({
      where: { id, companyId: tenantId, deletedAt: null },
      include: {
        items: { orderBy: { id: 'asc' } },
        client: { select: { id: true, billingEmail: true } },
        activity: { select: { id: true, anNumber: true } },
        cotizacion: { select: { id: true, quoteNumber: true, folioEnviado: true } },
        salesProjectOrder: { select: { orderId: true, projectId: true } },
      },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');

    const conceptos = f.items.map((i) => ({
      id: i.id,
      descripcion: i.description,
      claveSat: i.satProductKey,
      unidadClave: i.satUnitKey,
      unidad: i.unitName,
      cantidad: Number(i.quantity),
      precio: Number(i.unitPrice),
      ivaPct: Number(i.ivaRate ?? i.taxRate ?? 0),
      importe: Math.round((Number(i.quantity) * Number(i.unitPrice) - Number(i.discount ?? 0)) * 100) / 100,
      total: Number(i.total),
    }));
    const descuento = f.items.reduce((s, i) => s + Number(i.discount ?? 0), 0);
    const retenciones = f.items.reduce((s, i) => s + Number(i.isrRetAmount ?? 0) + Number(i.ivaRetAmount ?? 0), 0);
    const timbrado = this.porFacturar.timbrado();

    const revisiones = revisarFactura(
      {
        receptorRfc: f.receptorRfc,
        receptorName: f.receptorName,
        receptorRegime: f.receptorRegime,
        receptorZipCode: f.receptorZipCode,
        cfdiUsage: f.cfdiUsage,
        satPaymentMethod: f.satPaymentMethod,
        satPaymentForm: f.satPaymentForm,
        totalAmount: Number(f.totalAmount),
        esAnticipo: f.esAnticipo,
        cfdiRelationType: f.cfdiRelationType,
        conceptos: conceptos.map((c) => ({ unitPrice: c.precio, quantity: c.cantidad, total: c.total })),
      },
      timbrado.conectado,
    );
    if (f.status !== 'DRAFT') {
      revisiones.unshift({ clave: 'estado', nivel: 'error', texto: 'Esta factura ya no es borrador', detalle: null });
    }

    let poliza: Array<{ cuenta: string; debe: number; haber: number }> = [];
    let notaPoliza: string | null = null;
    try {
      const renglones = polizaFacturaEmitida({
        total: Number(f.totalAmount),
        subtotal: Number(f.subtotal),
        taxAmount: Number(f.taxAmount),
        metodoPago: f.satPaymentMethod,
        esAnticipo: f.esAnticipo,
        conceptos: f.items.map((i) => ({
          taxBase: i.taxBase == null ? null : Number(i.taxBase),
          ivaAmount: Number(i.ivaAmount ?? 0),
          iepsAmount: Number(i.iepsAmount ?? 0),
          isrRetAmount: Number(i.isrRetAmount ?? 0),
          ivaRetAmount: Number(i.ivaRetAmount ?? 0),
        })),
      });
      const cuentas = await this.prisma.account.findMany({
        where: { companyId: tenantId, code: { in: renglones.map((r) => r.codigo) } },
        select: { code: true, name: true },
      });
      const nombre = (c: string) =>
        cuentas.find((x) => x.code === c)?.name ?? BASE_CHART_OF_ACCOUNTS.find((x) => x.code === c)?.name ?? '';
      poliza = renglones.map((r) => ({ cuenta: `${r.codigo} ${nombre(r.codigo)}`.trim(), debe: r.debe, haber: r.haber }));
      notaPoliza =
        claveSat(f.satPaymentMethod) === 'PPD'
          ? 'Cuando se cobre, el IVA pasa de «no cobrado» a «cobrado» en la póliza del pago.'
          : null;
    } catch (e) {
      if (!(e instanceof PolizaDescuadradaError)) throw e;
      notaPoliza = e.message;
    }

    let origen: { tipo: OrigenPorFacturar; folio: string; href: string | null; extra: string | null } | null = null;
    if (f.activity) origen = { tipo: 'SERVICIO', folio: f.activity.anNumber, href: `/erp/actividades/${f.activity.id}`, extra: null };
    if (f.cotizacion) {
      const folioCot = f.cotizacion.folioEnviado || f.cotizacion.quoteNumber;
      origen = origen
        ? { ...origen, extra: folioCot }
        : { tipo: f.esAnticipo ? 'ANTICIPO' : 'COTIZACION', folio: folioCot, href: `/erp/cotizaciones/${f.cotizacion.id}`, extra: null };
    }
    if (!origen && f.salesProjectOrder) {
      origen = { tipo: 'PEDIDO', folio: f.salesProjectOrder.orderId, href: `/crm/projects/${f.salesProjectOrder.projectId}`, extra: null };
    }

    const regimen = claveSat(f.receptorRegime);
    const relacionados = String(f.cfdiRelatedUuids ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const relFacturas = relacionados.length
      ? await this.prisma.invoice.findMany({
          where: { companyId: tenantId, cfdiUuid: { in: relacionados } },
          select: { cfdiUuid: true, invoiceNumber: true, cfdiSerie: true, cfdiFolio: true },
        })
      : [];

    return {
      factura: {
        id: f.id,
        folio: f.cfdiSerie && f.cfdiFolio ? `${f.cfdiSerie}-${f.cfdiFolio}` : f.invoiceNumber,
        status: f.status,
        esAnticipo: f.esAnticipo,
        issueDate: ymd(f.issueDate),
        dueDate: ymd(f.dueDate),
        cfdiUsage: f.cfdiUsage,
        satPaymentMethod: (claveSat(f.satPaymentMethod) || null) as 'PUE' | 'PPD' | null,
        satPaymentForm: claveSat(f.satPaymentForm) || null,
        currency: f.currency,
        receptor: {
          nombre: f.receptorName,
          rfc: f.receptorRfc,
          regimen: regimen || null,
          regimenTexto: regimen ? `${regimen} · ${REGIMENES[regimen] ?? 'Régimen del SAT'}` : null,
          cp: f.receptorZipCode,
          correo: f.client?.billingEmail ?? null,
          clienteId: f.client?.id ?? null,
        },
        conceptos: conceptos.map(({ total: _t, ...c }) => c),
        subtotal: Number(f.subtotal),
        descuento: Math.round(descuento * 100) / 100,
        iva: Number(f.taxAmount),
        retenciones: Math.round(retenciones * 100) / 100,
        total: Number(f.totalAmount),
        relacionados: relacionados.map((uuid) => {
          const r = relFacturas.find((x) => x.cfdiUuid === uuid);
          return { tipo: f.cfdiRelationType ?? '', uuid, folio: r ? folioFactura(r) : null };
        }),
        cfdiUuid: f.cfdiUuid,
        pdfUrl: f.pdfUrl,
        editarConceptosHref: `/erp/invoicing/${f.id}`,
      },
      origen,
      revisiones,
      poliza,
      notaPoliza,
      puedeTimbrar: f.status === 'DRAFT' && puedeTimbrar(revisiones, timbrado.conectado),
      timbrado,
    };
  }
}
