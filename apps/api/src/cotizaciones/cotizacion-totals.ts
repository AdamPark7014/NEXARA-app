import { BadRequestException } from '@nestjs/common';
import {
  inferSupplierCode,
  resolveQuoteLinePricing,
} from '../smart-quote/pricing/supplier-pricing.js';

/**
 * Aritmética de cotizaciones.
 *
 * Extraída del servicio para poder cubrirla con tests: es la lógica que decide
 * cuánto se le factura al cliente y no tenía ninguna prueba.
 */

export type RawCotizacionItem = {
  productId?: number | string | null;
  grupo?: string | null;
  paqueteClave?: string | null;
  paqueteCantidad?: number | string | null;
  category?: string | null;
  name?: string | null;
  /** Etiqueta impresa («1», «1.1»). */
  partida?: string | null;
  description?: string | null;
  scope?: string | null;
  brand?: string | null;
  imagenUrl?: string | null;
  model?: string | null;
  sku?: string | null;
  partNumber?: string | null;
  batchReference?: string | null;
  unit?: string | null;
  qty?: number | string | null;
  unitPrice?: number | string | null;
  unitCost?: number | string | null;
  supplierId?: number | string | null;
  supplierSku?: string | null;
  productCtId?: number | string | null;
  supplierCode?: string | null;
  supplierWarehouseCode?: string | null;
  marginPercent?: number | string | null;
  stockSnapshot?: number | string | null;
  leadTimeDays?: number | string | null;
  scoreReason?: string | null;
  optimizationMode?: string | null;
  discount?: number | string | null;
  tax?: number | string | null;
  ieps?: number | string | null;
  retention?: number | string | null;
  laborHours?: number | string | null;
  laborRate?: number | string | null;
  warrantyMonths?: number | string | null;
  deliveryTime?: string | null;
  countryOrigin?: string | null;
  notes?: string | null;
};

export type NormalizedCotizacionItem = {
  productId: number | null;
  /** EQUIPOS | MATERIALES | MANO_DE_OBRA; `null` = se deduce al imprimir. */
  grupo: string | null;
  paqueteClave: string | null;
  paqueteCantidad: number | null;
  category: string;
  name: string;
  partida: string | null;
  description: string | null;
  scope: string | null;
  brand: string | null;
  imagenUrl: string | null;
  model: string | null;
  sku: string | null;
  partNumber: string | null;
  batchReference: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  unitCost: number | null;
  supplierId: number | null;
  supplierSku: string | null;
  productCtId: number | null;
  supplierCode: string | null;
  supplierWarehouseCode: string | null;
  marginPercent: number | null;
  stockSnapshot: number | null;
  leadTimeDays: number | null;
  scoreReason: string | null;
  optimizationMode: string | null;
  discount: number;
  tax: number;
  ieps: number;
  retention: number;
  laborHours: number;
  laborRate: number;
  warrantyMonths: number;
  deliveryTime: string | null;
  countryOrigin: string | null;
  notes: string | null;
};

export type CotizacionTotals = {
  subtotal: number;
  laborTotal: number;
  discountTotal: number;
  taxTotal: number;
  iepsTotal: number;
  retentionTotal: number;
  total: number;
};

/** Desglose de una línea. */
export type LineAmounts = {
  /** Producto: cantidad × precio unitario. */
  productAmount: number;
  /** Mano de obra: horas × tarifa. */
  laborAmount: number;
  /** Base antes de descuento (producto + mano de obra). */
  subtotal: number;
  discount: number;
  /** Base imponible tras descuento. */
  taxable: number;
  taxAmount: number;
  iepsAmount: number;
  retentionAmount: number;
  total: number;
};

/**
 * Importes de una línea de cotización.
 *
 * **La mano de obra se factura.** Antes se imprimía en el PDF como línea
 * informativa ("MO: 10h × $500") pero no entraba en ningún total, de modo que
 * el cliente veía el desglose y no se le cobraba: una fuga de ingresos en cada
 * cotización con mano de obra.
 *
 * La mano de obra forma parte de la base de la línea, así que el descuento y
 * los impuestos se aplican sobre ella igual que sobre el producto —es un
 * servicio y causa IVA—, y la retención también.
 *
 * Única fuente del cálculo: los totales de la cotización y el `lineTotal` que
 * se guarda por línea salen de aquí, para que no puedan discrepar.
 */
export function calculateLine(item: NormalizedCotizacionItem): LineAmounts {
  const productAmount = item.qty * item.unitPrice;
  const laborAmount = item.laborHours * item.laborRate;
  const subtotal = productAmount + laborAmount;
  const discount = subtotal * (item.discount / 100);
  const taxable = subtotal - discount;
  const taxAmount = taxable * (item.tax / 100);
  const iepsAmount = taxable * (item.ieps / 100);
  const retentionAmount = taxable * (item.retention / 100);

  return {
    productAmount,
    laborAmount,
    subtotal,
    discount,
    taxable,
    taxAmount,
    iepsAmount,
    retentionAmount,
    total: taxable + taxAmount + iepsAmount - retentionAmount,
  };
}

/** Porcentaje a partir del cual se dispara el workflow de aprobación. */
export function maxDiscountPercent(items: Array<{ discount: number }>): number {
  if (!items.length) return 0;
  return items.reduce((max, it) => Math.max(max, Number(it.discount) || 0), 0);
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Porcentaje tal como lo escribe Christian: 20 es 20 %, no 0.20 ni 2000.
 * Acepta número, texto («20», «20.5», «20%», «20,5») y un Decimal de Prisma
 * (`"20.00"` o `{ s, e, d }`). No multiplica por 100: un 20 se queda en 20.
 * El objeto Decimal de 20.4 trae los dígitos `2040000`; leerlos a pelo da 204.
 */
export function porcentajeMargen(valor: unknown): number | null {
  const n = numeroDeMargen(valor);
  if (n == null) return null;
  return round2(Math.min(1000, Math.max(-100, n)));
}

/**
 * Lo que entra en el DTO. `undefined` (el campo no vino) se queda en `undefined`
 * para no borrar el margen en un PATCH parcial. `null` o `""` lo quitan.
 */
export function margenDeEntrada(valor: unknown): number | null | undefined {
  if (valor === undefined) return undefined;
  return porcentajeMargen(valor);
}

/** 20 → 1.20. Sin porcentaje, el total no se mueve. */
export function factorMargen(valor: unknown): number {
  const pct = porcentajeMargen(valor);
  if (pct == null) return 1;
  return 1 + pct / 100;
}

/**
 * Total final = (subtotal de partidas ya con IVA, descuentos, IEPS y retención) × (1 + margen/100).
 * 100 + IVA 16 = 116; con 20 % el total es 139.20.
 */
export function totalConMargen(baseConImpuestos: number, margen: unknown): number {
  const base = Number(baseConImpuestos) || 0;
  return round2(base * factorMargen(margen));
}

/**
 * Precio al cliente a partir del costo interno y el margen de la partida: costo × (1 + margen/100).
 * `null` si falta el costo o el margen — ahí el precio se respeta tal como se capturó.
 */
export function precioConMargen(unitCost: number | null, margen: unknown): number | null {
  const pct = porcentajeMargen(margen);
  if (unitCost == null || !(unitCost > 0) || pct == null) return null;
  return round2(unitCost * (1 + pct / 100));
}

function numeroDeMargen(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string') return numeroDeTexto(valor);
  if (typeof valor === 'object') {
    const o = valor as { toNumber?: () => number; s?: number; e?: number; d?: number[] };
    if (typeof o.toNumber === 'function') {
      const n = o.toNumber();
      return Number.isFinite(n) ? n : null;
    }
    if (Array.isArray(o.d) && typeof o.e === 'number') return decimalJsANumero({ s: o.s, e: o.e, d: o.d });
  }
  return null;
}

/** «20,5» es 20.5. Quitar la coma a ciegas convertía «20,4» en 204. */
function numeroDeTexto(texto: string): number | null {
  let t = texto.trim().replace(/%/g, '').replace(/\s/g, '');
  if (!t || t === '-' || t === '.' || t === ',' || t === '-.' || t === '-,') return null;
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (coma >= 0) {
    t = t.replace(',', '.');
  }
  if (t.endsWith('.')) t = t.slice(0, -1);
  if (!t || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * decimal.js guarda el coeficiente en base 1e7 y el exponente del dígito más
 * significativo. 20.4 es `{ e: 1, d: [2040000] }`, no 204.
 */
function decimalJsANumero(o: { s?: number; e: number; d: number[] }): number | null {
  const LOG = 7;
  let digitos = '';
  for (let i = 0; i < o.d.length; i++) {
    const trozo = String(Math.trunc(Math.abs(o.d[i] ?? 0)));
    digitos += i === 0 ? trozo : trozo.padStart(LOG, '0');
  }
  if (!digitos) return 0;
  const cientifico = digitos.length === 1 ? digitos : `${digitos[0]}.${digitos.slice(1)}`;
  const n = (o.s === -1 ? -1 : 1) * Number(cientifico) * 10 ** o.e;
  return Number.isFinite(n) ? n : null;
}

/**
 * Saneado de conceptos. Los porcentajes se acotan a [0, 100] y la cantidad a un
 * mínimo de 1, de modo que un payload manipulado no pueda producir importes
 * negativos ni descuentos superiores al 100 %.
 *
 * El precio de la partida se guarda como viene, **salvo** que traiga costo interno y margen propio:
 * ahí el precio sale de costo × (1 + margen/100) — el servidor manda, no lo que haya calculado el
 * navegador. Sin uno de los dos, el precio capturado se respeta tal cual. Esto es aparte del margen
 * de la cotización (`Cotizacion.marginPercent`), que sigue sin ser un markup por renglón: se aplica
 * después, sobre el total ya con IVA (ver `calculateTotals`).
 */
export function normalizeItems(
  items: RawCotizacionItem[] | undefined | null,
): NormalizedCotizacionItem[] {
  if (!items || !items.length) {
    throw new BadRequestException('Se requiere al menos un concepto');
  }

  const percent = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0));
  /**
   * Prisma declara cantidad, descuento e impuestos como enteros. Un 10.5 o un
   * 2.0 que dejó de ser entero revienta el guardado con PrismaClientValidationError
   * y el cliente solo ve HTTP 400 INVALID_REQUEST.
   */
  const entero = (value: unknown, fallback = 0) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  };
  const enteroONulo = (value: unknown) => {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
  };

  return items.map((item) => {
    const supplierCode = inferSupplierCode({
      productCtId: item.productCtId ? Number(item.productCtId) : null,
      supplierCode: item.supplierCode?.trim() || null,
    });
    const taxProvided = item.tax != null && item.tax !== '';
    const taxPercent = taxProvided ? percent(item.tax) : undefined;
    const pricing = resolveQuoteLinePricing({
      unitCost: item.unitCost != null && item.unitCost !== '' ? Number(item.unitCost) : null,
      unitPrice: Number(item.unitPrice) || 0,
      marginPercent: null,
      supplierCode,
      taxPercent,
    });
    // Con costo y margen de la partida, el precio sale de ahí (costo × (1 + margen/100)) — la fuente
    // de verdad es el servidor, no lo que haya calculado el navegador. Sin uno de los dos, el precio
    // capturado se respeta tal cual, aunque sea igual al costo. El margen de la cotización (aparte,
    // Cotizacion.marginPercent) no reescribe la partida: va sobre el total ya con IVA.
    const margenPartida = porcentajeMargen(item.marginPercent);
    const precioDeMargen = precioConMargen(pricing.unitCost, margenPartida);
    const unitPrice = precioDeMargen ?? round2(Math.max(0, Number(item.unitPrice) || 0));

    return {
      productId: item.productId ? entero(item.productId) || null : null,
      grupo: item.grupo?.trim().toUpperCase().replace(/[\s-]+/g, '_') || null,
      paqueteClave: item.paqueteClave?.trim() || null,
      paqueteCantidad: enteroONulo(item.paqueteCantidad),
      category: item.category?.trim() || 'Otros',
      name: item.name?.trim() || 'Concepto',
      partida: item.partida?.trim().slice(0, 16) || null,
      description: item.description?.trim() || null,
      scope: item.scope?.trim() || null,
      brand: item.brand?.trim() || null,
      imagenUrl: typeof item.imagenUrl === 'string' ? item.imagenUrl.trim().slice(0, 500) || null : null,
      model: item.model?.trim() || null,
      sku: item.sku?.trim() || null,
      partNumber: item.partNumber?.trim() || null,
      batchReference: item.batchReference?.trim() || null,
      unit: item.unit?.trim() || 'pieza',
      qty: Math.max(1, entero(item.qty, 1)),
      unitPrice,
      unitCost: pricing.unitCost,
      supplierId: item.supplierId ? entero(item.supplierId) || null : null,
      supplierSku: item.supplierSku?.trim() || null,
      productCtId: item.productCtId ? entero(item.productCtId) || null : null,
      supplierCode: pricing.supplierCode,
      supplierWarehouseCode: item.supplierWarehouseCode?.trim()?.slice(0, 10) || null,
      marginPercent: margenPartida,
      stockSnapshot: enteroONulo(item.stockSnapshot),
      leadTimeDays: enteroONulo(item.leadTimeDays),
      scoreReason: item.scoreReason?.trim() || null,
      optimizationMode: item.optimizationMode?.trim() || null,
      discount: entero(percent(item.discount)),
      tax: entero(taxProvided ? taxPercent! : pricing.taxPercent),
      ieps: entero(percent(item.ieps)),
      retention: entero(percent(item.retention)),
      laborHours: Math.max(0, Number(item.laborHours) || 0),
      laborRate: Math.max(0, Number(item.laborRate) || 0),
      warrantyMonths: Math.max(0, entero(item.warrantyMonths, 0)),
      deliveryTime: item.deliveryTime?.trim() || null,
      countryOrigin: item.countryOrigin?.trim() || null,
      notes: item.notes?.trim() || null,
    };
  });
}

/**
 * Totales de la cotización.
 *
 * Descuento sobre el subtotal; IVA, IEPS y retención sobre la base ya
 * descontada. La mano de obra entra en esa base (se cobra).
 *
 * El margen, si viene, no toca el precio de cada partida: el total final es
 * ese importe ya con IVA × (1 + margen/100). Subtotal e IVA se quedan sin
 * margen para poder enseñarlos aparte. Sin margen, el total es la suma de
 * las líneas, igual que antes.
 */
export function calculateTotals(
  items: NormalizedCotizacionItem[],
  margen?: number | null,
): CotizacionTotals {
  const acc = items.reduce<CotizacionTotals>(
    (acc, item) => {
      const line = calculateLine(item);
      return {
        subtotal: acc.subtotal + line.subtotal,
        laborTotal: acc.laborTotal + line.laborAmount,
        discountTotal: acc.discountTotal + line.discount,
        taxTotal: acc.taxTotal + line.taxAmount,
        iepsTotal: acc.iepsTotal + line.iepsAmount,
        retentionTotal: acc.retentionTotal + line.retentionAmount,
        total: acc.total + line.total,
      };
    },
    {
      subtotal: 0,
      laborTotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      iepsTotal: 0,
      retentionTotal: 0,
      total: 0,
    },
  );
  const pct = porcentajeMargen(margen);
  if (pct == null || pct === 0) return acc;
  return { ...acc, total: totalConMargen(acc.total, pct) };
}
