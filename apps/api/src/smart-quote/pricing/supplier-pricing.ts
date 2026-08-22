/**
 * Políticas de precio por mayorista — homologación de campos y reglas de IVA.
 * CT publica lista SIN IVA; otros mayoristas pueden variar (ver `listPriceIncludesTax`).
 */

export type SupplierCode = 'CT' | string;

export type SupplierPricingPolicy = {
  code: SupplierCode;
  label: string;
  /** Precio de lista del mayorista incluye IVA. */
  listPriceIncludesTax: boolean;
  /** IVA que se traslada al cliente en cotización (México). */
  customerTaxPercent: number;
  defaultMarginPercent: number;
  defaultCurrency: string;
};

export const SUPPLIER_PRICING_POLICIES: Record<string, SupplierPricingPolicy> = {
  CT: {
    code: 'CT',
    label: 'CT Online',
    listPriceIncludesTax: false,
    customerTaxPercent: 16,
    defaultMarginPercent: 30,
    defaultCurrency: 'MXN',
  },
  SYSCOM: {
    code: 'SYSCOM',
    label: 'SYSCOM (próximamente)',
    listPriceIncludesTax: false,
    customerTaxPercent: 16,
    defaultMarginPercent: 28,
    defaultCurrency: 'MXN',
  },
};

export const DEFAULT_MARGIN_PERCENT = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Precio de venta neto a partir de costo y margen sobre venta: sell = cost / (1 − m). */
export function sellFromCost(cost: number, marginPercent: number): number {
  const costN = Math.max(0, Number(cost) || 0);
  if (costN <= 0) return 0;
  const m = Math.min(0.95, Math.max(0.01, (Number(marginPercent) || 0) / 100));
  return round2(costN / (1 - m));
}

/** Margen % sobre precio de venta: (sell − cost) / sell. */
export function marginOnSell(cost: number, sell: number): number {
  const c = Number(cost) || 0;
  const s = Number(sell) || 0;
  if (s <= 0) return 0;
  return round2(((s - c) / s) * 100);
}

/** Costo neto a partir de lista mayorista (quita IVA si el feed lo trae incluido). */
export function listPriceToNetCost(
  listPrice: number,
  policy: SupplierPricingPolicy,
  taxPercent = policy.customerTaxPercent,
): number {
  const p = Math.max(0, Number(listPrice) || 0);
  if (!policy.listPriceIncludesTax || taxPercent <= 0) return round2(p);
  return round2(p / (1 + taxPercent / 100));
}

export type QuoteLinePricingInput = {
  unitCost?: number | null;
  unitPrice?: number | null;
  marginPercent?: number | null;
  supplierCode?: SupplierCode | null;
  taxPercent?: number | null;
};

export type QuoteLinePricing = {
  unitCost: number | null;
  unitPrice: number;
  marginPercent: number | null;
  taxPercent: number;
  supplierCode: SupplierCode | null;
};

/**
 * Normaliza costo / venta / margen de una línea.
 * Si hay costo y el precio de venta es ≤ costo (o cero), aplica margen objetivo.
 */
export function resolveQuoteLinePricing(input: QuoteLinePricingInput): QuoteLinePricing {
  const policy = input.supplierCode ? SUPPLIER_PRICING_POLICIES[input.supplierCode] : undefined;
  const defaultMargin = input.marginPercent ?? policy?.defaultMarginPercent ?? DEFAULT_MARGIN_PERCENT;
  const taxPercent = input.taxPercent ?? policy?.customerTaxPercent ?? 16;

  let unitCost =
    input.unitCost != null && input.unitCost !== ('' as unknown as number)
      ? Number(input.unitCost)
      : null;
  if (unitCost != null && Number.isNaN(unitCost)) unitCost = null;
  if (unitCost != null && unitCost <= 0) unitCost = null;

  let unitPrice = Math.max(0, Number(input.unitPrice) || 0);
  let marginPercent: number | null =
    input.marginPercent != null && input.marginPercent !== ('' as unknown as number)
      ? Number(input.marginPercent)
      : null;

  if (unitCost != null) {
    const needsSell =
      unitPrice <= 0 || unitPrice <= unitCost || (marginPercent != null && marginPercent <= 0);
    if (needsSell) {
      unitPrice = sellFromCost(unitCost, defaultMargin);
      marginPercent = defaultMargin;
    } else if (marginPercent == null || Number.isNaN(marginPercent)) {
      marginPercent = marginOnSell(unitCost, unitPrice);
    }
  } else if (marginPercent == null) {
    marginPercent = null;
  }

  return {
    unitCost,
    unitPrice: round2(unitPrice),
    marginPercent: marginPercent != null ? round2(marginPercent) : null,
    taxPercent,
    supplierCode: input.supplierCode ?? policy?.code ?? null,
  };
}

export function inferSupplierCode(item: {
  productCtId?: number | null;
  supplierCode?: string | null;
}): SupplierCode | null {
  if (item.supplierCode) return item.supplierCode;
  if (item.productCtId) return 'CT';
  return null;
}
