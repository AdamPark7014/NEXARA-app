import { buildApiUrl } from "@/lib/api-base";
import { errorLegible } from "@/lib/recursos-ui";

/**
 * Tipos, etiquetas y llamadas de la pantalla de Compras. Viven aparte para que la
 * página se lea como pantalla y no como catálogo de enums.
 */

export type ProcTab = "orders" | "requisitions" | "receipts" | "rfq" | "mayoristas";

export const TABS_COMPRAS: ReadonlyArray<{ key: ProcTab; label: string }> = [
  { key: "requisitions", label: "Requisiciones" },
  { key: "rfq", label: "Cotizaciones" },
  { key: "orders", label: "Órdenes de compra" },
  { key: "receipts", label: "Recepciones" },
  { key: "mayoristas", label: "Mayoristas" },
];

export function tabValida(valor: string | null): ProcTab {
  return TABS_COMPRAS.some((t) => t.key === valor) ? (valor as ProcTab) : "orders";
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  status: string;
  totalAmount: number | string;
  orderDate?: string;
  expectedDate?: string;
  supplier?: { id: number; name: string };
  createdBy?: { nombre?: string };
}

export interface Requisition {
  id: number;
  reqNumber: string;
  title: string;
  status: string;
  priority?: string;
  requiredDate?: string | null;
  requestedBy?: { nombre?: string };
}

export interface GoodsReceipt {
  id: number;
  receiptNumber: string;
  receiptDate?: string;
  purchaseOrderId: number;
  warehouseId?: number | null;
  notes?: string | null;
  freightCost?: number | string;
  insuranceCost?: number | string;
  customsCost?: number | string;
  otherLandedCost?: number | string;
  purchaseOrder?: { id: number; poNumber: string; supplier?: { name?: string } | null };
  warehouse?: { id: number; code?: string; name: string } | null;
  receivedBy?: { nombre?: string };
  items?: Array<{
    id: number;
    quantityReceived: number | string;
    quantityRejected?: number | string;
    lotNumber?: string | null;
    landedCostAllocated?: number | string;
    purchaseOrderItem?: {
      description?: string;
      unitPrice?: number | string;
      product?: { sku?: string; name?: string } | null;
    } | null;
  }>;
}

export interface RfqLine {
  id: number;
  supplierId: number;
  productId?: number | null;
  description: string;
  quantity: number | string;
  unitPrice?: number | string | null;
  leadTimeDays?: number | null;
  notes?: string | null;
  supplier?: { id: number; name: string };
  product?: { id: number; name: string; sku: string } | null;
}

export interface Rfq {
  id: number;
  rfqNumber: string;
  status: "DRAFT" | "SENT" | "QUOTED" | "AWARDED" | "CANCELLED";
  dueDate?: string | null;
  notes?: string | null;
  requisition?: { id: number; reqNumber: string; title: string };
  lines?: RfqLine[];
  _count?: { lines: number };
  awardedPurchaseOrder?: { id: number; poNumber: string } | null;
}

export interface RfqComparisonSupplier {
  supplierId: number;
  supplierName: string;
  lines: RfqLine[];
  totalPrice: number;
  maxLeadTimeDays: number;
  quotedLines: number;
  totalLines: number;
}

export interface RfqComparison {
  rfq: Rfq;
  suppliers: RfqComparisonSupplier[];
  bestPriceSupplierId: number | null;
  bestLeadTimeSupplierId: number | null;
}

export interface PoLine {
  id: number;
  description: string;
  quantity: number | string;
  unitPrice?: number | string;
  receivedQty?: number | string;
}

export interface ReqLine {
  id: number;
  description: string;
  quantity: number | string;
  estimatedCost?: number | string;
}

export type PoDetail = PurchaseOrder & { items?: PoLine[]; notes?: string | null };
export type ReqDetail = Requisition & { items?: ReqLine[]; rejectionReason?: string | null; notes?: string | null };
export type ReceiptLine = {
  purchaseOrderItemId: number;
  description: string;
  ordered: number;
  alreadyReceived: number;
  qty: string;
};
export type Supplier = { id: number; name: string; rfc?: string | null };
export type Warehouse = { id: number; code: string; name: string };

type Variante = "default" | "neutral" | "positive" | "warning" | "danger" | "accent";

export const PO_STATUS: Record<string, string> = {
  DRAFT: "Por aprobar",
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  PARTIALLY_RECEIVED: "Recibida en parte",
  RECEIVED: "Recibida",
  CANCELLED: "Cancelada",
};

export function variantePo(status: string): Variante {
  if (status === "RECEIVED") return "positive";
  if (status === "CANCELLED") return "default";
  if (status === "DRAFT") return "warning";
  if (status === "PARTIALLY_RECEIVED") return "accent";
  return "neutral";
}

/** Para la barra de reparto: color propio por estado y el texto siempre al lado. */
export const PO_STATUS_COLOR: Record<string, string> = {
  DRAFT: "var(--warning)",
  PENDING: "var(--text-tertiary)",
  CONFIRMED: "var(--primary)",
  PARTIALLY_RECEIVED: "var(--accent, var(--primary))",
  RECEIVED: "var(--success)",
  CANCELLED: "var(--border-strong, var(--border))",
};

export const REQ_STATUS: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING: "Por aprobar",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
};

export function varianteReq(status: string): Variante {
  if (status === "APPROVED") return "positive";
  if (status === "REJECTED") return "danger";
  if (status === "PENDING") return "warning";
  return "neutral";
}

export const RFQ_STATUS: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Esperando precios",
  QUOTED: "Con precios",
  AWARDED: "Adjudicada",
  CANCELLED: "Cancelada",
};

export function varianteRfq(status: string): Variante {
  if (status === "AWARDED") return "positive";
  if (status === "QUOTED") return "accent";
  if (status === "SENT") return "warning";
  return "neutral";
}

export const PRIORITIES = ["NORMAL", "URGENT", "CRITICAL"] as const;

/** Incluye los valores viejos (HIGH/MEDIUM/LOW) para no pintar el enum crudo. */
export const PRIORITY_LABEL: Record<string, string> = {
  NORMAL: "Normal",
  URGENT: "Urgente",
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baja",
};

export function prioridad(valor?: string | null): { texto: string; variante: Variante } {
  const clave = valor ?? "NORMAL";
  const texto = PRIORITY_LABEL[clave] ?? "Normal";
  if (clave === "CRITICAL" || clave === "HIGH") return { texto, variante: "danger" };
  if (clave === "URGENT" || clave === "MEDIUM") return { texto, variante: "warning" };
  return { texto, variante: "neutral" };
}

export function ocAbierta(status: string): boolean {
  return status !== "RECEIVED" && status !== "CANCELLED";
}

export function costosExtra(r: GoodsReceipt): number {
  return (
    Number(r.freightCost || 0) +
    Number(r.insuranceCost || 0) +
    Number(r.customsCost || 0) +
    Number(r.otherLandedCost || 0)
  );
}

export { errorLegible };

/** El error lleva el cuerpo de la respuesta; `errorLegible` saca de ahí el mensaje. */
export async function apiFetch<T = unknown>(path: string, token: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: T[] }).data;
  }
  return [];
}

export function sortHighlight<T extends { id: number }>(rows: T[], idParam: string | null) {
  if (!idParam) return rows;
  const id = Number(idParam);
  if (Number.isNaN(id)) return rows;
  return [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
}

export async function descargarPdf(path: string, token: string, nombre: string, fallback: string) {
  const res = await fetch(buildApiUrl(path), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(cuerpo || fallback);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre.replace(/[^\w.-]+/g, "_")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
