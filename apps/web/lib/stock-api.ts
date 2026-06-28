import { buildApiUrl } from "@/lib/api-base";

export type StockLevelRow = {
  id: number;
  quantity: number | string;
  reservedQty?: number | string;
  reorderPoint?: number | string;
  minStock?: number | string;
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
  payload: { type: string; productId: number; toWarehouseId: number; quantity: number; unitCost?: number; reference?: string; notes?: string },
) {
  return stockRequest<unknown>("stock/movements", token, { method: "POST", body: JSON.stringify(payload) }, "No se pudo registrar el movimiento");
}
