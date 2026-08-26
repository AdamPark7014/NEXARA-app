/** Códigos de existencia CT (catálogo FTP/JSON) y almacenes API (órdenes). */
export type CtWarehouseOption = { code: string; label: string; city?: string };

/** Catálogo → ciudad legible (existencia keys: PUE, DFA, TPC, …). */
const CATALOG_CODE_LABELS: Record<string, string> = {
  PUE: 'Puebla',
  MTY: 'Monterrey',
  GDL: 'Guadalajara',
  CDMX: 'CDMX',
  DFA: 'CDMX',
  TPC: 'Toluca',
  HMO: 'Hermosillo',
  CHI: 'Chihuahua',
  LEO: 'León',
  CUN: 'Cancún',
  VER: 'Veracruz',
  MID: 'Mérida',
  QRO: 'Querétaro',
  AGU: 'Aguascalientes',
  SAL: 'Saltillo',
  TAM: 'Tampico',
  MAZ: 'Mazatlán',
  OAX: 'Oaxaca',
  TRC: 'Torreón',
  CLN: 'Colima',
  LAP: 'La Paz',
  CUL: 'Culiacán',
  TEP: 'Tepic',
  DGO: 'Durango',
  ZAC: 'Zacatecas',
  CAM: 'Campeche',
  TUX: 'Tuxtepec',
  VHS: 'Villahermosa',
  PDC: 'Piedras Negras',
  CME: 'Ciudad del Carmen',
  COA: 'Coatzacoalcos',
  TAP: 'Tapachula',
  NOG: 'Nogales',
  CJS: 'Ciudad Juárez',
  REY: 'Reynosa',
  MXL: 'Mexicali',
  ENS: 'Ensenada',
  TLA: 'Tlaxcala',
  PUEBLA: 'Puebla',
};

/** Códigos API CT-CONNECT (órdenes) → etiqueta. */
const API_CODE_LABELS: Record<string, string> = {
  '01A': 'Hermosillo',
  '14A': 'Puebla',
  '13A': 'CDMX',
  '35A': 'Monterrey',
  '46A': 'Guadalajara',
  '03A': 'Chihuahua',
  '07A': 'León',
};

export const CT_WAREHOUSE_OPTIONS: CtWarehouseOption[] = [
  { code: 'PUE', label: 'Puebla', city: 'Puebla' },
  { code: '14A', label: 'Puebla', city: 'Puebla' },
  { code: 'MTY', label: 'Monterrey', city: 'Monterrey' },
  { code: '35A', label: 'Monterrey', city: 'Monterrey' },
  { code: 'GDL', label: 'Guadalajara', city: 'Guadalajara' },
  { code: '46A', label: 'Guadalajara', city: 'Guadalajara' },
  { code: 'CDMX', label: 'CDMX', city: 'CDMX' },
  { code: 'DFA', label: 'CDMX', city: 'CDMX' },
  { code: '13A', label: 'CDMX', city: 'CDMX' },
  { code: 'HMO', label: 'Hermosillo', city: 'Hermosillo' },
  { code: '01A', label: 'Hermosillo', city: 'Hermosillo' },
  { code: 'CHI', label: 'Chihuahua', city: 'Chihuahua' },
  { code: '03A', label: 'Chihuahua', city: 'Chihuahua' },
  { code: 'LEO', label: 'León', city: 'León' },
  { code: '07A', label: 'León', city: 'León' },
  { code: 'TPC', label: 'Toluca', city: 'Toluca' },
];

export function preferredCatalogWarehouse(): string {
  return process.env.CT_PREFERRED_WAREHOUSE || 'PUE';
}

export function warehouseLabel(code: string): string {
  const key = String(code || '').trim().toUpperCase();
  if (!key) return '—';
  return CATALOG_CODE_LABELS[key] || API_CODE_LABELS[key] || key;
}

export function warehouseCity(code: string): string | undefined {
  const key = String(code || '').trim().toUpperCase();
  const hit = CT_WAREHOUSE_OPTIONS.find((w) => w.code.toUpperCase() === key);
  return hit?.city ?? warehouseLabel(key);
}

export type StockByWarehouseRow = { code: string; qty: number; label: string; city?: string };

function extractExistenciaQty(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') return Math.max(0, Number(value) || 0);
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    return extractExistenciaQty(obj.qty ?? obj.cantidad ?? obj.existencia ?? obj.quantity);
  }
  return 0;
}

/** Normaliza existencia CT desde JSONB: plano, claves minúsculas, anidado {qty}, arrays. */
export function normalizeExistencia(existencia: unknown): Record<string, number> {
  if (!existencia) return {};

  if (Array.isArray(existencia)) {
    const out: Record<string, number> = {};
    for (const item of existencia) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const code = String(row.code ?? row.almacen ?? row.warehouse ?? row.codigo ?? '')
        .trim()
        .toUpperCase();
      if (!code) continue;
      const qty = extractExistenciaQty(row.qty ?? row.cantidad ?? row.existencia ?? row.quantity);
      if (qty > 0) out[code] = (out[code] || 0) + qty;
    }
    return out;
  }

  if (typeof existencia !== 'object') return {};

  const out: Record<string, number> = {};
  for (const [rawCode, rawQty] of Object.entries(existencia as Record<string, unknown>)) {
    const code = String(rawCode).trim().toUpperCase();
    if (!code) continue;
    const qty = extractExistenciaQty(rawQty);
    if (qty > 0) out[code] = (out[code] || 0) + qty;
  }
  return out;
}

export function stockAtWarehouseCodes(existencia: unknown, codes: string[]): number {
  const normalized = normalizeExistencia(existencia);
  if (!codes.length) return 0;
  const set = new Set(codes.map((c) => String(c).trim().toUpperCase()));
  return Object.entries(normalized).reduce(
    (sum, [code, qty]) => (set.has(code) ? sum + qty : sum),
    0,
  );
}

/** Suma stock en todos los almacenes de la misma ciudad (PUE + 14A → Puebla). */
export function stockAtPreferredWarehouse(existencia: unknown, preferredCode: string): number {
  const key = String(preferredCode || '').trim().toUpperCase();
  if (!key) return 0;
  const city = warehouseCity(key) ?? warehouseLabel(key);
  const codes = CT_WAREHOUSE_OPTIONS.filter(
    (w) => w.city === city || w.code.toUpperCase() === key || w.label === city,
  ).map((w) => w.code);
  const unique = [...new Set([key, ...codes])];
  return stockAtWarehouseCodes(existencia, unique);
}

export function stockRowsFromExistencia(existencia: unknown, max = 8): StockByWarehouseRow[] {
  const normalized = normalizeExistencia(existencia);
  if (!Object.keys(normalized).length) return [];
  return Object.entries(normalized)
    .map(([code, qty]) => ({
      code,
      qty: Number(qty) || 0,
      label: warehouseLabel(code),
      city: warehouseCity(code),
    }))
    .filter((x) => x.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, max);
}

/** Catálogo FTP → código API CT-CONNECT (pedidos). */
const CATALOG_TO_API: Record<string, string> = {
  PUE: '14A',
  PUEBLA: '14A',
  MTY: '35A',
  GDL: '46A',
  CDMX: '13A',
  DFA: '13A',
  HMO: '01A',
  CHI: '03A',
  LEO: '07A',
  '14A': '14A',
  '35A': '35A',
  '46A': '46A',
  '13A': '13A',
  '01A': '01A',
  '03A': '03A',
  '07A': '07A',
};

export function apiWarehouseForCatalogCode(code: string): string {
  const key = String(code || '').trim().toUpperCase();
  if (!key) return preferredCatalogWarehouse() === 'PUE' ? '14A' : '01A';
  if (CATALOG_TO_API[key]) return CATALOG_TO_API[key];
  if (/^\d{2}A$/.test(key)) return key;
  return '14A';
}

export function stockAtApiWarehouse(existencia: unknown, apiCode: string): number {
  const normalized = normalizeExistencia(existencia);
  const target = String(apiCode || '').trim().toUpperCase();
  return Object.entries(normalized).reduce((sum, [code, qty]) => {
    return apiWarehouseForCatalogCode(code) === target ? sum + qty : sum;
  }, 0);
}

export type FulfillmentWarehouseOption = {
  apiCode: string;
  label: string;
  qty: number;
  local: boolean;
};

export function fulfillmentOptionsFromStock(
  existencia: unknown,
  preferredCatalogCodes: string[] = [],
): FulfillmentWarehouseOption[] {
  const pref = new Set(preferredCatalogCodes.map((c) => c.toUpperCase()));
  const rows = stockRowsFromExistencia(existencia, 24);
  const byApi = new Map<string, FulfillmentWarehouseOption>();
  for (const r of rows) {
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

export function suggestApiWarehouse(
  existencia: unknown,
  preferredCatalogCodes: string[] = [],
  fallback?: string,
): string {
  const opts = fulfillmentOptionsFromStock(existencia, preferredCatalogCodes);
  if (!opts.length) return fallback || apiWarehouseForCatalogCode(preferredCatalogWarehouse());
  const local = opts.find((o) => o.local && o.qty > 0);
  return local?.apiCode || opts[0].apiCode;
}

/** Para dropdowns de pedido CT (códigos API). */
export const CT_ORDER_WAREHOUSES: Array<{ code: string; label: string }> = [
  { code: '01A', label: 'Hermosillo' },
  { code: '14A', label: 'Puebla' },
  { code: '13A', label: 'CDMX' },
  { code: '35A', label: 'Monterrey' },
  { code: '46A', label: 'Guadalajara' },
  { code: '03A', label: 'Chihuahua' },
  { code: '07A', label: 'León' },
];
