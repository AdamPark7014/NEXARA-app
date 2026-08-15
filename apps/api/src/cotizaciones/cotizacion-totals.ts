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
  discountTotal: number;
  taxTotal: number;
  iepsTotal: number;
  retentionTotal: number;
  total: number;
};

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
      const subtotal = item.qty * item.unitPrice;
      const discount = subtotal * (item.discount / 100);
      const taxable = subtotal - discount;
      const taxAmount = taxable * (item.tax / 100);
      const iepsAmount = taxable * (item.ieps / 100);
      const retentionAmount = taxable * (item.retention / 100);
      const total = taxable + taxAmount + iepsAmount - retentionAmount;
      return {
        subtotal: acc.subtotal + subtotal,
        discountTotal: acc.discountTotal + discount,
        taxTotal: acc.taxTotal + taxAmount,
        iepsTotal: acc.iepsTotal + iepsAmount,
        retentionTotal: acc.retentionTotal + retentionAmount,
        total: acc.total + total,
      };
    },
    { subtotal: 0, discountTotal: 0, taxTotal: 0, iepsTotal: 0, retentionTotal: 0, total: 0 },
  );
}
