/**
 * Pólizas que arma la Mesa contable, como funciones puras sobre códigos del catálogo base
 * (`base-chart-of-accounts.ts`). El servicio traduce el código a la cuenta de la empresa.
 *
 * Cada función devuelve renglones que ya cuadran (debe = haber) o lanza: una póliza que no cuadra
 * no se registra a medias.
 */

export interface RenglonPoliza {
  codigo: string;
  debe: number;
  haber: number;
  etiqueta: string;
}

export const CUENTAS = {
  bancos: '102.01',
  clientes: '105.01',
  deudores: '107.01',
  ivaAcreditablePagado: '110.02',
  retencionesAFavor: '113.01',
  proveedores: '201.01',
  acreedores: '205.01',
  ivaCobrado: '208.01',
  ivaNoCobrado: '208.02',
  ingresosServicios: '401.01',
  anticipoClientes: '206.01',
  gastosAdministracion: '601.01',
  viaticos: '601.02',
  noDeducibles: '605.01',
} as const;

export const cents = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export class PolizaDescuadradaError extends Error {}

export function sumaDebe(r: RenglonPoliza[]): number {
  return cents(r.reduce((s, x) => s + x.debe, 0));
}
export function sumaHaber(r: RenglonPoliza[]): number {
  return cents(r.reduce((s, x) => s + x.haber, 0));
}
export function cuadra(r: RenglonPoliza[]): boolean {
  return Math.abs(sumaDebe(r) - sumaHaber(r)) < 0.005;
}

function limpiar(r: RenglonPoliza[]): RenglonPoliza[] {
  const sinCeros = r
    .map((x) => ({ ...x, debe: cents(x.debe), haber: cents(x.haber) }))
    .filter((x) => x.debe !== 0 || x.haber !== 0);
  if (!cuadra(sinCeros)) {
    throw new PolizaDescuadradaError(
      `La póliza no cuadra: debe ${sumaDebe(sinCeros).toFixed(2)} contra haber ${sumaHaber(sinCeros).toFixed(2)}.`,
    );
  }
  return sinCeros;
}

export interface ConceptoFactura {
  taxBase?: number | null;
  ivaAmount?: number | null;
  iepsAmount?: number | null;
  isrRetAmount?: number | null;
  ivaRetAmount?: number | null;
}

/**
 * Factura emitida al timbrarse: Debe clientes por el total · Haber ingresos por la base (ya sin
 * descuento) e IVA trasladado.
 *
 * Antes la póliza tomaba el subtotal bruto e ignoraba descuentos y retenciones, así que no
 * cuadraba y solo quedaba un error en el log. Con PPD el IVA va a «no cobrado» (208.02) hasta que
 * entra el pago; con PUE a «cobrado».
 */
export function polizaFacturaEmitida(f: {
  total: number;
  subtotal: number;
  taxAmount: number;
  metodoPago: string | null | undefined;
  esAnticipo?: boolean;
  conceptos?: ConceptoFactura[];
}): RenglonPoliza[] {
  const total = cents(f.total);
  const conceptos = f.conceptos ?? [];
  const conBase = conceptos.length > 0 && conceptos.every((c) => c.taxBase != null);
  const iva = conBase
    ? cents(conceptos.reduce((s, c) => s + Number(c.ivaAmount ?? 0) + Number(c.iepsAmount ?? 0), 0))
    : cents(f.taxAmount);
  const retenciones = cents(
    conceptos.reduce((s, c) => s + Number(c.isrRetAmount ?? 0) + Number(c.ivaRetAmount ?? 0), 0),
  );
  let base = conBase ? cents(conceptos.reduce((s, c) => s + Number(c.taxBase ?? 0), 0)) : cents(total - iva);

  // El total guardado ya viene redondeado por concepto; si la suma difiere por un centavo se
  // absorbe en el ingreso. Más que eso es un dato mal capturado y no se maquilla.
  const diferencia = cents(total + retenciones - base - iva);
  if (Math.abs(diferencia) <= 0.05) base = cents(base + diferencia);

  const ppd = String(f.metodoPago ?? '').toUpperCase() === 'PPD';
  return limpiar([
    { codigo: CUENTAS.clientes, debe: total, haber: 0, etiqueta: 'Clientes' },
    { codigo: CUENTAS.retencionesAFavor, debe: retenciones, haber: 0, etiqueta: 'Impuestos que nos retuvo el cliente' },
    {
      codigo: f.esAnticipo ? CUENTAS.anticipoClientes : CUENTAS.ingresosServicios,
      debe: 0,
      haber: base,
      etiqueta: f.esAnticipo ? 'Anticipo de cliente' : 'Ingresos',
    },
    {
      codigo: ppd ? CUENTAS.ivaNoCobrado : CUENTAS.ivaCobrado,
      debe: 0,
      haber: iva,
      etiqueta: ppd ? 'IVA trasladado no cobrado' : 'IVA trasladado cobrado',
    },
  ]);
}

/**
 * Cobro o pago de una factura. En un cobro de factura PPD el IVA de lo cobrado pasa de
 * «no cobrado» a «cobrado», en proporción al importe.
 */
export function polizaPagoFactura(p: {
  tipo: 'ACCOUNTS_RECEIVABLE' | 'ACCOUNTS_PAYABLE' | string;
  importe: number;
  facturaTotal: number;
  facturaIva: number;
  metodoPago: string | null | undefined;
}): RenglonPoliza[] {
  const importe = cents(p.importe);
  if (p.tipo === 'ACCOUNTS_PAYABLE') {
    return limpiar([
      { codigo: CUENTAS.proveedores, debe: importe, haber: 0, etiqueta: 'Liquidación a proveedor' },
      { codigo: CUENTAS.bancos, debe: 0, haber: importe, etiqueta: 'Salida bancaria' },
    ]);
  }
  const renglones: RenglonPoliza[] = [
    { codigo: CUENTAS.bancos, debe: importe, haber: 0, etiqueta: 'Entrada bancaria' },
    { codigo: CUENTAS.clientes, debe: 0, haber: importe, etiqueta: 'Aplicación a clientes' },
  ];
  const ppd = String(p.metodoPago ?? '').toUpperCase() === 'PPD';
  const total = Number(p.facturaTotal) || 0;
  if (ppd && total > 0 && p.facturaIva > 0) {
    const ivaCobrado = cents(Math.min(1, importe / total) * p.facturaIva);
    renglones.push(
      { codigo: CUENTAS.ivaNoCobrado, debe: ivaCobrado, haber: 0, etiqueta: 'IVA que se cobró' },
      { codigo: CUENTAS.ivaCobrado, debe: 0, haber: ivaCobrado, etiqueta: 'IVA trasladado cobrado' },
    );
  }
  return limpiar(renglones);
}

/** Viático entregado: es dinero por comprobar, no gasto todavía. */
export function polizaViaticoEntregado(importe: number): RenglonPoliza[] {
  const monto = cents(importe);
  return limpiar([
    { codigo: CUENTAS.deudores, debe: monto, haber: 0, etiqueta: 'Viático por comprobar' },
    { codigo: CUENTAS.bancos, debe: 0, haber: monto, etiqueta: 'Salida de bancos' },
  ]);
}

export interface CfdiDeGasto {
  total: number;
  iva: number;
}

/**
 * Comprobación de un viático: lo respaldado con CFDI es gasto deducible más IVA acreditable; lo
 * que solo trae ticket es no deducible. Se salda lo entregado; si se comprobó de más, el
 * excedente se le debe a la persona.
 */
export function polizaComprobacionViatico(v: {
  entregado: number;
  comprobado: number;
  cfdis: CfdiDeGasto[];
}): RenglonPoliza[] {
  const comprobado = cents(v.comprobado);
  const entregado = cents(v.entregado);
  const { base, iva, noDeducible } = repartirDeducible(comprobado, v.cfdis);
  const saldado = cents(Math.min(comprobado, entregado));
  const excedente = cents(Math.max(0, comprobado - entregado));
  return limpiar([
    { codigo: CUENTAS.viaticos, debe: base, haber: 0, etiqueta: 'Viáticos deducibles' },
    { codigo: CUENTAS.ivaAcreditablePagado, debe: iva, haber: 0, etiqueta: 'IVA acreditable pagado' },
    { codigo: CUENTAS.noDeducibles, debe: noDeducible, haber: 0, etiqueta: 'Sin factura: no deducible' },
    { codigo: CUENTAS.deudores, debe: 0, haber: saldado, etiqueta: 'Viático por comprobar' },
    { codigo: CUENTAS.acreedores, debe: 0, haber: excedente, etiqueta: 'Se le debe a quien comprobó' },
  ]);
}

/** Gasto pagado: base al gasto, IVA acreditable si hay CFDI, el resto no deducible. */
export function polizaGastoPagado(g: {
  importe: number;
  cuentaGasto: string;
  cfdis: CfdiDeGasto[];
}): RenglonPoliza[] {
  const importe = cents(g.importe);
  const { base, iva, noDeducible } = repartirDeducible(importe, g.cfdis);
  return limpiar([
    { codigo: g.cuentaGasto, debe: base, haber: 0, etiqueta: 'Gasto' },
    { codigo: CUENTAS.ivaAcreditablePagado, debe: iva, haber: 0, etiqueta: 'IVA acreditable pagado' },
    { codigo: CUENTAS.noDeducibles, debe: noDeducible, haber: 0, etiqueta: 'Sin factura: no deducible' },
    { codigo: CUENTAS.bancos, debe: 0, haber: importe, etiqueta: 'Salida de bancos' },
  ]);
}

/**
 * Qué parte de un importe respaldan los CFDI. Si los CFDI suman más que lo gastado (un ticket
 * de más), se toma solo lo gastado y el IVA en la misma proporción.
 */
export function repartirDeducible(
  importe: number,
  cfdis: CfdiDeGasto[],
): { base: number; iva: number; noDeducible: number } {
  const monto = cents(importe);
  const totalCfdi = cents(cfdis.reduce((s, c) => s + (Number(c.total) || 0), 0));
  const ivaCfdi = cents(cfdis.reduce((s, c) => s + (Number(c.iva) || 0), 0));
  if (totalCfdi <= 0 || monto <= 0) return { base: 0, iva: 0, noDeducible: monto };
  const factor = totalCfdi > monto ? monto / totalCfdi : 1;
  const respaldado = cents(totalCfdi * factor);
  const iva = cents(ivaCfdi * factor);
  return { base: cents(respaldado - iva), iva, noDeducible: cents(monto - respaldado) };
}
