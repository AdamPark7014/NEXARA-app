/**
 * NEXARA · Compras a mayorista — cliente API
 * -------------------------------------------
 * Consume `apps/api/src/procurement/wholesale.controller.ts`.
 * Usado por la pestaña "Mayoristas" de `/erp/procurement`.
 */
import { buildApiUrl } from "@/lib/api-base";

export type CreditStatus = {
  /** `null` = sin crédito pactado; se compra de contado. */
  limite: number | null;
  saldo: number;
  disponible: number | null;
  /** Cuánto se pasaría del límite esta compra. 0 si cabe. */
  excedente: number;
  dentroDelLimite: boolean;
  creditoDias: number | null;
};

export type WholesaleTerms = {
  supplierId: number;
  nombre: string;
  esMayorista: boolean;
  creditoDias: number | null;
  limiteCredito: number | null;
  descuentoBase: number | null;
  leadTimeDias: number | null;
  pedidoMinimo: number | null;
  credito: CreditStatus;
};

export type WholesalerRow = {
  id: number;
  nombre: string;
  rfc: string | null;
  creditoDias: number | null;
  leadTimeDias: number | null;
  descuentoBase: number | null;
  pedidoMinimo: number | null;
  credito: CreditStatus;
};

export type PriceBreakRow = {
  id: number;
  supplierId: number;
  productId: number;
  cantidadMinima: string | number;
  unitPrice: string | number;
  currency: string;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  activo: boolean;
  product?: { id: number; sku: string; name: string } | null;
};

export type QuoteLine = {
  productId: number;
  sku: string | null;
  nombre: string | null;
  cantidad: number;
  precioLista: number;
  unitPrice: number;
  /** De dónde salió el precio: escalón, descuento de convenio o lista. */
  origen: "ESCALON" | "DESCUENTO_BASE" | "LISTA";
  cantidadMinima: number | null;
  priceBreakId: number | null;
  ahorroUnitario: number;
  importe: number;
  ahorroLinea: number;
};

export type WholesaleQuote = {
  supplierId: number;
  proveedor: string;
  esMayorista: boolean;
  lineas: QuoteLine[];
  importe: number;
  ahorro: number;
  credito: CreditStatus;
  vencimientoEstimado: string;
  leadTimeDias: number | null;
  /** Avisos, no bloqueos: quien autoriza decide. */
  avisos: string[];
};

export const PRICE_ORIGIN_LABEL: Record<QuoteLine["origen"], string> = {
  ESCALON: "Escalón por volumen",
  DESCUENTO_BASE: "Descuento de convenio",
  LISTA: "Precio de lista",
};

async function apiFetch<T = unknown>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(buildApiUrl(path), { ...init, headers });
  const text = await res.text();

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json?.message) {
        message = Array.isArray(json.message) ? json.message.join(", ") : String(json.message);
      }
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  return (text ? JSON.parse(text) : null) as T;
}

export const listWholesalers = async (token: string): Promise<WholesalerRow[]> => {
  const data = await apiFetch<WholesalerRow[]>("procurement/mayoristas", token);
  return Array.isArray(data) ? data : [];
};

export const getWholesaleTerms = (token: string, supplierId: number) =>
  apiFetch<WholesaleTerms>(`procurement/mayoristas/${supplierId}`, token);

export const updateWholesaleTerms = (
  token: string,
  supplierId: number,
  body: Partial<{
    esMayorista: boolean;
    creditoDias: number | null;
    limiteCredito: number | null;
    descuentoBase: number | null;
    leadTimeDias: number | null;
    pedidoMinimo: number | null;
  }>,
) =>
  apiFetch<WholesaleTerms>(`procurement/mayoristas/${supplierId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const listPriceBreaks = async (
  token: string,
  supplierId: number,
): Promise<PriceBreakRow[]> => {
  const data = await apiFetch<PriceBreakRow[]>(
    `procurement/mayoristas/${supplierId}/escalones`,
    token,
  );
  return Array.isArray(data) ? data : [];
};

export const upsertPriceBreak = (
  token: string,
  supplierId: number,
  body: {
    productId: number;
    cantidadMinima: number;
    unitPrice: number;
    currency?: string;
    vigenteDesde?: string | null;
    vigenteHasta?: string | null;
  },
) =>
  apiFetch<PriceBreakRow>(`procurement/mayoristas/${supplierId}/escalones`, token, {
    method: "PUT",
    body: JSON.stringify(body),
  });

/** No borra: desactiva, para poder explicar después las órdenes ya emitidas. */
export const deactivatePriceBreak = (token: string, supplierId: number, id: number) =>
  apiFetch<{ deactivated: boolean }>(
    `procurement/mayoristas/${supplierId}/escalones/${id}`,
    token,
    { method: "DELETE" },
  );

export const quoteWholesale = (
  token: string,
  supplierId: number,
  items: Array<{ productId: number; quantity: number; listPrice?: number }>,
) =>
  apiFetch<WholesaleQuote>(`procurement/mayoristas/${supplierId}/cotizar`, token, {
    method: "POST",
    body: JSON.stringify({ items }),
  });

export const money = (n: number | string | null | undefined): string => {
  const v = Number(n ?? 0);
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
};
