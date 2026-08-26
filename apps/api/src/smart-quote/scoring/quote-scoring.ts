import { normalizeExistencia, stockAtPreferredWarehouse, stockRowsFromExistencia } from '../ct-warehouses.js';

export type OptimizeMode = 'PRICE' | 'SPEED' | 'MARGIN' | 'PREMIUM' | 'BALANCE';

export type ProductSpec = { tipo: string; valor: string };

export type StockByWarehouseRow = { code: string; qty: number; label: string; city?: string };

export type ScoredOffer = {
  id: number;
  clave: string | null;
  numParte: string | null;
  nombre: string | null;
  modelo: string | null;
  marca: string | null;
  categoria: string | null;
  subcategoria: string | null;
  descripcion: string | null;
  imagen: string | null;
  ean: string | null;
  upc: string | null;
  precio: number;
  moneda: string;
  tipoCambio: number | null;
  costMxn: number;
  stockTotal: number;
  stockPreferred: number;
  stockByWarehouse: StockByWarehouseRow[];
  leadTimeDays: number;
  protegido: boolean;
  activo: boolean;
  sustituto: string | null;
  especificaciones: ProductSpec[];
  promociones: unknown[];
  hasPromo: boolean;
  promocionesCount: number;
  promocionesSummary: string[];
  score: number;
  badges: Array<'BEST_PRICE' | 'BEST_STOCK' | 'FASTEST' | 'BEST_MARGIN' | 'RECOMMENDED' | 'SUBSTITUTE'>;
  sellPriceSuggested: number;
  marginPercent: number;
};

const WEIGHTS: Record<OptimizeMode, Record<string, number>> = {
  PRICE: { price: 0.55, stock: 0.15, lead: 0.1, margin: 0.1, brand: 0.05, promo: 0.05 },
  SPEED: { price: 0.15, stock: 0.4, lead: 0.3, margin: 0.05, brand: 0.05, promo: 0.05 },
  MARGIN: { price: 0.2, stock: 0.15, lead: 0.1, margin: 0.4, brand: 0.1, promo: 0.05 },
  PREMIUM: { price: 0.1, stock: 0.15, lead: 0.1, margin: 0.15, brand: 0.4, promo: 0.1 },
  BALANCE: { price: 0.3, stock: 0.2, lead: 0.2, margin: 0.15, brand: 0.1, promo: 0.05 },
};

/** CT a veces bloquea hotlink con Referer; la URL igual debe quedar usable en <img referrerPolicy="no-referrer">. */
export function resolveProductImage(row: {
  imagen?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}): string | null {
  const raw = [row.imagen, row.imageUrl, row.thumbnailUrl]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find((v) => v.length > 0);
  if (!raw) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http://')) return `https://${raw.slice('http://'.length)}`;
  return raw;
}

function normalizeSpecs(value: unknown): ProductSpec[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const tipo = String((s as any).tipo || (s as any).type || '').trim();
      const valor = String((s as any).valor || (s as any).value || '').trim();
      if (!tipo || !valor) return null;
      return { tipo, valor };
    })
    .filter((s): s is ProductSpec => Boolean(s))
    .slice(0, 12);
}

function stockBreakdown(existencia: unknown): Array<{ code: string; qty: number; label: string; city?: string }> {
  return stockRowsFromExistencia(existencia, 8);
}

function summarizePromociones(promociones: unknown[]): { count: number; summary: string[] } {
  const list = Array.isArray(promociones) ? promociones : [];
  const summary = list
    .slice(0, 5)
    .map((p) => {
      if (!p || typeof p !== 'object') return typeof p === 'string' ? p.trim() : '';
      const row = p as Record<string, unknown>;
      const label = [row.nombre, row.name, row.descripcion, row.description, row.tipo, row.type]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .find((v) => v.length > 0);
      if (label) return label;
      const precio = row.precio ?? row.precioPromocion ?? row.price;
      if (precio != null && String(precio).trim()) return `Promo $${precio}`;
      return 'Promoción';
    })
    .filter((s): s is string => Boolean(s));
  return { count: list.length, summary };
}

export function scoreProducts(
  rows: Array<{
    id: number;
    clave: string | null;
    numParte: string | null;
    nombre: string | null;
    modelo: string | null;
    marca: string | null;
    categoria: string | null;
    subcategoria: string | null;
    descripcion_corta: string | null;
    imagen?: string | null;
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
    ean?: string | null;
    upc?: string | null;
    precio: number | null;
    moneda: string | null;
    tipoCambio: number | null;
    existencia: unknown;
    protegido: boolean;
    activo?: boolean;
    sustituto: string | null;
    especificaciones: unknown;
    promociones: unknown;
  }>,
  opts: {
    mode: OptimizeMode;
    targetMarginPercent: number;
    preferredWarehouse: string;
    preferredBrands?: string[];
  },
): ScoredOffer[] {
  const weights = WEIGHTS[opts.mode] || WEIGHTS.BALANCE;
  const preferredBrands = new Set((opts.preferredBrands || []).map((b) => b.toUpperCase()));

  const enriched = rows.map((r) => {
    const existencia = normalizeExistencia(r.existencia);
    const stockTotal = Object.values(existencia).reduce((a, b) => a + b, 0);
    const stockPreferred = stockAtPreferredWarehouse(existencia, opts.preferredWarehouse);
    const price = Number(r.precio) || 0; // CT feed = neto, sin IVA
    const currency = (r.moneda || 'MXN').toUpperCase();
    const fx = r.tipoCambio;
    const cost =
      currency === 'MXN'
        ? price
        : Math.round(price * (fx && fx > 0 ? fx : 17) * 100) / 100;
    const leadTimeDays = stockPreferred > 0 ? 1 : stockTotal > 0 ? 3 : 21;
    const margin = opts.targetMarginPercent / 100;
    // Precio de venta sugerido también neto; el IVA (16%) se aplica en la línea de cotización.
    const sellPriceSuggested =
      margin >= 0.99 ? cost * 2 : Math.round((cost / (1 - Math.max(0.01, margin))) * 100) / 100;
    const promociones = Array.isArray(r.promociones) ? r.promociones : [];
    const promoMeta = summarizePromociones(promociones);
    const hasPromo = promoMeta.count > 0;
    return {
      ...r,
      imagen: resolveProductImage(r),
      costMxn: cost,
      stockTotal,
      stockPreferred,
      stockByWarehouse: stockBreakdown(existencia),
      leadTimeDays,
      sellPriceSuggested,
      marginPercent: opts.targetMarginPercent,
      hasPromo,
      promocionesCount: promoMeta.count,
      promocionesSummary: promoMeta.summary,
      especificaciones: normalizeSpecs(r.especificaciones),
      promociones,
      brandBoost: r.marca && preferredBrands.has(r.marca.toUpperCase()) ? 1 : 0.5,
    };
  });

  if (!enriched.length) return [];

  const costs = enriched.map((e) => e.costMxn);
  const stocks = enriched.map((e) => e.stockTotal + e.stockPreferred * 2);
  const leads = enriched.map((e) => e.leadTimeDays);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const maxStock = Math.max(...stocks, 1);
  const minLead = Math.min(...leads);
  const maxLead = Math.max(...leads);

  const scored: ScoredOffer[] = enriched.map((e) => {
    const priceScore =
      maxCost === minCost ? 1 : 1 - (e.costMxn - minCost) / (maxCost - minCost || 1);
    const stockScore = (e.stockTotal + e.stockPreferred * 2) / maxStock;
    const leadScore =
      maxLead === minLead ? 1 : 1 - (e.leadTimeDays - minLead) / (maxLead - minLead || 1);
    const marginScore = opts.mode === 'MARGIN' ? priceScore : 0.7;
    const brandScore = e.brandBoost;
    const promoScore = e.hasPromo ? 1 : 0.3;

    const score =
      weights.price * priceScore +
      weights.stock * stockScore +
      weights.lead * leadScore +
      weights.margin * marginScore +
      weights.brand * brandScore +
      weights.promo * promoScore;

    return {
      id: e.id,
      clave: e.clave,
      numParte: e.numParte,
      nombre: e.nombre,
      modelo: e.modelo,
      marca: e.marca,
      categoria: e.categoria,
      subcategoria: e.subcategoria,
      descripcion: e.descripcion_corta,
      imagen: e.imagen,
      ean: e.ean || null,
      upc: e.upc || null,
      precio: Number(e.precio) || 0,
      moneda: (e.moneda || 'MXN').toUpperCase(),
      tipoCambio: e.tipoCambio,
      costMxn: e.costMxn,
      stockTotal: e.stockTotal,
      stockPreferred: e.stockPreferred,
      stockByWarehouse: e.stockByWarehouse,
      leadTimeDays: e.leadTimeDays,
      protegido: e.protegido,
      activo: e.activo !== false,
      sustituto: e.sustituto,
      especificaciones: e.especificaciones,
      promociones: e.promociones,
      hasPromo: e.hasPromo,
      promocionesCount: e.promocionesCount,
      promocionesSummary: e.promocionesSummary,
      score,
      badges: [],
      sellPriceSuggested: e.sellPriceSuggested,
      marginPercent: e.marginPercent,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  if (scored.length) {
    const bestPrice = [...scored].sort((a, b) => a.costMxn - b.costMxn)[0];
    const bestStock = [...scored].sort((a, b) => b.stockTotal - a.stockTotal)[0];
    const fastest = [...scored].sort(
      (a, b) => a.leadTimeDays - b.leadTimeDays || b.stockPreferred - a.stockPreferred,
    )[0];
    bestPrice.badges.push('BEST_PRICE');
    bestStock.badges.push('BEST_STOCK');
    fastest.badges.push('FASTEST');
    scored[0].badges.push('RECOMMENDED');
    if (opts.mode === 'MARGIN') scored[0].badges.push('BEST_MARGIN');
  }

  return scored;
}
