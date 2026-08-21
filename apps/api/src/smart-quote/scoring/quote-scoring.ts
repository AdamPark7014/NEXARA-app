export type OptimizeMode = 'PRICE' | 'SPEED' | 'MARGIN' | 'PREMIUM' | 'BALANCE';

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
  precio: number;
  moneda: string;
  tipoCambio: number | null;
  costMxn: number;
  stockTotal: number;
  stockPreferred: number;
  leadTimeDays: number;
  protegido: boolean;
  sustituto: string | null;
  especificaciones: unknown;
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
    imagen: string | null;
    precio: number | null;
    moneda: string | null;
    tipoCambio: number | null;
    existencia: unknown;
    protegido: boolean;
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
    const existencia =
      r.existencia && typeof r.existencia === 'object' && !Array.isArray(r.existencia)
        ? (r.existencia as Record<string, number>)
        : {};
    const stockTotal = Object.values(existencia).reduce((a, b) => a + (Number(b) || 0), 0);
    const stockPreferred = Number(existencia[opts.preferredWarehouse] || 0);
    const price = Number(r.precio) || 0;
    const currency = (r.moneda || 'MXN').toUpperCase();
    const fx = r.tipoCambio;
    const cost =
      currency === 'MXN'
        ? price
        : Math.round(price * (fx && fx > 0 ? fx : 17) * 100) / 100;
    const leadTimeDays = stockPreferred > 0 ? 1 : stockTotal > 0 ? 3 : 21;
    const margin = opts.targetMarginPercent / 100;
    const sellPriceSuggested =
      margin >= 0.99 ? cost * 2 : Math.round((cost / (1 - Math.max(0.01, margin))) * 100) / 100;
    const hasPromo = Array.isArray(r.promociones) && r.promociones.length > 0;
    return {
      ...r,
      costMxn: cost,
      stockTotal,
      stockPreferred,
      leadTimeDays,
      sellPriceSuggested,
      marginPercent: opts.targetMarginPercent,
      hasPromo,
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
      precio: Number(e.precio) || 0,
      moneda: (e.moneda || 'MXN').toUpperCase(),
      tipoCambio: e.tipoCambio,
      costMxn: e.costMxn,
      stockTotal: e.stockTotal,
      stockPreferred: e.stockPreferred,
      leadTimeDays: e.leadTimeDays,
      protegido: e.protegido,
      sustituto: e.sustituto,
      especificaciones: e.especificaciones,
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
    const fastest = [...scored].sort((a, b) => a.leadTimeDays - b.leadTimeDays || b.stockPreferred - a.stockPreferred)[0];
    bestPrice.badges.push('BEST_PRICE');
    bestStock.badges.push('BEST_STOCK');
    fastest.badges.push('FASTEST');
    scored[0].badges.push('RECOMMENDED');
    if (opts.mode === 'MARGIN') scored[0].badges.push('BEST_MARGIN');
  }

  return scored;
}
