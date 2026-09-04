"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import PanelTabs from "@/components/ui/PanelTabs";
import { useUser } from "@/components/UserContext";
import { getErpInventorySectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import WholesalePanel from "@/components/WholesalePanel";
import EmptyState from "@/components/ui/EmptyState";
import chrome from "@/components/crm/crm-chrome.module.css";

type ProcTab = "orders" | "requisitions" | "receipts" | "rfq" | "mayoristas";

interface PurchaseOrder {
  id: number;
  poNumber: string;
  status: string;
  totalAmount: number | string;
  orderDate?: string;
  expectedDate?: string;
  supplier?: { id: number; name: string };
  createdBy?: { nombre?: string };
}

interface Requisition {
  id: number;
  reqNumber: string;
  title: string;
  status: string;
  priority?: string;
  requiredDate?: string | null;
  requestedBy?: { nombre?: string };
}

interface GoodsReceipt {
  id: number;
  receiptNumber: string;
  receiptDate?: string;
  purchaseOrderId: number;
  purchaseOrder?: { id: number; poNumber: string };
  receivedBy?: { nombre?: string };
}

interface RfqLine {
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

interface Rfq {
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

interface RfqComparisonSupplier {
  supplierId: number;
  supplierName: string;
  lines: RfqLine[];
  totalPrice: number;
  maxLeadTimeDays: number;
  quotedLines: number;
  totalLines: number;
}

interface RfqComparison {
  rfq: Rfq;
  suppliers: RfqComparisonSupplier[];
  bestPriceSupplierId: number | null;
  bestLeadTimeSupplierId: number | null;
}

const RFQ_STATUS: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  QUOTED: "Cotizada",
  AWARDED: "Adjudicada",
  CANCELLED: "Cancelada",
};

interface PoLine {
  id: number;
  description: string;
  quantity: number | string;
  unitPrice?: number | string;
  receivedQty?: number | string;
}

interface ReqLine {
  id: number;
  description: string;
  quantity: number | string;
  estimatedCost?: number | string;
}

type PoDetail = PurchaseOrder & { items?: PoLine[]; notes?: string | null };
type ReqDetail = Requisition & { items?: ReqLine[]; rejectionReason?: string | null; notes?: string | null };
type ReceiptLine = { purchaseOrderItemId: number; description: string; ordered: number; alreadyReceived: number; qty: string };

async function apiFetch<T = unknown>(path: string, token: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: T[] }).data;
  }
  return [];
}

function sortHighlight<T extends { id: number }>(rows: T[], idParam: string | null) {
  if (!idParam) return rows;
  const id = Number(idParam);
  if (Number.isNaN(id)) return rows;
  return [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
}

const PO_STATUS: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  PARTIALLY_RECEIVED: "Parcial",
  RECEIVED: "Recibida",
  CANCELLED: "Cancelada",
};

const REQ_STATUS: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
};

const PRIORITIES = ["NORMAL", "URGENT", "CRITICAL"] as const;
const PRIORITY_LABEL: Record<string, string> = { NORMAL: "Normal", URGENT: "Urgente", CRITICAL: "Crítica" };

type ReqItem = { description: string; quantity: number; estimatedCost: string };
type PoItem  = { description: string; quantity: number; unitPrice: string };

const emptyReqForm = { title: "", priority: "NORMAL" };
const emptyReqItem: ReqItem = { description: "", quantity: 1, estimatedCost: "" };
const emptyPoForm  = { supplierName: "", expectedDate: "" };
const emptyPoItem: PoItem  = { description: "", quantity: 1, unitPrice: "" };

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 9px", border: "1px solid var(--border)",
  borderRadius: 7, background: "var(--surface)", color: "var(--foreground)", fontSize: 12.5, boxSizing: "border-box",
};

export default function ProcurementPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpInventorySectionConfig(user, "procurement"), [user]);
  const token = user?.token ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = (searchParams.get("tab") as ProcTab) || "orders";
  const highlightId = searchParams.get("id");
  const poId = searchParams.get("poId");

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [filterPoStatus, setFilterPoStatus] = useState("");
  const [filterReqStatus, setFilterReqStatus] = useState("");

  // ── Create Requisición ──────────────────────────────────────────────────
  const [showReqForm, setShowReqForm] = useState(false);
  const [reqForm, setReqForm] = useState({ ...emptyReqForm });
  const [reqItems, setReqItems] = useState<ReqItem[]>([{ ...emptyReqItem }]);
  const [savingReq, setSavingReq] = useState(false);

  // ── Create OC ──────────────────────────────────────────────────────────
  const [showPoForm, setShowPoForm] = useState(false);
  const [poForm, setPoForm] = useState({ ...emptyPoForm });
  const [poItems, setPoItems] = useState<PoItem[]>([{ ...emptyPoItem }]);
  const [savingPo, setSavingPo] = useState(false);

  // ── Recepción de mercancía ─────────────────────────────────────────────
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptPoId, setReceiptPoId] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptWarehouseId, setReceiptWarehouseId] = useState("");
  const [receiptLandedCost, setReceiptLandedCost] = useState({ freightCost: "", insuranceCost: "", customsCost: "", otherLandedCost: "" });
  const [warehouses, setWarehouses] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [savingReceipt, setSavingReceipt] = useState(false);

  // ── Rechazar requisición ───────────────────────────────────────────────
  const [rejectReqModal, setRejectReqModal] = useState<Requisition | null>(null);
  const [rejectReqReason, setRejectReqReason] = useState("");
  const [rejectingReq, setRejectingReq] = useState(false);
  const [rejectReqErr, setRejectReqErr] = useState<string | null>(null);

  // ── RFQ multi-proveedor ────────────────────────────────────────────────
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string; rfc?: string | null }>>([]);
  const [savingSupplierRfcId, setSavingSupplierRfcId] = useState<number | null>(null);
  const [showRfqForm, setShowRfqForm] = useState(false);
  const [rfqForm, setRfqForm] = useState<{ requisitionId: string; supplierIds: number[]; dueDate: string; notes: string }>({ requisitionId: "", supplierIds: [], dueDate: "", notes: "" });
  const [savingRfq, setSavingRfq] = useState(false);
  const [rfqComparison, setRfqComparison] = useState<RfqComparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState<Record<number, { unitPrice: string; leadTimeDays: string }>>({});
  const [savingQuoteLineId, setSavingQuoteLineId] = useState<number | null>(null);
  const [awardingSupplierId, setAwardingSupplierId] = useState<number | null>(null);

  const [detailKind, setDetailKind] = useState<"order" | "req" | null>(null);
  const [poDetail, setPoDetail] = useState<PoDetail | null>(null);
  const [reqDetail, setReqDetail] = useState<ReqDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>([]);
  const [loadingReceiptPo, setLoadingReceiptPo] = useState(false);
  const [receiptErr, setReceiptErr] = useState<string | null>(null);

  const setTab = (next: ProcTab) => {
    const p = new URLSearchParams();
    p.set("tab", next);
    router.push(`/erp/procurement?${p.toString()}`);
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (tab === "orders") {
        setOrders(unwrapList<PurchaseOrder>(await apiFetch("procurement/purchase-orders", token)));
      } else if (tab === "requisitions") {
        setRequisitions(unwrapList<Requisition>(await apiFetch("procurement/requisitions", token)));
      } else if (tab === "rfq") {
        const [rfqRows, reqRows, supplierRows] = await Promise.all([
          apiFetch<Rfq[] | { data: Rfq[] }>("procurement/rfq", token),
          apiFetch<Requisition[] | { data: Requisition[] }>("procurement/requisitions", token),
          apiFetch<Array<{ id: number; name: string }> | { data: Array<{ id: number; name: string }> }>("procurement/purchase-orders/suppliers", token),
        ]);
        setRfqs(unwrapList<Rfq>(rfqRows));
        setRequisitions(unwrapList<Requisition>(reqRows));
        setSuppliers(unwrapList<{ id: number; name: string }>(supplierRows));
      } else {
        const qs = poId ? `?purchaseOrderId=${poId}` : "";
        setReceipts(unwrapList<GoodsReceipt>(await apiFetch(`procurement/goods-receipts${qs}`, token)));
      }
    } catch (e) {
      toast.error("Error al cargar: " + (e instanceof Error ? e.message : "error"));
    } finally {
      setLoading(false);
    }
  }, [token, tab, poId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !showReceiptForm) return;
    void (async () => {
      try {
        const rows = unwrapList<{ id: number; code: string; name: string; isActive?: boolean }>(
          await apiFetch("warehouse", token),
        );
        const active = rows.filter((w) => w.isActive !== false);
        setWarehouses(active);
        if (!receiptWarehouseId && active[0]) setReceiptWarehouseId(String(active[0].id));
      } catch {
        setWarehouses([]);
      }
    })();
  }, [token, showReceiptForm]);

  const visibleOrders = useMemo(() => {
    let rows = orders;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((o) =>
        (o.poNumber ?? "").toLowerCase().includes(q) ||
        (o.supplier?.name ?? "").toLowerCase().includes(q) ||
        (o.createdBy?.nombre ?? "").toLowerCase().includes(q)
      );
    }
    if (filterPoStatus) rows = rows.filter((o) => o.status === filterPoStatus);
    return sortHighlight(rows, highlightId);
  }, [orders, highlightId, searchQ, filterPoStatus]);

  const visibleReqs = useMemo(() => {
    let rows = requisitions;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((r) =>
        (r.reqNumber ?? "").toLowerCase().includes(q) ||
        (r.title ?? "").toLowerCase().includes(q) ||
        (r.requestedBy?.nombre ?? "").toLowerCase().includes(q)
      );
    }
    if (filterReqStatus) rows = rows.filter((r) => r.status === filterReqStatus);
    return sortHighlight(rows, highlightId);
  }, [requisitions, highlightId, searchQ, filterReqStatus]);

  const visibleReceipts = useMemo(() => {
    let rows = receipts;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((r) =>
        (r.receiptNumber ?? "").toLowerCase().includes(q) ||
        (r.purchaseOrder?.poNumber ?? "").toLowerCase().includes(q) ||
        (r.receivedBy?.nombre ?? "").toLowerCase().includes(q)
      );
    }
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = rows.filter((r) => r.id === id);
    }
    return rows;
  }, [receipts, highlightId, searchQ]);

  const saveReq = async () => {
    if (!token || !reqForm.title.trim()) return;
    const items = reqItems.filter(i => i.description.trim());
    if (!items.length) return;
    setSavingReq(true);
    try {
      await apiFetch("procurement/requisitions", token, {
        method: "POST",
        body: JSON.stringify({
          title: reqForm.title.trim(),
          priority: reqForm.priority,
          items: items.map(i => ({
            description: i.description.trim(),
            quantity: Number(i.quantity),
            estimatedCost: i.estimatedCost ? Number(i.estimatedCost) : undefined,
          })),
        }),
      });
      setShowReqForm(false);
      setReqForm({ ...emptyReqForm });
      setReqItems([{ ...emptyReqItem }]);
      void load();
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "No se pudo crear"));
    } finally {
      setSavingReq(false);
    }
  };

  const savePo = async () => {
    if (!token || !poForm.supplierName.trim()) return;
    const items = poItems.filter(i => i.description.trim() && Number(i.unitPrice) > 0);
    if (!items.length) return;
    setSavingPo(true);
    try {
      await apiFetch("procurement/purchase-orders", token, {
        method: "POST",
        body: JSON.stringify({
          supplierName: poForm.supplierName.trim(),
          orderDate: new Date().toISOString().slice(0, 10),
          expectedDate: poForm.expectedDate || undefined,
          items: items.map(i => ({
            description: i.description.trim(),
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
          })),
        }),
      });
      setShowPoForm(false);
      setPoForm({ ...emptyPoForm });
      setPoItems([{ ...emptyPoItem }]);
      void load();
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "No se pudo crear"));
    } finally {
      setSavingPo(false);
    }
  };

  const approvePo = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`procurement/purchase-orders/${id}/approve`, token, { method: "PATCH" });
      void load();
    } catch (e) {
      toast.error("Error al aprobar OC: " + (e instanceof Error ? e.message : "error"));
    }
  };

  const approveReq = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`procurement/requisitions/${id}/approve`, token, { method: "PATCH" });
      void load();
    } catch (e) {
      toast.error("Error al aprobar requisición: " + (e instanceof Error ? e.message : "error"));
    }
  };

  const openRejectReq = (req: Requisition) => {
    setRejectReqModal(req);
    setRejectReqReason("");
    setRejectReqErr(null);
  };

  const submitRejectReq = async () => {
    if (!token || !rejectReqModal) return;
    if (!rejectReqReason.trim()) { setRejectReqErr("Escribe un motivo de rechazo."); return; }
    setRejectingReq(true); setRejectReqErr(null);
    try {
      await apiFetch(`procurement/requisitions/${rejectReqModal.id}/reject`, token, {
        method: "PATCH",
        body: JSON.stringify({ reason: rejectReqReason.trim() }),
      });
      setRejectReqModal(null);
      void load();
    } catch (e) {
      setRejectReqErr(e instanceof Error ? e.message : "Error al rechazar");
    } finally { setRejectingReq(false); }
  };

  // kept for backward compat with column definitions that may call rejectReq(id)
  const rejectReq = (id: number) => {
    const req = requisitions.find((r) => r.id === id);
    if (req) openRejectReq(req);
  };

  const loadOrderDetail = async (id: number) => {
    if (!token) return;
    setDetailKind("order");
    setReqDetail(null);
    setDetailLoading(true);
    setDetailErr(null);
    try {
      setPoDetail(await apiFetch<PoDetail>(`procurement/purchase-orders/${id}`, token));
    } catch (e) {
      setPoDetail(null);
      setDetailErr(e instanceof Error ? e.message : "No se pudo cargar la OC");
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadPoPdf = async (id: number, poNumber?: string) => {
    if (!token) return;
    try {
      const res = await fetch(buildApiUrl(`procurement/purchase-orders/${id}/pdf`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OC-${(poNumber || String(id)).replace(/[^\w.-]+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF de orden de compra descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
    }
  };

  const loadReqDetail = async (id: number) => {
    if (!token) return;
    setDetailKind("req");
    setPoDetail(null);
    setDetailLoading(true);
    setDetailErr(null);
    try {
      setReqDetail(await apiFetch<ReqDetail>(`procurement/requisitions/${id}`, token));
    } catch (e) {
      setReqDetail(null);
      setDetailErr(e instanceof Error ? e.message : "No se pudo cargar la requisición");
    } finally {
      setDetailLoading(false);
    }
  };

  const loadReceiptPo = async (poIdValue?: string) => {
    const id = poIdValue ?? receiptPoId;
    if (!token || !id.trim()) return;
    setLoadingReceiptPo(true);
    setReceiptErr(null);
    try {
      const po = await apiFetch<{ items?: PoLine[] }>(`procurement/purchase-orders/${id}`, token);
      const lines = (po.items ?? []).map((i) => {
        const ordered = Number(i.quantity);
        const alreadyReceived = Number(i.receivedQty ?? 0);
        const pending = Math.max(0, ordered - alreadyReceived);
        return {
          purchaseOrderItemId: i.id,
          description: i.description,
          ordered,
          alreadyReceived,
          qty: pending > 0 ? String(pending) : "0",
        };
      });
      setReceiptLines(lines);
      if (!lines.length) setReceiptErr("La OC no tiene partidas.");
    } catch (e) {
      setReceiptLines([]);
      setReceiptErr(e instanceof Error ? e.message : "No se pudo cargar partidas");
    } finally {
      setLoadingReceiptPo(false);
    }
  };

  const openReceiptForPo = (id: number) => {
    setReceiptPoId(String(id));
    setReceiptNotes("");
    setReceiptLines([]);
    setReceiptErr(null);
    setShowReceiptForm(true);
    void loadReceiptPo(String(id));
  };

  const saveReceipt = async () => {
    if (!token || !receiptPoId) return;
    const items = receiptLines
      .map((l) => ({ purchaseOrderItemId: l.purchaseOrderItemId, quantityReceived: Number(l.qty) }))
      .filter((i) => i.quantityReceived > 0);
    if (!items.length) {
      setReceiptErr("Indica al menos una cantidad a recibir.");
      return;
    }
    setSavingReceipt(true);
    setReceiptErr(null);
    const poNum = Number(receiptPoId);
    try {
      await apiFetch("procurement/goods-receipts", token, {
        method: "POST",
        body: JSON.stringify({
          purchaseOrderId: poNum,
          warehouseId: receiptWarehouseId ? Number(receiptWarehouseId) : undefined,
          receiptDate: new Date().toISOString().slice(0, 10),
          notes: receiptNotes.trim() || undefined,
          freightCost: receiptLandedCost.freightCost ? Number(receiptLandedCost.freightCost) : undefined,
          insuranceCost: receiptLandedCost.insuranceCost ? Number(receiptLandedCost.insuranceCost) : undefined,
          customsCost: receiptLandedCost.customsCost ? Number(receiptLandedCost.customsCost) : undefined,
          otherLandedCost: receiptLandedCost.otherLandedCost ? Number(receiptLandedCost.otherLandedCost) : undefined,
          items,
        }),
      });
      setShowReceiptForm(false);
      setReceiptPoId("");
      setReceiptNotes("");
      setReceiptWarehouseId("");
      setReceiptLines([]);
      setReceiptLandedCost({ freightCost: "", insuranceCost: "", customsCost: "", otherLandedCost: "" });
      toast.success("Recepción registrada · stock y factura AP generados");
      if (detailKind === "order" && poDetail?.id === poNum) {
        void loadOrderDetail(poDetail.id);
      }
      void load();
    } catch (e) {
      setReceiptErr(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setSavingReceipt(false);
    }
  };

  const saveSupplierRfc = async (supplierId: number, name: string, rfc: string) => {
    if (!token) return;
    setSavingSupplierRfcId(supplierId);
    try {
      await apiFetch("procurement/purchase-orders/suppliers", token, {
        method: "POST",
        body: JSON.stringify({ name, rfc: rfc.trim().toUpperCase() || undefined }),
      });
      setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, rfc: rfc.trim().toUpperCase() || null } : s));
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "No se pudo guardar el RFC"));
    } finally {
      setSavingSupplierRfcId(null);
    }
  };

  const submitCreateRfq = async () => {
    if (!token || !rfqForm.requisitionId || !rfqForm.supplierIds.length) return;
    setSavingRfq(true);
    try {
      await apiFetch("procurement/rfq", token, {
        method: "POST",
        body: JSON.stringify({
          requisitionId: Number(rfqForm.requisitionId),
          supplierIds: rfqForm.supplierIds,
          dueDate: rfqForm.dueDate || undefined,
          notes: rfqForm.notes.trim() || undefined,
        }),
      });
      setShowRfqForm(false);
      setRfqForm({ requisitionId: "", supplierIds: [], dueDate: "", notes: "" });
      toast.success("RFQ enviada a los proveedores seleccionados");
      void load();
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "No se pudo crear la RFQ"));
    } finally {
      setSavingRfq(false);
    }
  };

  const openRfqComparison = async (id: number) => {
    if (!token) return;
    setComparisonLoading(true);
    setRfqComparison(null);
    try {
      const comparison = await apiFetch<RfqComparison>(`procurement/rfq/${id}/compare`, token);
      setRfqComparison(comparison);
      const draft: Record<number, { unitPrice: string; leadTimeDays: string }> = {};
      for (const s of comparison.suppliers) {
        for (const l of s.lines) {
          draft[l.id] = { unitPrice: l.unitPrice != null ? String(l.unitPrice) : "", leadTimeDays: l.leadTimeDays != null ? String(l.leadTimeDays) : "" };
        }
      }
      setQuoteDraft(draft);
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "No se pudo cargar la comparación"));
    } finally {
      setComparisonLoading(false);
    }
  };

  const submitQuoteLine = async (lineId: number) => {
    if (!token || !rfqComparison) return;
    const draft = quoteDraft[lineId];
    if (!draft || !draft.unitPrice) return;
    setSavingQuoteLineId(lineId);
    try {
      await apiFetch(`procurement/rfq/${rfqComparison.rfq.id}/lines/${lineId}/quote`, token, {
        method: "POST",
        body: JSON.stringify({
          unitPrice: Number(draft.unitPrice),
          leadTimeDays: draft.leadTimeDays ? Number(draft.leadTimeDays) : undefined,
        }),
      });
      void openRfqComparison(rfqComparison.rfq.id);
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "No se pudo guardar la cotización"));
    } finally {
      setSavingQuoteLineId(null);
    }
  };

  const submitAwardRfq = async (supplierId: number) => {
    if (!token || !rfqComparison) return;
    setAwardingSupplierId(supplierId);
    try {
      await apiFetch(`procurement/rfq/${rfqComparison.rfq.id}/award`, token, {
        method: "POST",
        body: JSON.stringify({ supplierId }),
      });
      toast.success("RFQ adjudicada — orden de compra generada");
      setRfqComparison(null);
      void load();
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "No se pudo adjudicar"));
    } finally {
      setAwardingSupplierId(null);
    }
  };

  const submitCancelRfq = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`procurement/rfq/${id}/cancel`, token, { method: "PATCH" });
      void load();
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "No se pudo cancelar"));
    }
  };

  const rfqColumns: Column<Rfq>[] = [
    { key: "rfqNumber", label: "RFQ", render: (r) => <code style={{ fontSize: 11.5 }}>{r.rfqNumber}</code>, width: 110 },
    { key: "requisition", label: "Requisición", render: (r) => (
      <div>
        <div style={{ fontSize: 13 }}>{r.requisition?.title ?? "—"}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.requisition?.reqNumber}</div>
      </div>
    ) },
    { key: "lines", label: "Proveedores/líneas", render: (r) => <span style={{ fontSize: 12 }}>{r._count?.lines ?? r.lines?.length ?? 0} líneas</span>, width: 130 },
    { key: "status", label: "Estado", width: 130, render: (r) => (
      <Tag variant={r.status === "AWARDED" ? "positive" : r.status === "CANCELLED" ? "default" : r.status === "QUOTED" ? "accent" : "neutral"}>
        {RFQ_STATUS[r.status] ?? r.status}
      </Tag>
    ) },
    { key: "actions", label: "", width: 180, render: (r) => (
      <div style={{ display: "flex", gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => void openRfqComparison(r.id)}>
          {r.status === "AWARDED" ? "Ver" : "Comparar"}
        </Button>
        {(r.status === "SENT" || r.status === "QUOTED") && (
          <Button size="sm" variant="ghost" onClick={() => void submitCancelRfq(r.id)}>Cancelar</Button>
        )}
      </div>
    ) },
  ];

  const orderColumns: Column<PurchaseOrder>[] = [
    {
      key: "poNumber",
      label: "OC",
      render: (o) => (
        <button
          type="button"
          className={chrome.folioLink}
          onClick={(e) => {
            e.stopPropagation();
            void loadOrderDetail(o.id);
          }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {o.poNumber}
        </button>
      ),
      width: 130,
    },
    {
      key: "supplier",
      label: "Proveedor",
      render: (o) => <span style={{ fontWeight: 600, fontSize: 13 }}>{o.supplier?.name ?? "—"}</span>,
    },
    { key: "totalAmount", label: "Monto", render: (o) => <Money value={Number(o.totalAmount)} />, width: 120 },
    {
      key: "expectedDate",
      label: "Entrega est.",
      render: (o) => {
        if (!o.expectedDate) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const daysLeft = Math.ceil((new Date(o.expectedDate).getTime() - Date.now()) / 86400000);
        const isOpen = o.status !== "RECEIVED" && o.status !== "CANCELLED";
        const color = !isOpen ? "var(--text-tertiary)" : daysLeft < 0 ? "var(--danger)" : daysLeft <= 3 ? "var(--danger)" : daysLeft <= 7 ? "var(--warning)" : "var(--text-secondary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color }}>{new Date(o.expectedDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
            {isOpen && <span style={{ fontSize: 10.5, fontWeight: daysLeft <= 7 ? 700 : 400, color }}>{daysLeft < 0 ? "ATRASADA" : `${daysLeft}d`}</span>}
          </div>
        );
      },
      width: 100,
    },
    {
      key: "status",
      label: "Estado",
      render: (o) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Tag variant={o.status === "RECEIVED" ? "positive" : o.status === "CANCELLED" ? "danger" : o.status === "DRAFT" ? "neutral" : "accent"}>
            {PO_STATUS[o.status] ?? o.status}
          </Tag>
          {o.status === "DRAFT" && cfg.canApprove && (
            <button onClick={(e) => { e.stopPropagation(); void approvePo(o.id); }} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>
              ✓
            </button>
          )}
          <Button
            size="sm"
            variant="ghost"
            iconLeft="📄"
            title="Descargar PDF"
            onClick={(e) => {
              e.stopPropagation();
              void downloadPoPdf(o.id, o.poNumber);
            }}
          >
            PDF
          </Button>
        </div>
      ),
      width: 200,
    },
  ];

  const reqColumns: Column<Requisition>[] = [
    { key: "reqNumber", label: "Folio", render: (r) => <code style={{ fontSize: 11.5 }}>{r.reqNumber}</code>, width: 120 },
    {
      key: "title",
      label: "Requisición",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{r.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{r.requestedBy?.nombre}</div>
        </div>
      ),
    },
    { key: "priority", label: "Prioridad", render: (r) => <Tag variant={r.priority === "HIGH" || r.priority === "URGENT" ? "danger" : r.priority === "MEDIUM" ? "warning" : "neutral"}>{r.priority ?? "NORMAL"}</Tag>, width: 100 },
    {
      key: "status",
      label: "Estado",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Tag variant={r.status === "APPROVED" ? "neutral" : r.status === "REJECTED" ? "danger" : "warning"}>
            {REQ_STATUS[r.status] ?? r.status}
          </Tag>
          {r.status === "PENDING" && cfg.canApprove && (
            <>
              <button onClick={() => void approveReq(r.id)} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>
                ✓
              </button>
              <button onClick={() => void rejectReq(r.id)} style={{ fontSize: 11, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>
                ✕
              </button>
            </>
          )}
        </div>
      ),
      width: 160,
    },
  ];

  const receiptColumns: Column<GoodsReceipt>[] = [
    { key: "receiptNumber", label: "Recepción", render: (r) => <code style={{ fontSize: 11.5 }}>{r.receiptNumber}</code>, width: 130 },
    {
      key: "purchaseOrder",
      label: "OC",
      render: (r) => (
        <Link href={`/erp/procurement?tab=orders&id=${r.purchaseOrderId}`} style={{ color: "var(--primary)", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
          {r.purchaseOrder?.poNumber ?? `OC-${r.purchaseOrderId}`}
        </Link>
      ),
      width: 120,
    },
    { key: "receivedBy", label: "Recibió", accessor: (r) => r.receivedBy?.nombre ?? "—", width: 140 },
    {
      key: "receiptDate",
      label: "Fecha",
      accessor: (r) => (r.receiptDate ? new Date(r.receiptDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"),
      width: 100,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Compras"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && tab === "requisitions" && (
              <Button variant="primary" size="sm" onClick={() => { setShowReqForm(true); setShowPoForm(false); }}>Nueva requisición</Button>
            )}
            {cfg.canCreate && tab === "orders" && (
              <Button variant="primary" size="sm" onClick={() => { setShowPoForm(true); setShowReqForm(false); }}>Nueva OC</Button>
            )}
            {cfg.canCreate && tab === "receipts" && (
              <Button variant="primary" size="sm" onClick={() => setShowReceiptForm(true)}>Registrar recepción</Button>
            )}
            {cfg.canCreate && tab === "rfq" && (
              <Button variant="primary" size="sm" onClick={() => setShowRfqForm(true)}>Nueva RFQ</Button>
            )}
          </>
        }
      />

      {/* ── Formulario: Nueva Requisición ─────────────────────────────── */}
      {showReqForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13 }}>Nueva requisición</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Título *</label>
              <input value={reqForm.title} onChange={e => setReqForm(f => ({ ...f, title: e.target.value }))} placeholder="Ej. Cables y conectores para obra Pachuca" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Prioridad</label>
              <select value={reqForm.priority} onChange={e => setReqForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
          </div>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", margin: "0 0 6px" }}>Artículos</p>
          {reqItems.map((item, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 6, marginBottom: 6 }}>
              <input value={item.description} onChange={e => setReqItems(prev => prev.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))} placeholder="Descripción del artículo" style={inp} />
              <input type="number" min={1} value={item.quantity} onChange={e => setReqItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: +e.target.value } : it))} placeholder="Cant." style={{ ...inp, width: 70 }} />
              <input type="number" min={0} value={item.estimatedCost} onChange={e => setReqItems(prev => prev.map((it, i) => i === idx ? { ...it, estimatedCost: e.target.value } : it))} placeholder="Costo est." style={{ ...inp, width: 110 }} />
              {reqItems.length > 1 && (
                <button onClick={() => setReqItems(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--danger)", padding: "0 4px" }}>✕</button>
              )}
            </div>
          ))}
          <button onClick={() => setReqItems(prev => [...prev, { ...emptyReqItem }])} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: 10 }}>+ Agregar artículo</button>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowReqForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveReq()} disabled={savingReq}>{savingReq ? "Guardando…" : "Crear requisición"}</Button>
          </div>
        </div>
      )}

      {/* ── Formulario: Nueva OC ──────────────────────────────────────── */}
      {showPoForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13 }}>Nueva orden de compra</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Proveedor *</label>
              <input value={poForm.supplierName} onChange={e => setPoForm(f => ({ ...f, supplierName: e.target.value }))} placeholder="Nombre del proveedor" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Fecha entrega est.</label>
              <input type="date" value={poForm.expectedDate} onChange={e => setPoForm(f => ({ ...f, expectedDate: e.target.value }))} style={inp} />
            </div>
          </div>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", margin: "0 0 6px" }}>Artículos</p>
          {poItems.map((item, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 6, marginBottom: 6 }}>
              <input value={item.description} onChange={e => setPoItems(prev => prev.map((it, i) => i === idx ? { ...it, description: e.target.value } : it))} placeholder="Descripción del artículo" style={inp} />
              <input type="number" min={1} value={item.quantity} onChange={e => setPoItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: +e.target.value } : it))} placeholder="Cant." style={{ ...inp, width: 70 }} />
              <input type="number" min={0} value={item.unitPrice} onChange={e => setPoItems(prev => prev.map((it, i) => i === idx ? { ...it, unitPrice: e.target.value } : it))} placeholder="Precio unit." style={{ ...inp, width: 110 }} />
              {poItems.length > 1 && (
                <button onClick={() => setPoItems(prev => prev.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--danger)", padding: "0 4px" }}>✕</button>
              )}
            </div>
          ))}
          <button onClick={() => setPoItems(prev => [...prev, { ...emptyPoItem }])} style={{ fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: 10 }}>+ Agregar artículo</button>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowPoForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void savePo()} disabled={savingPo}>{savingPo ? "Guardando…" : "Crear OC"}</Button>
          </div>
        </div>
      )}

      {/* ── Formulario: Nueva RFQ ─────────────────────────────────────── */}
      {showRfqForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13 }}>Nueva RFQ (solicitud de cotización)</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Requisición *</label>
              <select value={rfqForm.requisitionId} onChange={(e) => setRfqForm((f) => ({ ...f, requisitionId: e.target.value }))} style={inp}>
                <option value="">Seleccionar…</option>
                {requisitions.map((r) => <option key={r.id} value={r.id}>{r.reqNumber} — {r.title}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Proveedores a cotizar *</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {suppliers.length === 0 && <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Sin proveedores — agrega uno en Órdenes de compra.</span>}
                {suppliers.map((s) => {
                  const checked = rfqForm.supplierIds.includes(s.id);
                  return (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: `1px solid ${checked ? "var(--primary)" : "var(--border)"}`, background: checked ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--surface)", fontSize: 12.5, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setRfqForm((f) => ({ ...f, supplierIds: e.target.checked ? [...f.supplierIds, s.id] : f.supplierIds.filter((id) => id !== s.id) }))}
                      />
                      {s.name}
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Fecha límite de respuesta</label>
              <input type="date" value={rfqForm.dueDate} onChange={(e) => setRfqForm((f) => ({ ...f, dueDate: e.target.value }))} style={inp} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Notas</label>
              <input value={rfqForm.notes} onChange={(e) => setRfqForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Condiciones, referencias…" style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowRfqForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void submitCreateRfq()} disabled={savingRfq || !rfqForm.requisitionId || !rfqForm.supplierIds.length}>
              {savingRfq ? "Enviando…" : "Enviar RFQ"}
            </Button>
          </div>
        </div>
      )}

      {tab === "rfq" && suppliers.length > 0 && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 18 }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13 }}>Proveedores · RFC para DIOT</p>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-secondary)" }}>
            El RFC alimenta el reporte DIOT en Contabilidad → Cumplimiento SAT.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
            {suppliers.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12.5, flex: 1 }}>{s.name}</span>
                <input
                  defaultValue={s.rfc ?? ""}
                  placeholder="RFC"
                  disabled={savingSupplierRfcId === s.id}
                  onBlur={(e) => { if (e.target.value.trim().toUpperCase() !== (s.rfc ?? "")) void saveSupplierRfc(s.id, s.name, e.target.value); }}
                  style={{ ...inp, width: 140, borderColor: s.rfc ? "var(--border)" : "var(--warning)" }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Comparación de cotizaciones ──────────────────────────────── */}
      {(comparisonLoading || rfqComparison) && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          {comparisonLoading ? (
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Cargando comparación…</p>
          ) : rfqComparison ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>
                  {rfqComparison.rfq.rfqNumber} · {rfqComparison.rfq.requisition?.title} · <Tag variant={rfqComparison.rfq.status === "AWARDED" ? "positive" : "accent"}>{RFQ_STATUS[rfqComparison.rfq.status]}</Tag>
                </p>
                <Button variant="ghost" size="sm" onClick={() => setRfqComparison(null)}>Cerrar</Button>
              </div>
              {rfqComparison.rfq.status === "AWARDED" && rfqComparison.rfq.awardedPurchaseOrder && (
                <p style={{ fontSize: 12.5, marginBottom: 12 }}>
                  Adjudicada → <Link href={`/erp/procurement?tab=orders&id=${rfqComparison.rfq.awardedPurchaseOrder.id}`} style={{ color: "var(--primary)" }}>{rfqComparison.rfq.awardedPurchaseOrder.poNumber}</Link>
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {rfqComparison.suppliers.map((s) => {
                  const isBestPrice = s.supplierId === rfqComparison.bestPriceSupplierId;
                  const isBestLeadTime = s.supplierId === rfqComparison.bestLeadTimeSupplierId;
                  const complete = s.quotedLines === s.totalLines;
                  return (
                    <div key={s.supplierId} style={{ border: `1px solid ${isBestPrice ? "var(--success)" : "var(--border)"}`, borderRadius: 10, padding: 14, background: "var(--surface)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontSize: 13.5 }}>{s.supplierName}</strong>
                          {isBestPrice && <Tag variant="positive">Mejor precio</Tag>}
                          {isBestLeadTime && <Tag variant="accent">Mejor entrega</Tag>}
                          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{s.quotedLines}/{s.totalLines} cotizadas</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Money value={s.totalPrice} />
                          {rfqComparison.rfq.status !== "AWARDED" && rfqComparison.rfq.status !== "CANCELLED" && cfg.canApprove && (
                            <Button size="sm" variant="primary" disabled={!complete || awardingSupplierId === s.supplierId} onClick={() => void submitAwardRfq(s.supplierId)}>
                              {awardingSupplierId === s.supplierId ? "Adjudicando…" : "Adjudicar"}
                            </Button>
                          )}
                        </div>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                            <th style={{ textAlign: "left", padding: "6px 8px" }}>Artículo</th>
                            <th style={{ textAlign: "right", padding: "6px 8px" }}>Cant.</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", width: 110 }}>Precio unit.</th>
                            <th style={{ textAlign: "right", padding: "6px 8px", width: 90 }}>Días entrega</th>
                            <th style={{ padding: "6px 8px", width: 70 }} />
                          </tr>
                        </thead>
                        <tbody>
                          {s.lines.map((l) => {
                            const draft = quoteDraft[l.id] ?? { unitPrice: "", leadTimeDays: "" };
                            const editable = rfqComparison.rfq.status !== "AWARDED" && rfqComparison.rfq.status !== "CANCELLED";
                            return (
                              <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: "6px 8px" }}>{l.description}</td>
                                <td style={{ padding: "6px 8px", textAlign: "right" }}>{Number(l.quantity)}</td>
                                <td style={{ padding: "6px 8px" }}>
                                  <input
                                    type="number" min={0} step="0.01"
                                    disabled={!editable}
                                    value={draft.unitPrice}
                                    onChange={(e) => setQuoteDraft((q) => ({ ...q, [l.id]: { ...draft, unitPrice: e.target.value } }))}
                                    style={{ ...inp, textAlign: "right" }}
                                  />
                                </td>
                                <td style={{ padding: "6px 8px" }}>
                                  <input
                                    type="number" min={0}
                                    disabled={!editable}
                                    value={draft.leadTimeDays}
                                    onChange={(e) => setQuoteDraft((q) => ({ ...q, [l.id]: { ...draft, leadTimeDays: e.target.value } }))}
                                    style={{ ...inp, textAlign: "right" }}
                                  />
                                </td>
                                <td style={{ padding: "6px 8px", textAlign: "right" }}>
                                  {editable && (
                                    <Button size="sm" variant="ghost" disabled={!draft.unitPrice || savingQuoteLineId === l.id} onClick={() => void submitQuoteLine(l.id)}>
                                      {savingQuoteLineId === l.id ? "…" : "Guardar"}
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      )}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Requisiciones pendientes" value={requisitions.filter(r => r.status === "PENDING").length} variant={requisitions.filter(r => r.status === "PENDING").length > 0 ? "warning" : "positive"} icon="📋" />
          <KpiCard label="OC activas" value={orders.filter(o => o.status !== "RECEIVED" && o.status !== "CANCELLED").length} variant="accent" icon="🛒" />
          <KpiCard label="OC recibidas" value={orders.filter(o => o.status === "RECEIVED").length} variant="positive" icon="✅" />
          <KpiCard label="Recepciones registradas" value={receipts.length} icon="📦" />
        </div>
      )}

      {!loading && orders.length > 0 && (() => {
        const statuses = [
          { label: "Borrador", count: orders.filter(o => o.status === "DRAFT").length, color: "var(--text-tertiary)" },
          { label: "Enviada", count: orders.filter(o => o.status === "SENT").length, color: "var(--primary)" },
          { label: "Recibida", count: orders.filter(o => o.status === "RECEIVED").length, color: "var(--success)" },
          { label: "Cancelada", count: orders.filter(o => o.status === "CANCELLED").length, color: "var(--danger)" },
        ].filter(s => s.count > 0);
        if (!statuses.length) return null;
        return (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Estado de órdenes de compra</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {statuses.map(s => (
                <div key={s.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{s.label}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(s.count / orders.length) * 100}%`, background: s.color, borderRadius: 3, transition: "width .4s" }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <PanelTabs
        ariaLabel="Secciones de compras"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "requisitions", label: "Requisiciones" },
          { key: "orders", label: "Órdenes de compra" },
          { key: "receipts", label: "Recepciones" },
          { key: "rfq", label: "RFQ · Comparar" },
          { key: "mayoristas", label: "Mayoristas" },
        ]}
      />

      {/* Mayoristas trae su propia tabla y su propio detalle: el FilterToolbar
          y la Section de abajo filtran órdenes y requisiciones, que aquí no
          aplican, así que se ocultan en vez de mostrarse vacíos. */}
      {tab === "mayoristas" && <WholesalePanel token={token} canManage={cfg.canCreate} />}

      {tab !== "mayoristas" && (
      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: tab === "orders" ? "Buscar OC, proveedor…" : tab === "requisitions" ? "Buscar requisición, título…" : tab === "rfq" ? "Buscar RFQ, requisición…" : "Buscar recepción, OC…" }}
        selects={tab === "orders" ? [{
          label: "Estado",
          value: filterPoStatus,
          onChange: setFilterPoStatus,
          options: Object.entries(PO_STATUS).map(([value, label]) => ({ value, label })),
          allowAll: true,
        }] : tab === "requisitions" ? [{
          label: "Estado",
          value: filterReqStatus,
          onChange: setFilterReqStatus,
          options: Object.entries(REQ_STATUS).map(([value, label]) => ({ value, label })),
          allowAll: true,
        }] : []}
        onClear={() => { setSearchQ(""); setFilterPoStatus(""); setFilterReqStatus(""); }}
        resultCount={loading ? null : tab === "orders" ? visibleOrders.length : tab === "requisitions" ? visibleReqs.length : tab === "rfq" ? rfqs.length : visibleReceipts.length}
        rightActions={tab === "orders" && orders.length > 0 ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {poDetail && detailKind === "order" ? (
              <Button
                variant="secondary"
                size="sm"
                iconLeft="📄"
                onClick={() => void downloadPoPdf(poDetail.id, poDetail.poNumber)}
              >
                PDF OC
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleOrders, [
              { key: "poNumber", label: "OC" },
              { key: "supplier", label: "Proveedor", format: (v) => (v as PurchaseOrder["supplier"])?.name ?? "—" },
              { key: "totalAmount", label: "Monto" },
              { key: "status", label: "Estado", format: (v) => PO_STATUS[String(v ?? "")] ?? String(v ?? "") },
              { key: "expectedDate", label: "Entrega est.", format: (v) => v ? String(v).slice(0, 10) : "" },
            ], "ordenes-compra")}>Excel</Button>
          </div>
        ) : tab === "requisitions" && requisitions.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleReqs, [
            { key: "reqNumber", label: "Folio" },
            { key: "title", label: "Título" },
            { key: "priority", label: "Prioridad" },
            { key: "status", label: "Estado", format: (v) => REQ_STATUS[String(v ?? "")] ?? String(v ?? "") },
            { key: "requestedBy", label: "Solicitó", format: (v) => (v as Requisition["requestedBy"])?.nombre ?? "—" },
          ], "requisiciones")}>Excel</Button>
        ) : undefined}
      />
      )}

      {highlightId && tab !== "receipts" && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
          Mostrando registro <strong>#{highlightId}</strong> desde enlace directo.
        </p>
      )}
      {poId && tab === "receipts" && (
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
          Recepciones de OC <strong>#{poId}</strong>.{" "}
          <Link href="/erp/procurement?tab=receipts" style={{ color: "var(--primary)" }}>
            Ver todas
          </Link>
        </p>
      )}

      {showReceiptForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13 }}>Registrar recepción de mercancía</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Orden de compra (ID) *</label>
              <input value={receiptPoId} onChange={(e) => setReceiptPoId(e.target.value)} placeholder="Ej. 12" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Almacén NEXARA</label>
              <select value={receiptWarehouseId} onChange={(e) => setReceiptWarehouseId(e.target.value)} style={inp}>
                <option value="">Automático</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Notas</label>
              <input value={receiptNotes} onChange={(e) => setReceiptNotes(e.target.value)} placeholder="Observaciones" style={inp} />
            </div>
            <Button variant="secondary" onClick={() => void loadReceiptPo()} disabled={loadingReceiptPo || !receiptPoId.trim()}>
              {loadingReceiptPo ? "Cargando…" : "Cargar partidas"}
            </Button>
          </div>
          {receiptLines.length > 0 && (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Artículo</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Pedido</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Recibido</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Recibir ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptLines.map((line) => (
                    <tr key={line.purchaseOrderItemId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px" }}>{line.description}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>{line.ordered}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>{line.alreadyReceived}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>
                        <input
                          type="number"
                          min={0}
                          max={Math.max(0, line.ordered - line.alreadyReceived)}
                          value={line.qty}
                          onChange={(e) => setReceiptLines((prev) => prev.map((l) => l.purchaseOrderItemId === line.purchaseOrderItemId ? { ...l, qty: e.target.value } : l))}
                          style={{ ...inp, width: 90, textAlign: "right" }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", margin: "8px 0 0" }}>Puedes registrar recepción parcial por partida.</p>

              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 12.5 }}>Landed cost (opcional)</p>
                <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--text-secondary)" }}>
                  Se prorratea por valor entre las partidas de producto recibidas y se suma al costo unitario (WAC).
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Flete</label>
                    <input type="number" min={0} step="0.01" value={receiptLandedCost.freightCost} onChange={(e) => setReceiptLandedCost((f) => ({ ...f, freightCost: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Seguro</label>
                    <input type="number" min={0} step="0.01" value={receiptLandedCost.insuranceCost} onChange={(e) => setReceiptLandedCost((f) => ({ ...f, insuranceCost: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Aranceles</label>
                    <input type="number" min={0} step="0.01" value={receiptLandedCost.customsCost} onChange={(e) => setReceiptLandedCost((f) => ({ ...f, customsCost: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 3 }}>Otros</label>
                    <input type="number" min={0} step="0.01" value={receiptLandedCost.otherLandedCost} onChange={(e) => setReceiptLandedCost((f) => ({ ...f, otherLandedCost: e.target.value }))} style={inp} />
                  </div>
                </div>
                {(() => {
                  const total = ["freightCost", "insuranceCost", "customsCost", "otherLandedCost"]
                    .reduce((s, k) => s + (Number(receiptLandedCost[k as keyof typeof receiptLandedCost]) || 0), 0);
                  return total > 0 ? (
                    <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--text-secondary)" }}>
                      Total a prorratear: <strong>${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</strong>
                    </p>
                  ) : null;
                })()}
              </div>
            </div>
          )}
          {receiptErr && (
            <div role="alert" style={{ marginTop: 10, padding: "8px 12px", background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
              {receiptErr}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <Button variant="ghost" onClick={() => { setShowReceiptForm(false); setReceiptErr(null); setReceiptLines([]); setReceiptLandedCost({ freightCost: "", insuranceCost: "", customsCost: "", otherLandedCost: "" }); }}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveReceipt()} disabled={savingReceipt}>{savingReceipt ? "Registrando…" : "Registrar entrada"}</Button>
          </div>
        </div>
      )}

      {(detailKind === "order" || detailKind === "req") && (
        <div className={chrome.poDetail}>
          <div className={chrome.poDetailHead}>
            <p className={chrome.poDetailTitle}>
              {detailKind === "order" ? `Orden de compra ${poDetail?.poNumber ?? ""}` : `Requisición ${reqDetail?.reqNumber ?? ""}`}
            </p>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {detailKind === "order" && poDetail ? (
                <Button variant="primary" size="sm" iconLeft="📄" onClick={() => void downloadPoPdf(poDetail.id, poDetail.poNumber)}>
                  Descargar PDF
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => { setDetailKind(null); setPoDetail(null); setReqDetail(null); setDetailErr(null); }}>Cerrar</Button>
            </div>
          </div>
          {detailLoading && (
            <EmptyState variant="compact" icon="⏳" title="Cargando detalle…" description="Consultando líneas y estado." />
          )}
          {detailErr && (
            <div role="alert" style={{ padding: "8px 12px", background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
              {detailErr}
            </div>
          )}
          {!detailLoading && detailKind === "order" && poDetail && (
            <>
              <div className={chrome.poMetaGrid}>
                <div className={chrome.poMetaItem}>
                  <span className={chrome.poMetaLabel}>Proveedor</span>
                  <div className={chrome.poMetaValue}>{poDetail.supplier?.name ?? "—"}</div>
                </div>
                <div className={chrome.poMetaItem}>
                  <span className={chrome.poMetaLabel}>Estado</span>
                  <div className={chrome.poMetaValue}>
                    <Tag variant={poDetail.status === "RECEIVED" ? "positive" : poDetail.status === "CANCELLED" ? "danger" : "accent"}>
                      {PO_STATUS[poDetail.status] ?? poDetail.status}
                    </Tag>
                  </div>
                </div>
                <div className={chrome.poMetaItem}>
                  <span className={chrome.poMetaLabel}>Monto</span>
                  <div className={chrome.poMetaValue}><Money value={Number(poDetail.totalAmount)} /></div>
                </div>
                <div className={chrome.poMetaItem}>
                  <span className={chrome.poMetaLabel}>Creada por</span>
                  <div className={chrome.poMetaValue}>{poDetail.createdBy?.nombre ?? "—"}</div>
                </div>
              </div>
              {(poDetail.items ?? []).length > 0 ? (
                <table className={chrome.poTable}>
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th style={{ textAlign: "right" }}>Cant.</th>
                      <th style={{ textAlign: "right" }}>Recibido</th>
                      <th style={{ textAlign: "right" }}>Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(poDetail.items ?? []).map((i) => (
                      <tr key={i.id}>
                        <td>{i.description}</td>
                        <td style={{ textAlign: "right" }}>{Number(i.quantity)}</td>
                        <td style={{ textAlign: "right" }}>{Number(i.receivedQty ?? 0)}</td>
                        <td style={{ textAlign: "right" }}><Money value={Number(i.unitPrice ?? 0)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState variant="compact" icon="📋" title="Sin partidas" description="Esta OC no tiene líneas registradas." />
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="secondary" iconLeft="📄" onClick={() => void downloadPoPdf(poDetail.id, poDetail.poNumber)}>
                  PDF profesional
                </Button>
                {cfg.canCreate && poDetail.status !== "RECEIVED" && poDetail.status !== "CANCELLED" && (
                  <Button variant="primary" onClick={() => openReceiptForPo(poDetail.id)}>Registrar recepción</Button>
                )}
              </div>
            </>
          )}
          {!detailLoading && detailKind === "req" && reqDetail && (
            <>
              <div className={chrome.poMetaGrid}>
                <div className={chrome.poMetaItem}>
                  <span className={chrome.poMetaLabel}>Título</span>
                  <div className={chrome.poMetaValue}>{reqDetail.title}</div>
                </div>
                <div className={chrome.poMetaItem}>
                  <span className={chrome.poMetaLabel}>Estado</span>
                  <div className={chrome.poMetaValue}>{REQ_STATUS[reqDetail.status] ?? reqDetail.status}</div>
                </div>
                <div className={chrome.poMetaItem}>
                  <span className={chrome.poMetaLabel}>Prioridad</span>
                  <div className={chrome.poMetaValue}>{reqDetail.priority ?? "NORMAL"}</div>
                </div>
                <div className={chrome.poMetaItem}>
                  <span className={chrome.poMetaLabel}>Solicitó</span>
                  <div className={chrome.poMetaValue}>{reqDetail.requestedBy?.nombre ?? "—"}</div>
                </div>
              </div>
              {reqDetail.rejectionReason && (
                <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>Motivo rechazo: {reqDetail.rejectionReason}</p>
              )}
              {(reqDetail.items ?? []).length > 0 ? (
                <table className={chrome.poTable}>
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th style={{ textAlign: "right" }}>Cant.</th>
                      <th style={{ textAlign: "right" }}>Costo est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reqDetail.items ?? []).map((i) => (
                      <tr key={i.id}>
                        <td>{i.description}</td>
                        <td style={{ textAlign: "right" }}>{Number(i.quantity)}</td>
                        <td style={{ textAlign: "right" }}><Money value={Number(i.estimatedCost ?? 0)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState variant="compact" icon="📋" title="Sin partidas" description="Esta requisición no tiene líneas." />
              )}
            </>
          )}
        </div>
      )}

      {tab !== "mayoristas" && (
      <Section
        title={
          loading
            ? "Cargando…"
            : tab === "orders"
              ? `${visibleOrders.length} órdenes`
              : tab === "requisitions"
                ? `${visibleReqs.length} requisiciones`
                : tab === "rfq"
                  ? `${rfqs.length} RFQ`
                  : `${visibleReceipts.length} recepciones`
        }
      >
        {loading ? (
          <EmptyState icon="⏳" title="Cargando compras…" description="Consultando órdenes, requisiciones y recepciones." />
        ) : tab === "rfq" ? (
          <DataTable
            columns={rfqColumns}
            rows={rfqs}
            rowKey={(r) => r.id}
            emptyTitle="Sin RFQ"
            emptyDescription="Envía una solicitud de cotización a varios proveedores para comparar precio y tiempo de entrega antes de emitir la OC."
            emptyAction={cfg.canCreate ? <Button size="sm" variant="primary" onClick={() => setShowRfqForm(true)}>Nueva RFQ</Button> : undefined}
          />
        ) : tab === "orders" ? (
          <DataTable
            columns={orderColumns}
            rows={visibleOrders}
            rowKey={(o) => o.id}
            onRowClick={(o) => void loadOrderDetail(o.id)}
            emptyTitle="Sin órdenes"
            emptyDescription="Crea una OC directa o aprueba una requisición para generar la primera."
            emptyAction={
              cfg.canCreate ? (
                <Button size="sm" variant="primary" onClick={() => { setShowPoForm(true); setShowReqForm(false); }}>
                  Nueva OC
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setTab("requisitions")}>Ver requisiciones</Button>
              )
            }
          />
        ) : tab === "requisitions" ? (
          <DataTable
            columns={reqColumns}
            rows={visibleReqs}
            rowKey={(r) => r.id}
            onRowClick={(r) => void loadReqDetail(r.id)}
            emptyTitle="Sin requisiciones"
            emptyDescription="Solicita materiales o servicios para que compras genere la OC."
            emptyAction={
              cfg.canCreate ? (
                <Button size="sm" variant="primary" onClick={() => { setShowReqForm(true); setShowPoForm(false); }}>
                  Nueva requisición
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            columns={receiptColumns}
            rows={visibleReceipts}
            rowKey={(r) => r.id}
            emptyTitle="Sin recepciones"
            emptyDescription="Cuando llegue mercancía, registra la recepción contra una OC abierta."
            emptyAction={<Button size="sm" variant="secondary" onClick={() => setTab("orders")}>Ver órdenes</Button>}
          />
        )}
      </Section>
      )}

      {/* ── Rechazar requisición modal ── */}
      {rejectReqModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setRejectReqModal(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Rechazar requisición</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 18 }}>
              <strong>{rejectReqModal.reqNumber}</strong> · {rejectReqModal.title}
            </div>
            <label style={{ display: "grid", gap: 4, marginBottom: 14 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Motivo del rechazo *</span>
              <textarea
                value={rejectReqReason}
                onChange={(e) => { setRejectReqReason(e.target.value); if (e.target.value.trim()) setRejectReqErr(null); }}
                rows={4}
                placeholder="Explica la razón del rechazo para que el solicitante pueda tomar acción…"
                autoFocus
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${rejectReqErr ? "var(--danger)" : "var(--border)"}`, background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13, resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }}
              />
            </label>
            {rejectReqErr && (
              <div style={{ padding: "8px 12px", background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)", marginBottom: 12 }}>
                {rejectReqErr}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setRejectReqModal(null)}>Cancelar</Button>
              <Button variant="danger" onClick={() => void submitRejectReq()} disabled={rejectingReq}>
                {rejectingReq ? "Rechazando…" : "Confirmar rechazo"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
