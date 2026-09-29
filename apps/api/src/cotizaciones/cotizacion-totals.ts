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

/**
 * Markup sobre el costo, el mismo del cotizador: precio = costo × (1 + margen/100).
 * 20% de 100 son 120. No es margen sobre el precio de venta.
 */
export function precioConMargenSobreCosto(costo: number, margen: number): number {
  const c = Math.max(0, Number(costo) || 0);
  const m = Number.isFinite(Number(margen)) ? Number(margen) : 0;
  return Math.round((c * (1 + m / 100) + Number.EPSILON) * 100) / 100;
}

/**
 * Saneado de conceptos. Los porcentajes se acotan a [0, 100] y la cantidad a un
 * mínimo de 1, de modo que un payload manipulado no pueda producir importes
 * negativos ni descuentos superiores al 100 %.
 *
 * `margenGeneral` es el markup de la cotización. Si la partida no trae el suyo
 * (`marginPercent` null) y hay costo, el precio queda en costo × (1 + general/100)
 * y el margen de la partida se guarda null para que siga heredando.
 */
export function normalizeItems(
  items: RawCotizacionItem[] | undefined | null,
  margenGeneral?: number | null,
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
    const propioEnviado =
      item.marginPercent != null && item.marginPercent !== '' && Number.isFinite(Number(item.marginPercent));
    const pricing = resolveQuoteLinePricing({
      unitCost: item.unitCost != null && item.unitCost !== '' ? Number(item.unitCost) : null,
      unitPrice: Number(item.unitPrice) || 0,
      marginPercent: propioEnviado ? Number(item.marginPercent) : null,
      supplierCode,
      taxPercent,
    });
    const general =
      margenGeneral != null && Number.isFinite(Number(margenGeneral)) ? Number(margenGeneral) : null;
    let unitPrice = pricing.unitPrice;
    // Sin margen propio no se inventa uno a partir del precio: null significa «usa el general».
    let marginPercent: number | null = propioEnviado ? pricing.marginPercent : null;
    if (!propioEnviado && general != null && pricing.unitCost != null && pricing.unitCost > 0) {
      unitPrice = precioConMargenSobreCosto(pricing.unitCost, general);
      marginPercent = null;
    }

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
      marginPercent,
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
 * Orden de aplicación: descuento sobre el subtotal, e impuestos y retención
 * sobre la base ya descontada. La retención resta del total.
 *
 * OJO — `laborHours` y `laborRate` NO entran en ningún total: se imprimen en el
 * PDF como línea informativa ("MO: Xh x $Y") pero no se facturan. Si la mano de
 * obra debe cobrarse aparte del `unitPrice`, esto es una fuga de ingresos; si va
 * incluida en el precio unitario, es correcto. Comportamiento vigente
 * documentado en `cotizacion-totals.spec.ts`.
 */
export function calculateTotals(items: NormalizedCotizacionItem[]): CotizacionTotals {
  return items.reduce<CotizacionTotals>(
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
}
