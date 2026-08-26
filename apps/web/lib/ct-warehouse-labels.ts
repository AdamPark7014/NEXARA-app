/** Etiquetas de almacenes CT para UI (paridad con API `ct-warehouses.ts`). */

export type CtWarehouseOption = { code: string; label: string; city?: string };

export type StockByWarehouseRow = { code: string; qty: number; label?: string; city?: string };

const CATALOG_CODE_LABELS: Record<string, string> = {
  PUE: "Puebla",
  MTY: "Monterrey",
  GDL: "Guadalajara",
  CDMX: "CDMX",
  DFA: "CDMX",
  TPC: "Toluca",
  HMO: "Hermosillo",
  CHI: "Chihuahua",
  LEO: "León",
  "14A": "Puebla",
  "35A": "Monterrey",
  "46A": "Guadalajara",
  "13A": "CDMX",
  "01A": "Hermosillo",
  "03A": "Chihuahua",
  "07A": "León",
};

export function warehouseLabel(code: string): string {
  const key = String(code || "").trim().toUpperCase();
  if (!key) return "—";
  return CATALOG_CODE_LABELS[key] || key;
}

/** Códigos de catálogo que corresponden a una ciudad (Puebla, Monterrey, …). */
export function codesForCity(city: string): string[] {
  const c = city.toLowerCase();
  if (c.includes("puebla")) return ["PUE", "14A"];
  if (c.includes("monterrey")) return ["MTY", "35A"];
  if (c.includes("guadalajara")) return ["GDL", "46A"];
  if (c.includes("cdmx") || c.includes("mexico")) return ["CDMX", "DFA", "13A"];
  if (c.includes("hermosillo")) return ["HMO", "01A"];
  return [];
}

export function stockAtPreferred(
  rows: StockByWarehouseRow[] | undefined,
  preferredCodes: string[],
): number {
  if (!rows?.length || !preferredCodes.length) return 0;
  const set = new Set(preferredCodes.map((c) => c.toUpperCase()));
  return rows.reduce((sum, r) => (set.has(r.code.toUpperCase()) ? sum + r.qty : sum), 0);
}

/** Códigos API CT-CONNECT para pedidos. */
export const CT_ORDER_WAREHOUSES: Array<{ code: string; label: string }> = [
  { code: "01A", label: "Hermosillo" },
  { code: "14A", label: "Puebla" },
  { code: "13A", label: "CDMX" },
  { code: "35A", label: "Monterrey" },
  { code: "46A", label: "Guadalajara" },
  { code: "03A", label: "Chihuahua" },
  { code: "07A", label: "León" },
];

const CATALOG_TO_API: Record<string, string> = {
  PUE: "14A",
  PUEBLA: "14A",
  MTY: "35A",
  GDL: "46A",
  CDMX: "13A",
  DFA: "13A",
  HMO: "01A",
  CHI: "03A",
  LEO: "07A",
  "14A": "14A",
  "35A": "35A",
  "46A": "46A",
  "13A": "13A",
  "01A": "01A",
  "03A": "03A",
  "07A": "07A",
};

export function apiWarehouseForCatalogCode(code: string): string {
  const key = String(code || "").trim().toUpperCase();
  if (!key) return "14A";
  if (CATALOG_TO_API[key]) return CATALOG_TO_API[key];
  if (/^\d{2}A$/.test(key)) return key;
  return "14A";
}

export type FulfillmentWarehouseOption = {
  apiCode: string;
  label: string;
  qty: number;
  local: boolean;
};

export function fulfillmentOptionsFromStockRows(
  rows: StockByWarehouseRow[] | undefined,
  preferredCatalogCodes: string[] = [],
): FulfillmentWarehouseOption[] {
  if (!rows?.length) return [];
  const pref = new Set(preferredCatalogCodes.map((c) => c.toUpperCase()));
  const byApi = new Map<string, FulfillmentWarehouseOption>();
  for (const r of rows) {
    if (r.qty <= 0) continue;
    const apiCode = apiWarehouseForCatalogCode(r.code);
    const label = r.city || r.label || warehouseLabel(r.code);
    const local = pref.has(r.code.toUpperCase());
    const prev = byApi.get(apiCode);
    if (prev) {
      prev.qty += r.qty;
      prev.local = prev.local || local;
    } else {
      byApi.set(apiCode, { apiCode, label, qty: r.qty, local });
    }
  }
  return [...byApi.values()].sort(
    (a, b) => (b.local ? 1 : 0) - (a.local ? 1 : 0) || b.qty - a.qty,
  );
}

export function suggestApiWarehouseFromRows(
  rows: StockByWarehouseRow[] | undefined,
  preferredCatalogCodes: string[] = [],
  fallback = "14A",
): string {
  const opts = fulfillmentOptionsFromStockRows(rows, preferredCatalogCodes);
  if (!opts.length) return fallback;
  const local = opts.find((o) => o.local && o.qty > 0);
  return local?.apiCode || opts[0].apiCode;
}

export function stockAtApiWarehouseFromRows(
  rows: StockByWarehouseRow[] | undefined,
  apiCode: string,
): number {
  const target = String(apiCode || "").trim().toUpperCase();
  return (rows || []).reduce((sum, r) => {
    return apiWarehouseForCatalogCode(r.code) === target ? sum + r.qty : sum;
  }, 0);
}

export function warehouseApiLabel(apiCode: string): string {
  const hit = CT_ORDER_WAREHOUSES.find((w) => w.code === apiCode);
  return hit ? `${hit.code} · ${hit.label}` : apiCode;
}

export function leadTimeForFulfillment(opt: FulfillmentWarehouseOption): {
  days: number;
  deliveryTime: string;
} {
  if (opt.local && opt.qty > 0) {
    return { days: 1, deliveryTime: `Recoger · ${opt.label}` };
  }
  if (opt.qty > 0) {
    return { days: 3, deliveryTime: `Traslado desde ${opt.label}` };
  }
  return { days: 7, deliveryTime: "Por confirmar con CT" };
}

export function formatStockByWarehouse(
  rows: StockByWarehouseRow[] | undefined,
  opts?: { max?: number; preferredCodes?: string[] },
): string {
  if (!rows?.length) return "";
  const max = opts?.max ?? 4;
  const pref = new Set((opts?.preferredCodes ?? []).map((c) => c.toUpperCase()));
  const sorted = [...rows].sort((a, b) => {
    const ap = pref.has(a.code.toUpperCase()) ? 1 : 0;
    const bp = pref.has(b.code.toUpperCase()) ? 1 : 0;
    if (bp !== ap) return bp - ap;
    return b.qty - a.qty;
  });
  return sorted
    .slice(0, max)
    .map((r) => `${r.label || warehouseLabel(r.code)} ${r.qty}`)
    .join(" · ");
}
