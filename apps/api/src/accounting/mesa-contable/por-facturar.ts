/**
 * Reglas de la bandeja «Por facturar» que no dependen de la base: días hábiles, semáforo contra la
 * meta de facturar en 2 días hábiles (§7.3 ter de `.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md`), qué le
 * falta al cliente para timbrar y cuánto es un anticipo.
 */

export type OrigenPorFacturar = 'SERVICIO' | 'COTIZACION' | 'ANTICIPO' | 'PEDIDO' | 'COMPLEMENTO';
export const ORIGENES_POR_FACTURAR: OrigenPorFacturar[] = ['SERVICIO', 'COTIZACION', 'ANTICIPO', 'PEDIDO', 'COMPLEMENTO'];

export type AccionPorFacturar = 'PREPARAR' | 'COMPLEMENTO' | 'CAPTURAR_PRECIO' | 'COMPLETAR_CLIENTE' | 'ABRIR_BORRADOR';
export type Semaforo = 'ok' | 'atencion' | 'tarde';

export interface Pendiente {
  clave: string;
  texto: string;
}

export interface PorFacturarItem {
  clave: string;
  origen: OrigenPorFacturar;
  origenId: number;
  cliente: { id: number | null; nombre: string; rfc: string | null };
  folio: string;
  folioHref: string | null;
  concepto: string;
  detalle: string | null;
  listoDesde: string;
  diasEsperando: number;
  diasHabiles: number;
  semaforo: Semaforo;
  importe: number | null;
  menos: { etiqueta: string; importe: number } | null;
  pendientes: Pendiente[];
  nota: string | null;
  accion: AccionPorFacturar;
  facturaBorradorId: number | null;
}

/** Meta de Adam para contabilidad: factura en ≤ 2 días hábiles. */
export const META_DIAS_HABILES = 2;

/** SAT, Guía de llenado del CFDI: así se describe un anticipo. */
export const ANTICIPO_SAT = {
  claveProdServ: '84111506',
  claveUnidad: 'ACT',
  unidad: 'Actividad',
  descripcion: 'Anticipo del bien o servicio',
} as const;

const ZONA = 'America/Mexico_City';

/** El día calendario en México de un instante (el servidor corre en UTC). */
export function diaMexico(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    fecha,
  );
}

function aDiaUtc(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Días naturales entre dos días de calendario (ymd). */
export function diasNaturales(desde: string, hasta: string): number {
  return Math.max(0, Math.round((aDiaUtc(hasta).getTime() - aDiaUtc(desde).getTime()) / 86_400_000));
}

/**
 * Días hábiles (lunes a viernes) que pasaron desde que quedó listo: el día en que quedó listo no
 * cuenta y hoy sí. Listo el viernes y hoy lunes = 1. Los festivos no se descuentan.
 */
export function diasHabiles(desde: string, hasta: string): number {
  const inicio = aDiaUtc(desde).getTime();
  const fin = aDiaUtc(hasta).getTime();
  let n = 0;
  for (let t = inicio + 86_400_000; t <= fin; t += 86_400_000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) n += 1;
  }
  return n;
}

export function semaforoFacturacion(habiles: number): Semaforo {
  if (habiles < META_DIAS_HABILES) return 'ok';
  if (habiles === META_DIAS_HABILES) return 'atencion';
  return 'tarde';
}

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** Lo que el SAT exige del receptor en CFDI 4.0 y que hoy no está capturado. */
export function pendientesReceptor(r: {
  rfc?: string | null;
  nombre?: string | null;
  cp?: string | null;
  regimen?: string | null;
}): Pendiente[] {
  const p: Pendiente[] = [];
  const rfc = String(r.rfc ?? '').trim().toUpperCase();
  if (!rfc) p.push({ clave: 'rfc', texto: 'Falta el RFC del cliente' });
  else if (!RFC.test(rfc)) p.push({ clave: 'rfc', texto: 'El RFC del cliente no tiene el formato del SAT' });
  if (!String(r.nombre ?? '').trim()) p.push({ clave: 'razon-social', texto: 'Falta la razón social del cliente' });
  if (!/^\d{5}$/.test(String(r.cp ?? '').trim())) {
    p.push({ clave: 'cp', texto: 'Falta el código postal fiscal del cliente' });
  }
  if (!String(r.regimen ?? '').trim()) p.push({ clave: 'regimen', texto: 'Falta el régimen fiscal del cliente' });
  return p;
}

export const cents = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Anticipo pactado de una cotización, sobre su total final (que ya trae el margen). Se separa la
 * base del IVA con la tasa de la cotización, para que anticipo y remanente sumen lo cotizado.
 */
export function importeAnticipo(c: {
  total: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  depositPercent: number;
}): { base: number; iva: number; total: number; ivaPct: number } {
  const pct = Math.min(100, Math.max(0, Number(c.depositPercent) || 0)) / 100;
  const baseCot = Number(c.subtotal) - Number(c.discountTotal);
  const ivaPct = baseCot > 0 ? Math.round((Number(c.taxTotal) / baseCot) * 100) : 0;
  const total = cents(Number(c.total) * pct);
  const base = cents(total / (1 + ivaPct / 100));
  return { base, iva: cents(total - base), total, ivaPct };
}

export interface PartidaCotizacion {
  name: string;
  qty: number;
  unitPrice: number;
  laborHours: number;
  laborRate: number;
  discount: number;
  tax: number;
  ieps: number;
  retention: number;
  unit: string | null;
}

export interface ConceptoBorrador {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  ivaRate: number;
  iepsRate: number;
  isrRetRate: number;
  indice: number;
}

/**
 * Conceptos del CFDI a partir de las partidas de una cotización, con el mismo cálculo que
 * `cotizacion-totals.ts`: la mano de obra entra en la base, el descuento es por partida, sin IVA
 * cuando el cliente no pidió factura con IVA, y el margen de la cotización escala cada partida.
 *
 * Si el precio unitario no cae en centavos exactos, el concepto va como una sola unidad para que el
 * total del CFDI sea el de la cotización y no difiera por redondeo.
 */
export function conceptosDesdeCotizacion(cot: {
  conIva: boolean;
  factorMargen: number;
  partidas: PartidaCotizacion[];
}): ConceptoBorrador[] {
  const out: ConceptoBorrador[] = [];
  cot.partidas.forEach((p, indice) => {
    const qty = Number(p.qty) || 0;
    const base = (qty * Number(p.unitPrice) + Number(p.laborHours) * Number(p.laborRate)) * cot.factorMargen;
    if (!(base > 0)) return;
    const cantidad = qty > 0 ? qty : 1;
    let unitPrice = cents(base / cantidad);
    let quantity = cantidad;
    let description = String(p.name ?? '').trim() || 'Concepto';
    if (Math.abs(cents(unitPrice * cantidad) - cents(base)) >= 0.005) {
      unitPrice = cents(base);
      quantity = 1;
      description = `${description} (${cantidad} ${p.unit?.trim() || 'pzas'})`;
    }
    out.push({
      description,
      quantity,
      unitPrice,
      discount: cents(base * ((Number(p.discount) || 0) / 100)),
      ivaRate: cot.conIva ? Number(p.tax) || 0 : 0,
      iepsRate: Number(p.ieps) || 0,
      isrRetRate: cot.conIva ? Number(p.retention) || 0 : 0,
      indice,
    });
  });
  return out;
}

/** De lo más antiguo a lo más reciente; a igual fecha, lo de mayor importe primero. */
export function ordenarPorFacturar(items: PorFacturarItem[]): PorFacturarItem[] {
  return [...items].sort(
    (a, b) => a.listoDesde.localeCompare(b.listoDesde) || (b.importe ?? 0) - (a.importe ?? 0) || a.clave.localeCompare(b.clave),
  );
}

/** El complemento de pago vence el día 5 del mes siguiente al cobro (regla del SAT). */
export function venceComplemento(fechaPago: string): string {
  const [y, m] = fechaPago.split('-').map(Number);
  const sig = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `${sig.y}-${String(sig.m).padStart(2, '0')}-05`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function nombreMes(mes1a12: number): string {
  return MESES[mes1a12 - 1] ?? '';
}

/** «23 oct» */
export function fechaCorta(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${nombreMes(m).slice(0, 3)}`;
}
