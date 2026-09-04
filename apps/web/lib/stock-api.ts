import { buildApiUrl } from "@/lib/api-base";

export type StockLevelRow = {
  id: number;
  quantity: number | string;
  reservedQty?: number | string;
  reorderPoint?: number | string;
  minStock?: number | string;
  unitCost?: number | string;
  product?: {
    id: number;
    name: string;
    sku: string;
    category?: string | null;
    price?: number | null;
  } | null;
  warehouse?: { id: number; code?: string; name: string } | null;
  location?: { id: number; code?: string; name?: string } | null;
};

async function stockRequest<T>(path: string, token: string, init: RequestInit = {}, fallbackError: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data?.message === "string" ? data.message : fallbackError);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

// Normalize: some endpoints return plain [] while others return { data: [], total: N }
function unwrapArray<T>(res: T[] | { data: T[] } | null | undefined): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray((res as { data: T[] }).data)) return (res as { data: T[] }).data;
  return [];
}

export async function listStockLevels(token: string, filters?: { belowReorder?: boolean }) {
  const qs = filters?.belowReorder ? "?belowReorder=true" : "";
  const raw = await stockRequest<StockLevelRow[] | { data: StockLevelRow[] }>(`stock/levels${qs}`, token, {}, "No se pudo cargar el inventario");
  return unwrapArray(raw);
}

export async function updateStockLevelConfig(
  token: string,
  id: number,
  payload: { reorderPoint?: number; minStock?: number; maxStock?: number },
) {
  return stockRequest<StockLevelRow>(`stock/levels/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) }, "No se pudo actualizar el stock");
}

export function mapStockLevelToRow(level: StockLevelRow) {
  const qty = Number(level.quantity ?? 0);
  const min = Number(level.minStock ?? level.reorderPoint ?? 0);
  return {
    id: level.id,
    productId: level.product?.id,
    sku: level.product?.sku ?? "—",
    nombre: level.product?.name ?? "—",
    categoria: level.product?.category ?? "—",
    ubicacion: level.location?.code ?? level.location?.name ?? level.warehouse?.name ?? "—",
    warehouseId: level.warehouse?.id,
    existencia: qty,
    minimo: min,
    costo: Number(level.product?.price ?? 0),
  };
}

export async function listWarehouses(token: string) {
  const raw = await stockRequest<Array<{ id: number; name: string; code?: string }> | { data: Array<{ id: number; name: string; code?: string }> }>("warehouse", token, {}, "No se pudieron cargar almacenes");
  return unwrapArray(raw);
}

export async function listCatalogProducts(token: string) {
  const raw = await stockRequest<Array<{ id: number; name: string; sku: string }> | { data: Array<{ id: number; name: string; sku: string }> }>("catalog/products?take=200", token, {}, "No se pudieron cargar productos");
  return unwrapArray(raw);
}

export async function createStockMovement(
  token: string,
  payload: {
    type: string;
    productId: number;
    fromWarehouseId?: number;
    toWarehouseId?: number;
    quantity: number;
    unitCost?: number;
    reference?: string;
    notes?: string;
    purchaseOrderId?: number;
    productionOrderId?: number;
    activityId?: number;
  },
) {
  return stockRequest<unknown>("stock/movements", token, { method: "POST", body: JSON.stringify(payload) }, "No se pudo registrar el movimiento");
}

export type StockMovementRow = {
  id: number;
  movementNumber: string;
  type: string;
  quantity: number | string;
  fromQtyBefore?: number | string | null;
  fromQtyAfter?: number | string | null;
  toQtyBefore?: number | string | null;
  toQtyAfter?: number | string | null;
  unitCost?: number | string;
  totalCost?: number | string;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
  product?: { id: number; name: string; sku: string } | null;
  fromWarehouse?: { id: number; name: string; code?: string } | null;
  toWarehouse?: { id: number; name: string; code?: string } | null;
  lot?: { id: number; lotNumber: string } | null;
  createdBy?: { id: number; nombre: string } | null;
  purchaseOrder?: { id: number; poNumber: string } | null;
  productionOrder?: { id: number; orderNumber: string } | null;
  activity?: { id: number; anNumber: string; titulo?: string | null } | null;
};

/** Etiqueta de documento ligado al movimiento (OC, OP, AN, referencia libre). */
export function stockMovementDocumentLabel(m: StockMovementRow): string {
  const parts: string[] = [];
  if (m.purchaseOrder?.poNumber) parts.push(`OC ${m.purchaseOrder.poNumber}`);
  if (m.productionOrder?.orderNumber) parts.push(`OP ${m.productionOrder.orderNumber}`);
  if (m.activity?.anNumber) parts.push(`AN ${m.activity.anNumber}`);
  if (m.reference?.trim()) parts.push(m.reference.trim());
  return parts.length ? parts.join(" · ") : "—";
}

/** Resumen saldo antes→después (prioriza origen; si no, destino). */
export function stockMovementBalanceLabel(m: StockMovementRow): string {
  const fmt = (v: number | string | null | undefined) =>
    v == null || v === "" ? null : Number(v);
  const fromB = fmt(m.fromQtyBefore);
  const fromA = fmt(m.fromQtyAfter);
  if (fromB != null && fromA != null) return `${fromB} → ${fromA}`;
  const toB = fmt(m.toQtyBefore);
  const toA = fmt(m.toQtyAfter);
  if (toB != null && toA != null) return `${toB} → ${toA}`;
  return "—";
}

export async function listStockMovements(
  token: string,
  filters?: { productId?: number; warehouseId?: number; type?: string; from?: string; to?: string },
) {
  const qs = new URLSearchParams();
  if (filters?.productId) qs.set("productId", String(filters.productId));
  if (filters?.warehouseId) qs.set("warehouseId", String(filters.warehouseId));
  if (filters?.type) qs.set("type", filters.type);
  if (filters?.from) qs.set("from", filters.from);
  if (filters?.to) qs.set("to", filters.to);
  const raw = await stockRequest<StockMovementRow[] | { data: StockMovementRow[] }>(
    `stock/movements?${qs}`,
    token,
    {},
    "No se pudieron cargar los movimientos",
  );
  return unwrapArray(raw);
}

async function downloadStockPdf(token: string, path: string, fallbackName: string) {
  const res = await fetch(buildApiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data?.message === "string" ? data.message : "No se pudo generar el PDF");
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(cd);
  const filename = match?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadStockMovementsPdf(
  token: string,
  filters?: { productId?: number; warehouseId?: number; type?: string; from?: string; to?: string },
) {
  const qs = new URLSearchParams();
  if (filters?.productId) qs.set("productId", String(filters.productId));
  if (filters?.warehouseId) qs.set("warehouseId", String(filters.warehouseId));
  if (filters?.type) qs.set("type", filters.type);
  if (filters?.from) qs.set("from", filters.from);
  if (filters?.to) qs.set("to", filters.to);
  return downloadStockPdf(token, `stock/movements/pdf?${qs}`, "kardex-movimientos.pdf");
}

export async function downloadStockMovementSlipPdf(token: string, id: number) {
  return downloadStockPdf(token, `stock/movements/${id}/pdf`, `MOV-${id}.pdf`);
}

export type LotRow = {
  id: number;
  lotNumber: string;
  expirationDate?: string | null;
  manufacturingDate?: string | null;
  notes?: string | null;
  createdAt: string;
  product?: { id: number; name: string; sku: string } | null;
};

export async function listLots(token: string, productId?: number) {
  const qs = productId ? `?productId=${productId}` : "";
  const raw = await stockRequest<LotRow[] | { data: LotRow[] }>(`stock/lots${qs}`, token, {}, "No se pudieron cargar los lotes");
  return unwrapArray(raw);
}

export async function createLot(
  token: string,
  payload: { lotNumber: string; productId: number; expirationDate?: string; manufacturingDate?: string; notes?: string },
) {
  return stockRequest<LotRow>("stock/lots", token, { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear el lote");
}

export type ValuationRow = StockLevelRow & { totalValue: number; availableQty: number };

export async function getStockValuation(token: string, warehouseId?: number) {
  const qs = warehouseId ? `?warehouseId=${warehouseId}` : "";
  const raw = await stockRequest<ValuationRow[] | { data: ValuationRow[] }>(
    `stock/valuation${qs}`,
    token,
    {},
    "No se pudo cargar la valuación",
  );
  return unwrapArray(raw);
}

export type InventoryInsights = {
  generatedAt: string;
  kpis: {
    skuLocations: number;
    totalValue: number;
    zeroStock: number;
    lowStock: number;
    overstock: number;
    deadStock: number;
    deadStockValue: number;
    cogs30d: number;
    receiptsValue30d: number;
    turnoverAnnualProxy: number;
    fillHealthyPct: number;
    abcA: number;
    abcB: number;
    abcC: number;
  };
  aging: { d0_30: number; d30_60: number; d60_90: number; d90_plus: number };
  trends: {
    inflow14d: Array<{ date: string; qty: number }>;
    outflow14d: Array<{ date: string; qty: number }>;
  };
  byWarehouse: Array<{ name: string; skus: number; value: number; low: number }>;
  topMovers: Array<{
    productId: number;
    sku: string;
    name: string;
    dispatched30d: number;
    valueOnHand: number;
    daysOfCover: number | null;
  }>;
  slowMovers: Array<{
    productId: number;
    sku: string;
    name: string;
    quantity: number;
    value: number;
    idleDays: number | null;
  }>;
  reorderSuggestions: Array<{
    productId: number;
    sku: string;
    name: string;
    warehouse: string;
    onHand: number;
    reorderPoint: number;
    suggestedQty: number;
    estimatedCost: number;
  }>;
  expiringLots: Array<{
    id: number;
    lotNumber: string;
    product: string;
    sku: string;
    expirationDate: string;
    daysLeft: number;
  }>;
  alerts: Array<{ severity: "danger" | "warning"; message: string }>;
};

export async function getInventoryInsights(token: string) {
  return stockRequest<InventoryInsights>("stock/insights", token, {}, "No se pudo cargar inteligencia de inventario");
}

// ── Cycle Counts ────────────────────────────────────────────────────
export type CycleCountItemRow = {
  id: number;
  productId: number;
  expectedQty: number | string;
  countedQty: number | string | null;
  varianceQty: number | string | null;
  countedAt?: string | null;
  product?: { id: number; name: string; sku: string } | null;
};

export type CycleCountRow = {
  id: number;
  countNumber: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "CLOSED" | "CANCELLED";
  scheduledFor: string;
  closedAt?: string | null;
  notes?: string | null;
  warehouse?: { id: number; name: string; code?: string } | null;
  items?: CycleCountItemRow[];
  _count?: { items: number };
  createdBy?: { id: number; nombre: string } | null;
  closedBy?: { id: number; nombre: string } | null;
};

export async function listCycleCounts(token: string, filters?: { warehouseId?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (filters?.warehouseId) qs.set("warehouseId", String(filters.warehouseId));
  if (filters?.status) qs.set("status", filters.status);
  const raw = await stockRequest<CycleCountRow[] | { data: CycleCountRow[] }>(
    `stock/cycle-counts?${qs}`, token, {}, "No se pudieron cargar los conteos cíclicos",
  );
  return unwrapArray(raw);
}

export async function getCycleCount(token: string, id: number) {
  return stockRequest<CycleCountRow>(`stock/cycle-counts/${id}`, token, {}, "No se pudo cargar el conteo");
}

export async function scheduleCycleCount(
  token: string,
  payload: { warehouseId: number; scheduledFor: string; productIds?: number[]; notes?: string },
) {
  return stockRequest<CycleCountRow>("stock/cycle-counts", token, { method: "POST", body: JSON.stringify(payload) }, "No se pudo programar el conteo");
}

export async function recordCycleCountItems(
  token: string,
  id: number,
  items: { productId: number; countedQty: number }[],
) {
  return stockRequest<CycleCountRow>(`stock/cycle-counts/${id}/items`, token, { method: "POST", body: JSON.stringify({ items }) }, "No se pudo capturar el conteo");
}

export async function closeCycleCount(token: string, id: number) {
  return stockRequest<CycleCountRow>(`stock/cycle-counts/${id}/close`, token, { method: "POST" }, "No se pudo cerrar el conteo");
}

export async function cancelCycleCount(token: string, id: number) {
  return stockRequest<CycleCountRow>(`stock/cycle-counts/${id}/cancel`, token, { method: "POST" }, "No se pudo cancelar el conteo");
}

// ── Stock Reservations ──────────────────────────────────────────────
export type StockReservationRow = {
  id: number;
  quantity: number | string;
  status: "ACTIVE" | "RELEASED" | "CONSUMED";
  reason: string;
  referenceType?: string | null;
  referenceId?: number | null;
  expiresAt?: string | null;
  createdAt: string;
  product?: { id: number; name: string; sku: string } | null;
  warehouse?: { id: number; name: string; code?: string } | null;
  createdBy?: { id: number; nombre: string } | null;
};

export async function listReservations(token: string, filters?: { warehouseId?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (filters?.warehouseId) qs.set("warehouseId", String(filters.warehouseId));
  if (filters?.status) qs.set("status", filters.status);
  const raw = await stockRequest<StockReservationRow[] | { data: StockReservationRow[] }>(
    `stock/reservations?${qs}`, token, {}, "No se pudieron cargar las reservas",
  );
  return unwrapArray(raw);
}

export async function createReservation(
  token: string,
  payload: { productId: number; warehouseId: number; quantity: number; reason: string; expiresAt?: string },
) {
  return stockRequest<StockReservationRow>("stock/reservations", token, { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear la reserva");
}

export async function releaseReservation(token: string, id: number) {
  return stockRequest<StockReservationRow>(`stock/reservations/${id}/release`, token, { method: "PATCH" }, "No se pudo liberar la reserva");
}
