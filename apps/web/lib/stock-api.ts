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

export async function listStockLevels(token: string, filters?: { belowReorder?: boolean }) {
  const qs = filters?.belowReorder ? "?belowReorder=true" : "";
  return stockRequest<StockLevelRow[]>(`stock/levels${qs}`, token, {}, "No se pudo cargar el inventario");
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
    existencia: qty,
    minimo: min,
    costo: Number(level.product?.price ?? 0),
  };
}
