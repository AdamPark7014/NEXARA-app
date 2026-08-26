import { buildApiUrl } from "@/lib/api-base";

export type OptimizeMode = "PRICE" | "SPEED" | "MARGIN" | "PREMIUM" | "BALANCE";

export type SmartOffer = {
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
  ean?: string | null;
  upc?: string | null;
  precio: number;
  moneda: string;
  tipoCambio: number | null;
  costMxn: number;
  stockTotal: number;
  stockPreferred: number;
  stockByWarehouse?: Array<{ code: string; qty: number; label?: string; city?: string }>;
  leadTimeDays: number;
  protegido: boolean;
  activo?: boolean;
  sustituto: string | null;
  especificaciones?: Array<{ tipo: string; valor: string }>;
  promociones?: unknown[];
  hasPromo?: boolean;
  score: number;
  badges: string[];
  sellPriceSuggested: number;
  marginPercent: number;
};

export type LogisticsZone = {
  id?: number;
  zoneCode: string;
  zoneName: string;
  baseCost: number | string;
  basePrice: number | string;
  active?: boolean;
};

export type QuoteLinePayload = {
  productCtId?: number;
  category?: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  model?: string | null;
  sku?: string | null;
  partNumber?: string | null;
  unit?: string;
  qty: number;
  unitPrice: number;
  unitCost?: number | null;
  supplierSku?: string | null;
  supplierCode?: string | null;
  marginPercent?: number | null;
  stockSnapshot?: number | null;
  leadTimeDays?: number | null;
  scoreReason?: string | null;
  optimizationMode?: string | null;
  discount: number;
  tax: number;
  laborHours?: number;
  laborRate?: number;
  deliveryTime?: string | null;
};

async function sqRequest<T>(
  path: string,
  token: string,
  init?: RequestInit,
  fallback = "Error Smart Quote",
): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (init?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data?.message === "string" ? data.message : fallback);
  }
  return res.json() as Promise<T>;
}

export async function smartQuoteSearch(
  token: string,
  params: {
    q?: string;
    brand?: string;
    category?: string;
    optimize?: OptimizeMode;
    targetMargin?: number;
    inStockOnly?: boolean;
    take?: number;
  },
  init?: RequestInit,
) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.brand) qs.set("brand", params.brand);
  if (params.category) qs.set("category", params.category);
  if (params.optimize) qs.set("optimize", params.optimize);
  if (params.targetMargin != null) qs.set("targetMargin", String(params.targetMargin));
  if (params.inStockOnly === false) qs.set("inStockOnly", "0");
  if (params.take) qs.set("take", String(params.take));
  return sqRequest<{
    data: SmartOffer[];
    meta: {
      totalCandidates: number;
      mode: OptimizeMode;
      preferredWarehouse?: string;
      warehouses?: Array<{ code: string; label: string; city?: string }>;
    };
  }>(
    `smart-quote/search?${qs}`,
    token,
    init,
    "No se pudo buscar en catálogo CT",
  );
}

export async function smartQuoteCtStatus(token: string) {
  return sqRequest<{
    total: number;
    active: number;
    withStock: number;
    preferredWarehouse?: string;
    warehouses?: Array<{ code: string; label: string; city?: string }>;
    lastSync: { finishedAt?: string; status?: string; rowsUpserted?: number } | null;
  }>("smart-quote/ct/status", token, undefined, "No se pudo leer estado CT");
}

export async function smartQuoteFacets(token: string) {
  return sqRequest<{
    brands: Array<{ name: string | null; count: number }>;
    categories: Array<{ name: string | null; count: number }>;
  }>("smart-quote/facets", token, undefined, "No se pudieron cargar filtros CT");
}

export async function smartQuoteLogistics(token: string) {
  return sqRequest<LogisticsZone[]>(
    "smart-quote/logistics",
    token,
    undefined,
    "No se pudieron cargar zonas logísticas",
  );
}

/** Detalle de un SKU CT (vía búsqueda exacta hasta endpoint dedicado). */
export async function smartQuoteProduct(token: string, clave: string) {
  const res = await smartQuoteSearch(token, { q: clave, take: 8, inStockOnly: false });
  const key = clave.trim().toLowerCase();
  return res.data.find((o) => o.clave?.toLowerCase() === key) ?? res.data[0] ?? null;
}

export async function smartQuoteSubstitutes(
  token: string,
  clave: string,
  params?: { optimize?: OptimizeMode; targetMargin?: number; take?: number },
) {
  const qs = new URLSearchParams();
  if (params?.optimize) qs.set("optimize", params.optimize);
  if (params?.targetMargin != null) qs.set("targetMargin", String(params.targetMargin));
  if (params?.take) qs.set("take", String(params.take));
  const suffix = qs.toString() ? `?${qs}` : "";
  return sqRequest<SmartOffer[]>(
    `smart-quote/substitutes/${encodeURIComponent(clave)}${suffix}`,
    token,
    undefined,
    "No se pudieron cargar sustitutos",
  );
}

export async function smartQuoteTriggerSync(token: string, source: "PRIMARY" | "FULL" = "PRIMARY") {
  return sqRequest<unknown>(
    "smart-quote/ct/sync",
    token,
    { method: "POST", body: JSON.stringify({ source, async: false }) },
    "No se pudo sincronizar CT",
  );
}

export async function smartQuoteLaborSuggest(
  token: string,
  lines: Array<{ category?: string; qty: number; name?: string }>,
) {
  return sqRequest<
    Array<{
      code: string;
      name: string;
      category: string;
      qty: number;
      unitPrice: number;
      unitCost: number;
      laborHours: number;
      laborRate: number;
      reason: string;
    }>
  >(
    "smart-quote/labor/suggest",
    token,
    { method: "POST", body: JSON.stringify({ lines }) },
    "No se pudo sugerir mano de obra",
  );
}

export async function smartQuoteCheckMargin(
  token: string,
  body: {
    unitCost: number;
    unitPrice: number;
    discountPercent?: number;
    category?: string;
    brand?: string;
  },
) {
  return sqRequest<{
    ok: boolean;
    marginPercent: number;
    minRequired: number;
    requiresApproval: boolean;
    message: string | null;
  }>(
    "smart-quote/rules/check-margin",
    token,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo validar margen",
  );
}

export async function smartQuoteConfigure(
  token: string,
  body: {
    template: "CCTV" | "WIFI" | "ACCESS" | "CUSTOM";
    cameras?: number;
    storageDays?: number;
    accessPoints?: number;
    doors?: number;
    optimize?: OptimizeMode;
    targetMarginPercent?: number;
    logisticsZone?: string;
    includeLabor?: boolean;
  },
) {
  return sqRequest<{
    hardware: QuoteLinePayload[];
    labor: Array<{
      name: string;
      category: string;
      qty: number;
      unitPrice: number;
      unitCost: number;
      laborHours: number;
      laborRate: number;
      reason: string;
    }>;
    logistics: QuoteLinePayload | null;
    notes: string[];
  }>("smart-quote/configure", token, { method: "POST", body: JSON.stringify(body) }, "No se pudo configurar solución");
}

export async function smartQuoteCopilotDraft(token: string, prompt: string) {
  return sqRequest<{
    intent: { summary: string; questions: string[]; optimize: OptimizeMode; template: string };
    proposal: {
      hardware: QuoteLinePayload[];
      labor: Array<Record<string, unknown>>;
      logistics: QuoteLinePayload | null;
      notes: string[];
    };
    disclaimer: string;
  }>(
    "smart-quote/copilot/draft",
    token,
    { method: "POST", body: JSON.stringify({ prompt }) },
    "No se pudo generar borrador",
  );
}

/** IVA México. CT publica precio de lista sin IVA; se aplica al armar la cotización. */
export const CT_IVA_PERCENT = 16;

/** Precio de venta neto desde costo y margen % sobre venta. */
export function sellFromCost(cost: number, marginPercent: number) {
  const m = Math.min(0.95, Math.max(0.01, marginPercent / 100));
  return Math.round((cost / (1 - m)) * 100) / 100;
}

export function offerToLine(
  offer: SmartOffer,
  qty = 1,
  optimize: OptimizeMode = "BALANCE",
  targetMarginPercent?: number,
): QuoteLinePayload {
  const margin = targetMarginPercent ?? offer.marginPercent ?? 30;
  const unitCost = offer.costMxn;
  const unitPrice =
    targetMarginPercent != null ? sellFromCost(unitCost, margin) : offer.sellPriceSuggested;
  return {
    productCtId: offer.id,
    category: offer.categoria || "CT",
    name: offer.nombre || offer.clave || "Producto",
    description: offer.descripcion,
    brand: offer.marca,
    model: offer.modelo,
    sku: offer.clave,
    partNumber: offer.numParte,
    unit: "pieza",
    qty,
    unitPrice,
    unitCost,
    supplierSku: offer.clave,
    supplierCode: "CT",
    marginPercent: margin,
    stockSnapshot: offer.stockTotal,
    leadTimeDays: offer.leadTimeDays,
    scoreReason: offer.badges[0] || "RECOMMENDED",
    optimizationMode: optimize,
    discount: 0,
    tax: CT_IVA_PERCENT,
    deliveryTime: offer.leadTimeDays <= 1 ? "Inmediata" : `${offer.leadTimeDays} días`,
  };
}

export type CtEnvioForm = {
  nombre: string;
  direccion: string;
  entreCalles?: string;
  noExterior: string;
  noInterior?: string;
  colonia: string;
  estado: string;
  ciudad: string;
  codigoPostal: string;
  telefono: string;
};

export type CtOrderPreview = {
  lines: Array<{
    clave: string | null;
    nombre: string;
    qty: number;
    unitCost: number;
    unitSell: number;
    lineCost: number;
    lineSell: number;
    marginPercent: number | null;
  }>;
  subtotalCost: number;
  subtotalSell: number;
  marginAmount: number;
  quoteStatus: string;
  defaultEnvio: CtEnvioForm | null;
  config: { apiConfigured: boolean; defaultAlmacen: string; warehouses: Array<{ code: string; label: string }> };
  existingOrders: SupplierPurchaseOrderRow[];
};

export type SupplierPurchaseOrderRow = {
  id: number;
  status: string;
  externalFolio: string | null;
  almacen: string;
  errorMessage: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type SupplierStatsResponse = {
  suppliers: Array<{
    supplierCode: string;
    label: string;
    lineCount: number;
    quoteCount: number;
    costNet: number;
    sellNet: number;
    taxAmount: number;
    sellWithTax: number;
    marginAmount: number;
    marginPercent: number;
    priceIncludesTax: boolean;
    customerTaxPercent: number;
  }>;
  totals: {
    quoteCount: number;
    costNet: number;
    sellNet: number;
    taxAmount: number;
    sellWithTax: number;
    marginAmount: number;
    marginPercent: number;
  };
};

export async function smartQuoteSupplierStats(
  token: string,
  params?: { from?: string; to?: string; status?: string },
) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return sqRequest<SupplierStatsResponse>(`smart-quote/supplier-stats${suffix}`, token);
}

export async function smartQuoteCtOrderPreview(token: string, cotizacionId: number) {
  return sqRequest<CtOrderPreview>(`smart-quote/ct/orders/preview/${cotizacionId}`, token);
}

export async function smartQuoteCtOrderSubmit(
  token: string,
  cotizacionId: number,
  body: {
    almacen: string;
    confirm?: boolean;
    envio: CtEnvioForm[];
  },
) {
  return sqRequest<SupplierPurchaseOrderRow>(
    `smart-quote/ct/orders/${cotizacionId}`,
    token,
    { method: "POST", body: JSON.stringify(body) },
    "No se pudo enviar pedido a CT",
  );
}

export async function smartQuoteCtOrderConfirm(token: string, orderId: number) {
  return sqRequest<SupplierPurchaseOrderRow>(
    `smart-quote/ct/orders/confirm/${orderId}`,
    token,
    { method: "POST", body: "{}" },
    "No se pudo confirmar pedido CT",
  );
}
