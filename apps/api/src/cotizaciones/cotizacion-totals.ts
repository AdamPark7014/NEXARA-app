import { BadRequestException } from '@nestjs/common';

/**
 * Aritmética de cotizaciones.
 *
 * Extraída del servicio para poder cubrirla con tests: es la lógica que decide
 * cuánto se le factura al cliente y no tenía ninguna prueba.
 */

export type RawCotizacionItem = {
  productId?: number | string | null;
  category?: string | null;
  name?: string | null;
  description?: string | null;
  scope?: string | null;
  brand?: string | null;
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
  category: string;
  name: string;
  description: string | null;
  scope: string | null;
  brand: string | null;
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
 * Saneado de conceptos. Los porcentajes se acotan a [0, 100] y la cantidad a un
 * mínimo de 1, de modo que un payload manipulado no pueda producir importes
 * negativos ni descuentos superiores al 100 %.
 */
export function normalizeItems(items: RawCotizacionItem[] | undefined | null): NormalizedCotizacionItem[] {
  if (!items || !items.length) {
    throw new BadRequestException('Se requiere al menos un concepto');
  }

  const percent = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0));

  return items.map((item) => ({
    productId: item.productId ? Number(item.productId) : null,
    category: item.category?.trim() || 'Otros',
    name: item.name?.trim() || 'Concepto',
    description: item.description?.trim() || null,
    scope: item.scope?.trim() || null,
    brand: item.brand?.trim() || null,
    model: item.model?.trim() || null,
    sku: item.sku?.trim() || null,
    partNumber: item.partNumber?.trim() || null,
    batchReference: item.batchReference?.trim() || null,
    unit: item.unit?.trim() || 'pieza',
    qty: Math.max(1, Number(item.qty) || 1),
    unitPrice: Number(item.unitPrice) || 0,
    unitCost: item.unitCost != null && item.unitCost !== '' ? Number(item.unitCost) : null,
    supplierId: item.supplierId ? Number(item.supplierId) : null,
    supplierSku: item.supplierSku?.trim() || null,
    productCtId: item.productCtId ? Number(item.productCtId) : null,
    marginPercent:
      item.marginPercent != null && item.marginPercent !== '' ? Number(item.marginPercent) : null,
    stockSnapshot: item.stockSnapshot != null ? Number(item.stockSnapshot) : null,
    leadTimeDays: item.leadTimeDays != null ? Number(item.leadTimeDays) : null,
    scoreReason: item.scoreReason?.trim() || null,
    optimizationMode: item.optimizationMode?.trim() || null,
    discount: percent(item.discount),
    tax: percent(item.tax),
    ieps: percent(item.ieps),
    retention: percent(item.retention),
    laborHours: Math.max(0, Number(item.laborHours) || 0),
    laborRate: Math.max(0, Number(item.laborRate) || 0),
    warrantyMonths: Math.max(0, Number(item.warrantyMonths) || 0),
    deliveryTime: item.deliveryTime?.trim() || null,
    countryOrigin: item.countryOrigin?.trim() || null,
    notes: item.notes?.trim() || null,
  }));
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
