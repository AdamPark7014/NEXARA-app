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
