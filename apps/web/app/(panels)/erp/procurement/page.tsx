"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import PanelTabs from "@/components/ui/PanelTabs";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { SkeletonRows } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { FinanceField, FinanceFormGrid } from "@/components/finance/FinanceModuleShell";
import { getErpInventorySectionConfig } from "@/lib/section-views";
import { updateWholesaleTerms } from "@/lib/wholesale-api";
import { cantidad, diasHasta, fechaCorta, pesos, plazoLegible } from "@/lib/recursos-ui";
import chrome from "@/components/erp/erp-chrome.module.css";
import ComparacionCotizaciones from "./ComparacionCotizaciones";
import {
  PO_STATUS,
  PO_STATUS_COLOR,
  PRIORITIES,
  PRIORITY_LABEL,
  REQ_STATUS,
  RFQ_STATUS,
  TABS_COMPRAS,
  apiFetch,
  costosExtra,
  descargarPdf,
  errorLegible,
  ocAbierta,
  prioridad,
  sortHighlight,
  tabValida,
  unwrapList,
  variantePo,
  varianteReq,
  varianteRfq,
  type GoodsReceipt,
  type PoDetail,
  type PoLine,
  type ProcTab,
  type PurchaseOrder,
  type ReceiptLine,
  type ReqDetail,
  type Requisition,
  type Rfq,
  type RfqComparison,
  type Supplier,
  type Warehouse,
} from "./compras-datos";
import s from "./compras.module.css";

const WholesalePanel = dynamic(() => import("@/components/WholesalePanel"), {
  ssr: false,
  loading: () => <SkeletonRows rows={5} label="Cargando mayoristas" />,
});

type ReqItem = { description: string; quantity: number; estimatedCost: string };
type PoItem = { description: string; quantity: number; unitPrice: string };

const emptyReqForm = { title: "", priority: "NORMAL" };
const emptyReqItem: ReqItem = { description: "", quantity: 1, estimatedCost: "" };
const emptyPoForm = { supplierName: "", expectedDate: "" };
const emptyPoItem: PoItem = { description: "", quantity: 1, unitPrice: "" };
const emptyLanded = { freightCost: "", insuranceCost: "", customsCost: "", otherLandedCost: "" };
const emptyRfqForm = { requisitionId: "", supplierIds: [] as number[], dueDate: "", notes: "" };

const emptySupplierForm = {
  name: "",
  rfc: "",
  description: "",
  esMayorista: false,
  creditoDias: "",
  limiteCredito: "",
};

const ETAPAS: ReadonlyArray<{ tab: ProcTab; label: string }> = [
  { tab: "requisitions", label: "Requisición" },
  { tab: "rfq", label: "Cotización" },
  { tab: "orders", label: "Orden de compra" },
  { tab: "receipts", label: "Recepción" },
];

const COSTOS_EXTRA: ReadonlyArray<{ key: keyof typeof emptyLanded; label: string }> = [
  { key: "freightCost", label: "Flete" },
  { key: "insuranceCost", label: "Seguro" },
  { key: "customsCost", label: "Aranceles" },
  { key: "otherLandedCost", label: "Otros" },
];

const hoyIso = () => new Date().toISOString().slice(0, 10);

export default function ProcurementPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpInventorySectionConfig(user, "procurement"), [user]);
  const token = user?.token ?? "";
  const router = useRouter();
  const pathname = usePathname() ?? "/erp/procurement";

  // `?tab=`, `?id=` y `?poId=` se leen de la URL (sin useSearchParams).
  const [tab, setTabState] = useState<ProcTab>("orders");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [poId, setPoId] = useState<string | null>(null);
  const [urlLista, setUrlLista] = useState(false);

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [cargado, setCargado] = useState<Partial<Record<ProcTab, boolean>>>({});
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [searchQ, setSearchQ] = useState("");
  const busqueda = useDeferredValue(searchQ);
  const [filterPoStatus, setFilterPoStatus] = useState("");
  const [filterReqStatus, setFilterReqStatus] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);

  // ── Requisición ─────────────────────────────────────────────────────────
  const [showReqForm, setShowReqForm] = useState(false);
  const [reqForm, setReqForm] = useState({ ...emptyReqForm });
  const [reqItems, setReqItems] = useState<ReqItem[]>([{ ...emptyReqItem }]);
  const [savingReq, setSavingReq] = useState(false);
  const [reqErr, setReqErr] = useState<string | null>(null);

  // ── Orden de compra ─────────────────────────────────────────────────────
  const [showPoForm, setShowPoForm] = useState(false);
  const [poForm, setPoForm] = useState({ ...emptyPoForm });
  const [poItems, setPoItems] = useState<PoItem[]>([{ ...emptyPoItem }]);
  const [savingPo, setSavingPo] = useState(false);
  const [poErr, setPoErr] = useState<string | null>(null);

  // ── Recepción de mercancía ──────────────────────────────────────────────
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptPoId, setReceiptPoId] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptWarehouseId, setReceiptWarehouseId] = useState("");
  const [receiptLandedCost, setReceiptLandedCost] = useState({ ...emptyLanded });
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [receiptLines, setReceiptLines] = useState<ReceiptLine[]>([]);
  const [loadingReceiptPo, setLoadingReceiptPo] = useState(false);
  const [receiptErr, setReceiptErr] = useState<string | null>(null);

  // ── Rechazar requisición ────────────────────────────────────────────────
  const [rejectReqModal, setRejectReqModal] = useState<Requisition | null>(null);
  const [rejectReqReason, setRejectReqReason] = useState("");
  const [rejectingReq, setRejectingReq] = useState(false);
  const [rejectReqErr, setRejectReqErr] = useState<string | null>(null);

  // ── Proveedores ─────────────────────────────────────────────────────────
  // Hasta ahora el proveedor nacía de rebote: alguien tecleaba un nombre en la
  // orden de compra y quedaba una ficha con nombre y nada más. Sin RFC no hay
  // DIOT ni factura de proveedor que cuadre, y las condiciones de convenio no
  // tenían por dónde entrar —la pestaña de mayoristas solo lista a los que ya
  // lo son, así que el primero no podía marcarse nunca—.
  const [savingSupplierRfcId, setSavingSupplierRfcId] = useState<number | null>(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ ...emptySupplierForm });
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierErr, setSupplierErr] = useState<string | null>(null);

  // ── Cotizaciones ────────────────────────────────────────────────────────
  const [showRfqForm, setShowRfqForm] = useState(false);
  const [rfqForm, setRfqForm] = useState({ ...emptyRfqForm });
  const [savingRfq, setSavingRfq] = useState(false);
  const [rfqComparison, setRfqComparison] = useState<RfqComparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [savingQuoteLineId, setSavingQuoteLineId] = useState<number | null>(null);
  const [awardingSupplierId, setAwardingSupplierId] = useState<number | null>(null);

  // ── Detalle ─────────────────────────────────────────────────────────────
  const [detailKind, setDetailKind] = useState<"order" | "req" | null>(null);
  const [poDetail, setPoDetail] = useState<PoDetail | null>(null);
  const [reqDetail, setReqDetail] = useState<ReqDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  useEffect(() => {
    const leerUrl = () => {
      const p = new URLSearchParams(window.location.search);
      setTabState(tabValida(p.get("tab")));
      setHighlightId(p.get("id"));
      setPoId(p.get("poId"));
      setUrlLista(true);
    };
    leerUrl();
    window.addEventListener("popstate", leerUrl);
    return () => window.removeEventListener("popstate", leerUrl);
  }, [pathname]);

  /** Cambia de pestaña (y de registro resaltado) dejando rastro en el historial. */
  const navegar = useCallback(
    (siguiente: { tab: ProcTab; id?: number | string | null; poId?: number | string | null }) => {
      const p = new URLSearchParams();
      p.set("tab", siguiente.tab);
      if (siguiente.id != null) p.set("id", String(siguiente.id));
      if (siguiente.poId != null) p.set("poId", String(siguiente.poId));
      setTabState(siguiente.tab);
      setHighlightId(siguiente.id != null ? String(siguiente.id) : null);
      setPoId(siguiente.poId != null ? String(siguiente.poId) : null);
      router.push(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  const setTab = useCallback((next: ProcTab) => navegar({ tab: next }), [navegar]);

  const load = useCallback(async () => {
    if (!token || !urlLista || tab === "mayoristas") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorCarga(null);
    try {
      if (tab === "orders") {
        setOrders(unwrapList<PurchaseOrder>(await apiFetch("procurement/purchase-orders", token)));
      } else if (tab === "requisitions") {
        setRequisitions(unwrapList<Requisition>(await apiFetch("procurement/requisitions", token)));
      } else if (tab === "rfq") {
        const [rfqRows, reqRows, supplierRows] = await Promise.all([
          apiFetch<unknown>("procurement/rfq", token),
          apiFetch<unknown>("procurement/requisitions", token),
          apiFetch<unknown>("procurement/purchase-orders/suppliers", token),
        ]);
        setRfqs(unwrapList<Rfq>(rfqRows));
        setRequisitions(unwrapList<Requisition>(reqRows));
        setSuppliers(unwrapList<Supplier>(supplierRows));
      } else {
        const qs = poId ? `?purchaseOrderId=${encodeURIComponent(poId)}` : "";
        setReceipts(unwrapList<GoodsReceipt>(await apiFetch(`procurement/goods-receipts${qs}`, token)));
      }
      setCargado((prev) => ({ ...prev, [tab]: true }));
    } catch (e) {
      // Lo que ya se veía se queda; el aviso ofrece reintentar.
      setErrorCarga(errorLegible(e, "No se pudo cargar compras"));
    } finally {
      setLoading(false);
    }
  }, [token, tab, poId, urlLista]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    try {
      setSuppliers(unwrapList<Supplier>(await apiFetch("procurement/purchase-orders/suppliers", token)));
    } catch {
      /* La lista es un apoyo del formulario: si no carga, el alta sigue en pie. */
    }
  }, [token]);

  // Almacenes y órdenes abiertas solo hacen falta con el formulario de recepción abierto.
  useEffect(() => {
    if (!token || !showReceiptForm) return;
    let vivo = true;
    void (async () => {
      try {
        const rows = unwrapList<Warehouse & { isActive?: boolean }>(await apiFetch("warehouse", token));
        const activos = rows.filter((w) => w.isActive !== false);
        if (!vivo) return;
        setWarehouses(activos);
        setReceiptWarehouseId((actual) => actual || (activos[0] ? String(activos[0].id) : ""));
      } catch {
        if (vivo) setWarehouses([]);
      }
    })();
    if (orders.length === 0) {
      void apiFetch("procurement/purchase-orders", token)
        .then((rows) => {
          if (vivo) setOrders(unwrapList<PurchaseOrder>(rows));
        })
        .catch(() => undefined);
    }
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, showReceiptForm]);

  // ── Listas filtradas ────────────────────────────────────────────────────
  const visibleOrders = useMemo(() => {
    let rows = orders;
    const q = busqueda.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (o) =>
          (o.poNumber ?? "").toLowerCase().includes(q) ||
          (o.supplier?.name ?? "").toLowerCase().includes(q) ||
          (o.createdBy?.nombre ?? "").toLowerCase().includes(q),
      );
    }
    if (filterPoStatus) rows = rows.filter((o) => o.status === filterPoStatus);
    return sortHighlight(rows, highlightId);
  }, [orders, highlightId, busqueda, filterPoStatus]);

  const visibleReqs = useMemo(() => {
    let rows = requisitions;
    const q = busqueda.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.reqNumber ?? "").toLowerCase().includes(q) ||
          (r.title ?? "").toLowerCase().includes(q) ||
          (r.requestedBy?.nombre ?? "").toLowerCase().includes(q),
      );
    }
    if (filterReqStatus) rows = rows.filter((r) => r.status === filterReqStatus);
    return sortHighlight(rows, highlightId);
  }, [requisitions, highlightId, busqueda, filterReqStatus]);

  const visibleReceipts = useMemo(() => {
    let rows = receipts;
    const q = busqueda.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.receiptNumber ?? "").toLowerCase().includes(q) ||
          (r.purchaseOrder?.poNumber ?? "").toLowerCase().includes(q) ||
          (r.receivedBy?.nombre ?? "").toLowerCase().includes(q),
      );
    }
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = rows.filter((r) => r.id === id);
    }
    return rows;
  }, [receipts, highlightId, busqueda]);

  const visibleRfqs = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return rfqs;
    return rfqs.filter(
      (r) =>
        (r.rfqNumber ?? "").toLowerCase().includes(q) ||
        (r.requisition?.title ?? "").toLowerCase().includes(q) ||
        (r.requisition?.reqNumber ?? "").toLowerCase().includes(q),
    );
  }, [rfqs, busqueda]);

  const ordenesAbiertas = useMemo(() => orders.filter((o) => ocAbierta(o.status)), [orders]);

  // ── Cifras de la pestaña activa (solo con lo que esa pestaña cargó) ─────
  const cifras = useMemo(() => {
    if (tab === "orders") {
      let porAprobar = 0;
      let abiertas = 0;
      let atrasadas = 0;
      let montoAbierto = 0;
      const porEstado: Record<string, number> = {};
      for (const o of orders) {
        porEstado[o.status] = (porEstado[o.status] ?? 0) + 1;
        if (o.status === "DRAFT") porAprobar += 1;
        if (ocAbierta(o.status)) {
          abiertas += 1;
          montoAbierto += Number(o.totalAmount || 0);
          const dias = diasHasta(o.expectedDate);
          if (dias != null && dias < 0) atrasadas += 1;
        }
      }
      return { porAprobar, abiertas, atrasadas, montoAbierto, porEstado };
    }
    return null;
  }, [tab, orders]);

  const cifrasReq = useMemo(() => {
    let pendientes = 0;
    let urgentes = 0;
    let aprobadas = 0;
    for (const r of requisitions) {
      if (r.status === "PENDING") {
        pendientes += 1;
        if (r.priority === "URGENT" || r.priority === "CRITICAL" || r.priority === "HIGH") urgentes += 1;
      }
      if (r.status === "APPROVED") aprobadas += 1;
    }
    return { pendientes, urgentes, aprobadas };
  }, [requisitions]);

  const cifrasRecepciones = useMemo(() => {
    const ahora = new Date();
    let esteMes = 0;
    let extra = 0;
    for (const r of receipts) {
      const f = r.receiptDate ? new Date(r.receiptDate) : null;
      if (f && f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear()) esteMes += 1;
      extra += costosExtra(r);
    }
    return { esteMes, extra };
  }, [receipts]);

  const cifrasRfq = useMemo(() => {
    let esperando = 0;
    let conPrecios = 0;
    let adjudicadas = 0;
    for (const r of rfqs) {
      if (r.status === "SENT" || r.status === "DRAFT") esperando += 1;
      else if (r.status === "QUOTED") conPrecios += 1;
      else if (r.status === "AWARDED") adjudicadas += 1;
    }
    return { esperando, conPrecios, adjudicadas };
  }, [rfqs]);

  // ── Requisiciones ───────────────────────────────────────────────────────
  const abrirReqForm = () => {
    setReqErr(null);
    setShowReqForm(true);
  };

  const saveReq = async () => {
    if (!token) return;
    if (!reqForm.title.trim()) { setReqErr("Ponle un título a la requisición."); return; }
    const items = reqItems.filter((i) => i.description.trim());
    if (!items.length) { setReqErr("Agrega al menos un artículo con su descripción."); return; }
    setSavingReq(true);
    setReqErr(null);
    try {
      await apiFetch("procurement/requisitions", token, {
        method: "POST",
        body: JSON.stringify({
          title: reqForm.title.trim(),
          priority: reqForm.priority,
          items: items.map((i) => ({
            description: i.description.trim(),
            quantity: Number(i.quantity),
            estimatedCost: i.estimatedCost ? Number(i.estimatedCost) : undefined,
          })),
        }),
      });
      setShowReqForm(false);
      setReqForm({ ...emptyReqForm });
      setReqItems([{ ...emptyReqItem }]);
      toast.success("Requisición creada");
      void load();
    } catch (e) {
      setReqErr(errorLegible(e, "No se pudo crear la requisición"));
    } finally {
      setSavingReq(false);
    }
  };

  const approveReq = async (id: number) => {
    if (!token) return;
    setAprobandoId(`req-${id}`);
    try {
      await apiFetch(`procurement/requisitions/${id}/approve`, token, { method: "PATCH" });
      toast.success("Requisición aprobada");
      void load();
    } catch (e) {
      toast.error(errorLegible(e, "No se pudo aprobar la requisición"));
    } finally {
      setAprobandoId(null);
    }
  };

  const openRejectReq = (req: Requisition) => {
    setRejectReqModal(req);
    setRejectReqReason("");
    setRejectReqErr(null);
  };

  const submitRejectReq = async () => {
    if (!token || !rejectReqModal) return;
    if (!rejectReqReason.trim()) { setRejectReqErr("Escribe el motivo para que quien la pidió sepa qué corregir."); return; }
    setRejectingReq(true);
    setRejectReqErr(null);
    try {
      await apiFetch(`procurement/requisitions/${rejectReqModal.id}/reject`, token, {
        method: "PATCH",
        body: JSON.stringify({ reason: rejectReqReason.trim() }),
      });
      setRejectReqModal(null);
      toast.success("Requisición rechazada");
      void load();
    } catch (e) {
      setRejectReqErr(errorLegible(e, "No se pudo rechazar la requisición"));
    } finally {
      setRejectingReq(false);
    }
  };

  // ── Órdenes de compra ───────────────────────────────────────────────────
  const abrirPoForm = () => {
    setPoErr(null);
    setShowPoForm(true);
    if (suppliers.length === 0) void loadSuppliers();
  };

  const savePo = async () => {
    if (!token) return;
    if (!poForm.supplierName.trim()) { setPoErr("Escribe el proveedor."); return; }
    const items = poItems.filter((i) => i.description.trim() && Number(i.unitPrice) > 0);
    if (!items.length) { setPoErr("Agrega al menos un artículo con descripción y precio."); return; }
    setSavingPo(true);
    setPoErr(null);
    try {
      await apiFetch("procurement/purchase-orders", token, {
        method: "POST",
        body: JSON.stringify({
          supplierName: poForm.supplierName.trim(),
          orderDate: hoyIso(),
          expectedDate: poForm.expectedDate || undefined,
          items: items.map((i) => ({
            description: i.description.trim(),
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
          })),
        }),
      });
      setShowPoForm(false);
      setPoForm({ ...emptyPoForm });
      setPoItems([{ ...emptyPoItem }]);
      toast.success("Orden de compra creada");
      void load();
    } catch (e) {
      setPoErr(errorLegible(e, "No se pudo crear la orden de compra"));
    } finally {
      setSavingPo(false);
    }
  };

  const approvePo = async (id: number) => {
    if (!token) return;
    setAprobandoId(`po-${id}`);
    try {
      await apiFetch(`procurement/purchase-orders/${id}/approve`, token, { method: "PATCH" });
      toast.success("Orden de compra aprobada");
      void load();
    } catch (e) {
      toast.error(errorLegible(e, "No se pudo aprobar la orden de compra"));
    } finally {
      setAprobandoId(null);
    }
  };

  const downloadPoPdf = async (id: number, poNumber?: string) => {
    if (!token) return;
    try {
      await descargarPdf(`procurement/purchase-orders/${id}/pdf`, token, `OC-${poNumber || id}`, "No se pudo generar el PDF");
      toast.success("PDF de la orden descargado");
    } catch (e) {
      toast.error(errorLegible(e, "No se pudo generar el PDF"));
    }
  };

  const downloadReceiptPdf = async (id: number, receiptNumber?: string) => {
    if (!token) return;
    try {
      await descargarPdf(`procurement/goods-receipts/${id}/pdf`, token, `GR-${receiptNumber || id}`, "No se pudo generar el PDF de recepción");
      toast.success("PDF de la recepción descargado");
    } catch (e) {
      toast.error(errorLegible(e, "No se pudo generar el PDF de recepción"));
    }
  };

  // ── Detalle ─────────────────────────────────────────────────────────────
  const cerrarDetalle = () => {
    setDetailKind(null);
    setPoDetail(null);
    setReqDetail(null);
    setDetailErr(null);
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
      setDetailErr(errorLegible(e, "No se pudo abrir la orden de compra"));
    } finally {
      setDetailLoading(false);
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
      setDetailErr(errorLegible(e, "No se pudo abrir la requisición"));
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Recepción ───────────────────────────────────────────────────────────
  const loadReceiptPo = async (poIdValue: string) => {
    if (!token || !poIdValue.trim()) return;
    setLoadingReceiptPo(true);
    setReceiptErr(null);
    try {
      const po = await apiFetch<{ items?: PoLine[] }>(`procurement/purchase-orders/${poIdValue}`, token);
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
      if (!lines.length) setReceiptErr("Esta orden no tiene artículos.");
    } catch (e) {
      setReceiptLines([]);
      setReceiptErr(errorLegible(e, "No se pudieron cargar los artículos de la orden"));
    } finally {
      setLoadingReceiptPo(false);
    }
  };

  const limpiarRecepcion = () => {
    setReceiptPoId("");
    setReceiptNotes("");
    setReceiptLines([]);
    setReceiptErr(null);
    setReceiptLandedCost({ ...emptyLanded });
  };

  const abrirRecepcion = () => {
    limpiarRecepcion();
    setShowReceiptForm(true);
  };

  const cerrarRecepcion = () => {
    setShowReceiptForm(false);
    limpiarRecepcion();
  };

  const openReceiptForPo = (id: number) => {
    limpiarRecepcion();
    setReceiptPoId(String(id));
    setShowReceiptForm(true);
    void loadReceiptPo(String(id));
  };

  const elegirOrdenRecepcion = (valor: string) => {
    setReceiptPoId(valor);
    setReceiptLines([]);
    setReceiptErr(null);
    if (valor) void loadReceiptPo(valor);
  };

  const totalCostosExtra = useMemo(
    () => COSTOS_EXTRA.reduce((acc, c) => acc + (Number(receiptLandedCost[c.key]) || 0), 0),
    [receiptLandedCost],
  );

  const saveReceipt = async () => {
    if (!token) return;
    if (!receiptPoId) { setReceiptErr("Elige la orden de compra que llegó."); return; }
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
          receiptDate: hoyIso(),
          notes: receiptNotes.trim() || undefined,
          freightCost: receiptLandedCost.freightCost ? Number(receiptLandedCost.freightCost) : undefined,
          insuranceCost: receiptLandedCost.insuranceCost ? Number(receiptLandedCost.insuranceCost) : undefined,
          customsCost: receiptLandedCost.customsCost ? Number(receiptLandedCost.customsCost) : undefined,
          otherLandedCost: receiptLandedCost.otherLandedCost ? Number(receiptLandedCost.otherLandedCost) : undefined,
          items,
        }),
      });
      setShowReceiptForm(false);
      setReceiptWarehouseId("");
      limpiarRecepcion();
      toast.success("Recepción registrada: entró al almacén y se generó la cuenta por pagar");
      if (detailKind === "order" && poDetail?.id === poNum) {
        void loadOrderDetail(poDetail.id);
      }
      void load();
    } catch (e) {
      setReceiptErr(errorLegible(e, "No se pudo registrar la recepción"));
    } finally {
      setSavingReceipt(false);
    }
  };

  // ── Proveedores ─────────────────────────────────────────────────────────
  const openSupplierForm = () => {
    setSupplierForm({ ...emptySupplierForm });
    setSupplierErr(null);
    setShowSupplierForm(true);
  };

  const saveSupplier = async () => {
    if (!token) return;
    const name = supplierForm.name.trim();
    if (!name) { setSupplierErr("Ponle el nombre o razón social del proveedor."); return; }
    const rfc = supplierForm.rfc.trim().toUpperCase();
    if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
      setSupplierErr("El RFC no tiene el formato del SAT (12 caracteres para persona moral, 13 para física).");
      return;
    }
    setSavingSupplier(true);
    setSupplierErr(null);
    try {
      const created = await apiFetch<Supplier>("procurement/purchase-orders/suppliers", token, {
        method: "POST",
        body: JSON.stringify({
          name,
          rfc: rfc || undefined,
          description: supplierForm.description.trim() || undefined,
        }),
      });
      // Las condiciones de convenio viven en otra ruta. Se mandan solo si el
      // usuario marcó la casilla: así el primer mayorista puede marcarse desde
      // aquí, que era lo que no tenía salida.
      if (supplierForm.esMayorista && created?.id) {
        await updateWholesaleTerms(token, created.id, {
          esMayorista: true,
          creditoDias: supplierForm.creditoDias ? Number(supplierForm.creditoDias) : null,
          limiteCredito: supplierForm.limiteCredito ? Number(supplierForm.limiteCredito) : null,
        });
      }
      toast.success(`Proveedor «${name}» dado de alta`);
      setShowSupplierForm(false);
      setSupplierForm({ ...emptySupplierForm });
      void loadSuppliers();
      void load();
    } catch (e) {
      setSupplierErr(errorLegible(e, "No se pudo dar de alta el proveedor"));
    } finally {
      setSavingSupplier(false);
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
      setSuppliers((prev) => prev.map((sp) => (sp.id === supplierId ? { ...sp, rfc: rfc.trim().toUpperCase() || null } : sp)));
      toast.success(`RFC de ${name} guardado`);
    } catch (e) {
      toast.error(errorLegible(e, "No se pudo guardar el RFC"));
    } finally {
      setSavingSupplierRfcId(null);
    }
  };

  // ── Cotizaciones ────────────────────────────────────────────────────────
  const abrirRfqForm = () => {
    setRfqForm({ ...emptyRfqForm });
    setShowRfqForm(true);
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
      setRfqForm({ ...emptyRfqForm });
      toast.success("Cotización pedida a los proveedores elegidos");
      void load();
    } catch (e) {
      toast.error(errorLegible(e, "No se pudo pedir la cotización"));
    } finally {
      setSavingRfq(false);
    }
  };

  const openRfqComparison = useCallback(
    async (id: number) => {
      if (!token) return;
      setComparisonLoading(true);
      try {
        setRfqComparison(await apiFetch<RfqComparison>(`procurement/rfq/${id}/compare`, token));
      } catch (e) {
        toast.error(errorLegible(e, "No se pudo abrir la comparación"));
      } finally {
        setComparisonLoading(false);
      }
    },
    [token],
  );

  const submitQuoteLine = async (lineId: number, draft: { unitPrice: string; leadTimeDays: string }) => {
    if (!token || !rfqComparison || !draft.unitPrice) return;
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
      toast.error(errorLegible(e, "No se pudo guardar el precio"));
    } finally {
      setSavingQuoteLineId(null);
    }
  };

  const pedirAdjudicar = (supplierId: number, supplierName: string) => {
    if (!rfqComparison) return;
    const rfqId = rfqComparison.rfq.id;
    setConfirm({
      title: "Adjudicar cotización",
      message: `Se creará una orden de compra para ${supplierName} con los precios capturados. Las demás propuestas quedan descartadas.`,
      confirmLabel: "Adjudicar y crear orden",
      danger: false,
      fn: async () => {
        if (!token) return;
        setAwardingSupplierId(supplierId);
        try {
          await apiFetch(`procurement/rfq/${rfqId}/award`, token, {
            method: "POST",
            body: JSON.stringify({ supplierId }),
          });
          toast.success("Cotización adjudicada: se creó la orden de compra");
          setRfqComparison(null);
          void load();
        } catch (e) {
          toast.error(errorLegible(e, "No se pudo adjudicar"));
        } finally {
          setAwardingSupplierId(null);
        }
      },
    });
  };

  const pedirCancelarRfq = (r: Rfq) => {
    setConfirm({
      title: "Cancelar cotización",
      message: `¿Cancelar la cotización ${r.rfqNumber}${r.requisition?.title ? ` de «${r.requisition.title}»` : ""}? Los precios capturados ya no se podrán adjudicar.`,
      confirmLabel: "Cancelar cotización",
      danger: true,
      fn: async () => {
        if (!token) return;
        try {
          await apiFetch(`procurement/rfq/${r.id}/cancel`, token, { method: "PATCH" });
          toast.success("Cotización cancelada");
          if (rfqComparison?.rfq.id === r.id) setRfqComparison(null);
          void load();
        } catch (e) {
          toast.error(errorLegible(e, "No se pudo cancelar la cotización"));
        }
      },
    });
  };

  // ── Excel (la librería se carga solo al exportar) ───────────────────────
  const exportar = async (tipo: "orders" | "requisitions" | "receipts") => {
    const { exportToExcel } = await import("@/lib/export-excel");
    if (tipo === "orders") {
      exportToExcel(visibleOrders, [
        { key: "poNumber", label: "OC" },
        { key: "supplier", label: "Proveedor", format: (v) => (v as PurchaseOrder["supplier"])?.name ?? "—" },
        { key: "totalAmount", label: "Monto" },
        { key: "status", label: "Estado", format: (v) => PO_STATUS[String(v ?? "")] ?? String(v ?? "") },
        { key: "expectedDate", label: "Entrega estimada", format: (v) => (v ? String(v).slice(0, 10) : "") },
      ], "ordenes-compra", {
        title: "ÓRDENES DE COMPRA",
        summaryRows: [
          { label: "Órdenes visibles", value: visibleOrders.length },
          { label: "Monto total", value: visibleOrders.reduce((acc, o) => acc + Number(o.totalAmount || 0), 0) },
        ],
      });
    } else if (tipo === "requisitions") {
      exportToExcel(visibleReqs, [
        { key: "reqNumber", label: "Folio" },
        { key: "title", label: "Título" },
        { key: "priority", label: "Prioridad", format: (v) => PRIORITY_LABEL[String(v ?? "NORMAL")] ?? "Normal" },
        { key: "status", label: "Estado", format: (v) => REQ_STATUS[String(v ?? "")] ?? String(v ?? "") },
        { key: "requestedBy", label: "Solicitó", format: (v) => (v as Requisition["requestedBy"])?.nombre ?? "—" },
      ], "requisiciones", { title: "REQUISICIONES" });
    } else {
      exportToExcel(
        visibleReceipts.map((r) => ({
          folio: r.receiptNumber,
          oc: r.purchaseOrder?.poNumber ?? `OC-${r.purchaseOrderId}`,
          proveedor: r.purchaseOrder?.supplier?.name ?? "",
          almacen: r.warehouse ? [r.warehouse.code, r.warehouse.name].filter(Boolean).join(" — ") : "",
          partidas: r.items?.length ?? 0,
          cantidad: (r.items ?? []).reduce((acc, i) => acc + Number(i.quantityReceived || 0), 0),
          extra: costosExtra(r),
          recibio: r.receivedBy?.nombre ?? "",
          fecha: r.receiptDate ? String(r.receiptDate).slice(0, 10) : "",
          notas: r.notes ?? "",
        })),
        [
          { key: "folio", label: "Folio" },
          { key: "oc", label: "OC" },
          { key: "proveedor", label: "Proveedor" },
          { key: "almacen", label: "Almacén" },
          { key: "partidas", label: "Artículos" },
          { key: "cantidad", label: "Cantidad recibida" },
          { key: "extra", label: "Costos de importación" },
          { key: "recibio", label: "Recibió" },
          { key: "fecha", label: "Fecha" },
          { key: "notas", label: "Notas" },
        ],
        "recepciones-mercancia",
        { title: "RECEPCIONES DE MERCANCÍA" },
      );
    }
  };

  // ── Columnas ────────────────────────────────────────────────────────────
  const rfqColumns: Column<Rfq>[] = [
    {
      key: "requisition",
      label: "Qué se cotiza",
      render: (r) => (
        <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{r.requisition?.title ?? "Sin requisición"}</span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {r.rfqNumber}
            {r.requisition?.reqNumber ? ` · ${r.requisition.reqNumber}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "lines",
      label: "Renglones",
      numeric: true,
      width: 100,
      render: (r) => <span className={s.num}>{r._count?.lines ?? r.lines?.length ?? 0}</span>,
    },
    {
      key: "dueDate",
      label: "Responder antes del",
      width: 150,
      render: (r) => (r.dueDate ? <span style={{ fontSize: 12 }}>{fechaCorta(r.dueDate)}</span> : <span className={s.sinDato}>—</span>),
    },
    {
      key: "status",
      label: "Estado",
      width: 150,
      render: (r) => <Tag variant={varianteRfq(r.status)}>{RFQ_STATUS[r.status] ?? "Sin estado"}</Tag>,
    },
    {
      key: "actions",
      label: <span className={s.srOnly}>Acciones</span>,
      width: 190,
      render: (r) => (
        <div className={s.accionesFila}>
          <Button size="sm" variant="secondary" onClick={() => void openRfqComparison(r.id)}>
            {r.status === "AWARDED" || r.status === "CANCELLED" ? "Ver" : "Comparar precios"}
          </Button>
          {(r.status === "SENT" || r.status === "QUOTED") && (
            <Button size="sm" variant="ghost" onClick={() => pedirCancelarRfq(r)}>Cancelar</Button>
          )}
        </div>
      ),
    },
  ];

  const orderColumns: Column<PurchaseOrder>[] = [
    {
      key: "poNumber",
      label: "OC",
      width: 130,
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
    },
    {
      key: "supplier",
      label: "Proveedor",
      render: (o) => <span style={{ fontWeight: 600, fontSize: 13 }}>{o.supplier?.name ?? "—"}</span>,
    },
    { key: "totalAmount", label: "Monto", numeric: true, width: 130, render: (o) => <Money value={Number(o.totalAmount)} /> },
    {
      key: "expectedDate",
      label: "Entrega estimada",
      width: 140,
      render: (o) => {
        if (!o.expectedDate) return <span className={s.sinDato}>—</span>;
        const dias = diasHasta(o.expectedDate);
        const abierta = ocAbierta(o.status);
        const color = !abierta || dias == null
          ? "var(--text-tertiary)"
          : dias < 0 ? "var(--danger)" : dias <= 3 ? "var(--warning)" : "var(--text-secondary)";
        return (
          <div style={{ display: "grid", gap: 2 }}>
            <span style={{ fontSize: 12 }}>{fechaCorta(o.expectedDate)}</span>
            {abierta && dias != null && (
              <span style={{ fontSize: 11, fontWeight: dias <= 3 ? 700 : 400, color }}>
                {dias < 0 ? `Atrasada ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}` : plazoLegible(dias)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Estado",
      width: 150,
      render: (o) => <Tag variant={variantePo(o.status)}>{PO_STATUS[o.status] ?? "Sin estado"}</Tag>,
    },
    {
      key: "actions",
      label: <span className={s.srOnly}>Acciones</span>,
      width: 170,
      render: (o) => (
        <div className={s.accionesFila}>
          {o.status === "DRAFT" && cfg.canApprove && (
            <Button
              size="sm"
              variant="secondary"
              loading={aprobandoId === `po-${o.id}`}
              disabled={aprobandoId != null}
              onClick={(e) => {
                e.stopPropagation();
                void approvePo(o.id);
              }}
            >
              Aprobar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Descargar PDF de la orden ${o.poNumber}`}
            onClick={(e) => {
              e.stopPropagation();
              void downloadPoPdf(o.id, o.poNumber);
            }}
          >
            PDF
          </Button>
        </div>
      ),
    },
  ];

  const reqColumns: Column<Requisition>[] = [
    {
      key: "title",
      label: "Requisición",
      render: (r) => (
        <div style={{ display: "grid", gap: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {r.reqNumber}
            {r.requestedBy?.nombre ? ` · ${r.requestedBy.nombre}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "priority",
      label: "Prioridad",
      width: 110,
      render: (r) => {
        const p = prioridad(r.priority);
        return <Tag variant={p.variante}>{p.texto}</Tag>;
      },
    },
    {
      key: "requiredDate",
      label: "Se necesita",
      width: 120,
      render: (r) => (r.requiredDate ? <span style={{ fontSize: 12 }}>{fechaCorta(r.requiredDate)}</span> : <span className={s.sinDato}>—</span>),
    },
    {
      key: "status",
      label: "Estado",
      width: 120,
      render: (r) => <Tag variant={varianteReq(r.status)}>{REQ_STATUS[r.status] ?? "Sin estado"}</Tag>,
    },
    {
      key: "actions",
      label: <span className={s.srOnly}>Acciones</span>,
      width: 190,
      render: (r) =>
        r.status === "PENDING" && cfg.canApprove ? (
          <div className={s.accionesFila}>
            <Button
              size="sm"
              variant="secondary"
              loading={aprobandoId === `req-${r.id}`}
              disabled={aprobandoId != null}
              onClick={(e) => {
                e.stopPropagation();
                void approveReq(r.id);
              }}
            >
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                openRejectReq(r);
              }}
            >
              Rechazar
            </Button>
          </div>
        ) : null,
    },
  ];

  const receiptColumns: Column<GoodsReceipt>[] = [
    { key: "receiptNumber", label: "Folio", width: 120, render: (r) => <code style={{ fontSize: 11.5 }}>{r.receiptNumber}</code> },
    {
      key: "purchaseOrder",
      label: "Orden",
      width: 120,
      render: (r) => (
        <button type="button" className={s.enlace} onClick={() => navegar({ tab: "orders", id: r.purchaseOrderId })}>
          {r.purchaseOrder?.poNumber ?? "Ver orden"}
        </button>
      ),
    },
    { key: "supplier", label: "Proveedor", width: 150, accessor: (r) => r.purchaseOrder?.supplier?.name ?? "—" },
    {
      key: "warehouse",
      label: "Almacén",
      width: 150,
      render: (r) => <span style={{ fontSize: 12 }}>{r.warehouse?.name ?? "—"}</span>,
    },
    {
      key: "items",
      label: "Recibido",
      numeric: true,
      width: 120,
      render: (r) => {
        const n = r.items?.length ?? 0;
        const qty = (r.items ?? []).reduce((acc, i) => acc + Number(i.quantityReceived || 0), 0);
        return (
          <span style={{ fontSize: 12 }}>
            {cantidad(qty)} en {n} {n === 1 ? "artículo" : "artículos"}
          </span>
        );
      },
    },
    {
      key: "landed",
      label: "Costos de importación",
      numeric: true,
      width: 130,
      render: (r) => {
        const t = costosExtra(r);
        return t > 0 ? <Money value={t} compact /> : <span className={s.sinDato}>—</span>;
      },
    },
    { key: "receivedBy", label: "Recibió", width: 130, accessor: (r) => r.receivedBy?.nombre ?? "—" },
    { key: "receiptDate", label: "Fecha", width: 110, accessor: (r) => fechaCorta(r.receiptDate) },
    {
      key: "actions",
      label: <span className={s.srOnly}>Acciones</span>,
      width: 70,
      render: (r) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Descargar PDF de la recepción ${r.receiptNumber}`}
          onClick={(e) => {
            e.stopPropagation();
            void downloadReceiptPdf(r.id, r.receiptNumber);
          }}
        >
          PDF
        </Button>
      ),
    },
  ];

  const primeraCarga = loading && !cargado[tab];
  const totalReq = reqItems.reduce((acc, i) => acc + (Number(i.estimatedCost) || 0) * (Number(i.quantity) || 0), 0);
  const totalPo = poItems.reduce((acc, i) => acc + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0), 0);
  const ordenRecepcionFuera = receiptPoId && !ordenesAbiertas.some((o) => String(o.id) === receiptPoId);
  const poNumberFiltro = poId ? receipts.find((r) => String(r.purchaseOrderId) === poId)?.purchaseOrder?.poNumber : null;

  const tituloSeccion = primeraCarga
    ? "Cargando…"
    : tab === "orders"
      ? `${visibleOrders.length} ${visibleOrders.length === 1 ? "orden" : "órdenes"}`
      : tab === "requisitions"
        ? `${visibleReqs.length} ${visibleReqs.length === 1 ? "requisición" : "requisiciones"}`
        : tab === "rfq"
          ? `${visibleRfqs.length} ${visibleRfqs.length === 1 ? "cotización" : "cotizaciones"}`
          : `${visibleReceipts.length} ${visibleReceipts.length === 1 ? "recepción" : "recepciones"}`;

  return (
    <>
      <PageHeader
        eyebrow="ERP · Compras"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            {tab !== "mayoristas" && (
              <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading && !primeraCarga}>
                Actualizar
              </Button>
            )}
            {cfg.canCreate && (
              <Button variant="secondary" size="sm" iconLeft="+" onClick={openSupplierForm}>Nuevo proveedor</Button>
            )}
            {cfg.canCreate && tab === "requisitions" && (
              <Button variant="primary" size="sm" onClick={abrirReqForm}>Nueva requisición</Button>
            )}
            {cfg.canCreate && tab === "orders" && (
              <Button variant="primary" size="sm" onClick={abrirPoForm}>Nueva orden de compra</Button>
            )}
            {cfg.canCreate && tab === "receipts" && (
              <Button variant="primary" size="sm" onClick={abrirRecepcion}>Registrar recepción</Button>
            )}
            {cfg.canCreate && tab === "rfq" && (
              <Button variant="primary" size="sm" onClick={abrirRfqForm}>Pedir cotización</Button>
            )}
          </>
        }
      />

      <ol className={s.flujo} aria-label="Así avanza una compra">
        {ETAPAS.map((e) => (
          <li key={e.tab} className={s.flujoPaso}>
            <span
              className={`${s.flujoEtapa} ${tab === e.tab ? s.flujoActivo : ""}`}
              aria-current={tab === e.tab ? "step" : undefined}
            >
              {e.label}
            </span>
          </li>
        ))}
      </ol>

      <PanelTabs
        ariaLabel="Secciones de compras"
        value={tab}
        onChange={setTab}
        tabs={TABS_COMPRAS.map((t) => ({ key: t.key, label: t.label }))}
      />

      {/* Mayoristas trae su propia tabla y su propio detalle. */}
      {tab === "mayoristas" && <WholesalePanel token={token} canManage={cfg.canCreate} />}

      {tab !== "mayoristas" && (
        <>
          {errorCarga && (
            <div style={{ marginBottom: 12 }}>
              <InlineAlert
                variant={cargado[tab] ? "warning" : "danger"}
                message={cargado[tab] ? `${errorCarga}. Se muestra lo último que cargó.` : errorCarga}
                action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
              />
            </div>
          )}

          {cargado[tab] && (
            <div className={s.kpis}>
              {tab === "orders" && cifras && (
                <>
                  <KpiCard label="Por aprobar" value={cifras.porAprobar} variant={cifras.porAprobar > 0 ? "warning" : "neutral"} />
                  <KpiCard label="Abiertas" value={cifras.abiertas} hint="sin recibir completas" variant="accent" />
                  <KpiCard label="Atrasadas" value={cifras.atrasadas} hint="pasó su fecha de entrega" variant={cifras.atrasadas > 0 ? "danger" : "positive"} />
                  <KpiCard label="Monto abierto" value={<span className={s.num}>{pesos(cifras.montoAbierto, { enteros: true })}</span>} />
                </>
              )}
              {tab === "requisitions" && (
                <>
                  <KpiCard label="Por aprobar" value={cifrasReq.pendientes} variant={cifrasReq.pendientes > 0 ? "warning" : "positive"} />
                  <KpiCard label="Urgentes por aprobar" value={cifrasReq.urgentes} variant={cifrasReq.urgentes > 0 ? "danger" : "neutral"} />
                  <KpiCard label="Aprobadas" value={cifrasReq.aprobadas} hint="listas para cotizar o comprar" variant="accent" />
                </>
              )}
              {tab === "rfq" && (
                <>
                  <KpiCard label="Esperando precios" value={cifrasRfq.esperando} variant={cifrasRfq.esperando > 0 ? "warning" : "neutral"} />
                  <KpiCard label="Con precios" value={cifrasRfq.conPrecios} hint="listas para adjudicar" variant="accent" />
                  <KpiCard label="Adjudicadas" value={cifrasRfq.adjudicadas} variant="positive" />
                </>
              )}
              {tab === "receipts" && (
                <>
                  <KpiCard label="Recepciones" value={receipts.length} />
                  <KpiCard label="Este mes" value={cifrasRecepciones.esteMes} variant="accent" />
                  <KpiCard
                    label="Costos de importación"
                    value={<span className={s.num}>{pesos(cifrasRecepciones.extra, { enteros: true })}</span>}
                    hint="flete, seguro, aranceles y otros"
                  />
                </>
              )}
            </div>
          )}

          {tab === "orders" && cifras && orders.length > 0 && (
            <div className={s.reparto}>
              <p className={s.repartoTitulo}>Órdenes por estado</p>
              <div className={s.repartoBarra} aria-hidden>
                {Object.keys(PO_STATUS)
                  .filter((k) => cifras.porEstado[k])
                  .map((k) => (
                    <div
                      key={k}
                      className={s.repartoTramo}
                      style={{ width: `${(cifras.porEstado[k] / orders.length) * 100}%`, background: PO_STATUS_COLOR[k] }}
                    />
                  ))}
              </div>
              <ul className={s.repartoLeyenda}>
                {Object.keys(PO_STATUS)
                  .filter((k) => cifras.porEstado[k])
                  .map((k) => (
                    <li key={k}>
                      <span className={s.repartoPunto} style={{ background: PO_STATUS_COLOR[k] }} aria-hidden />
                      {PO_STATUS[k]} <strong className={s.num}>{cifras.porEstado[k]}</strong>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {tab === "rfq" && suppliers.length > 0 && (
            <Section
              title="RFC de proveedores"
              subtitle="Se usa en la DIOT (Contabilidad → Cumplimiento SAT). Se guarda al salir del campo."
            >
              <div className={s.rfcs}>
                {suppliers.map((sp) => (
                  <div key={sp.id} className={s.rfcFila}>
                    <span title={sp.name}>{sp.name}</span>
                    <input
                      defaultValue={sp.rfc ?? ""}
                      placeholder="RFC"
                      aria-label={`RFC de ${sp.name}`}
                      maxLength={13}
                      disabled={savingSupplierRfcId === sp.id}
                      onBlur={(e) => {
                        if (e.target.value.trim().toUpperCase() !== (sp.rfc ?? "")) void saveSupplierRfc(sp.id, sp.name, e.target.value);
                      }}
                      className={`${s.input} ${s.rfcInput} ${sp.rfc ? "" : s.rfcFalta}`}
                    />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {tab === "rfq" && (
            <ComparacionCotizaciones
              comparison={rfqComparison}
              loading={comparisonLoading}
              canApprove={cfg.canApprove}
              savingLineId={savingQuoteLineId}
              awardingSupplierId={awardingSupplierId}
              onClose={() => setRfqComparison(null)}
              onSaveLine={(lineId, draft) => void submitQuoteLine(lineId, draft)}
              onAward={pedirAdjudicar}
              onVerOrden={(id) => navegar({ tab: "orders", id })}
            />
          )}

          <FilterToolbar
            search={{
              value: searchQ,
              onChange: setSearchQ,
              placeholder:
                tab === "orders"
                  ? "Buscar orden, proveedor…"
                  : tab === "requisitions"
                    ? "Buscar requisición, título, quién la pidió…"
                    : tab === "rfq"
                      ? "Buscar cotización o requisición…"
                      : "Buscar recepción u orden…",
            }}
            selects={
              tab === "orders"
                ? [{
                    label: "Estado",
                    value: filterPoStatus,
                    onChange: setFilterPoStatus,
                    options: Object.entries(PO_STATUS).map(([value, label]) => ({ value, label })),
                    allowAll: true,
                  }]
                : tab === "requisitions"
                  ? [{
                      label: "Estado",
                      value: filterReqStatus,
                      onChange: setFilterReqStatus,
                      options: Object.entries(REQ_STATUS).map(([value, label]) => ({ value, label })),
                      allowAll: true,
                    }]
                  : []
            }
            onClear={() => { setSearchQ(""); setFilterPoStatus(""); setFilterReqStatus(""); }}
            resultCount={
              primeraCarga
                ? null
                : tab === "orders"
                  ? visibleOrders.length
                  : tab === "requisitions"
                    ? visibleReqs.length
                    : tab === "rfq"
                      ? visibleRfqs.length
                      : visibleReceipts.length
            }
            rightActions={
              tab === "orders" && orders.length > 0 ? (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => void exportar("orders")}>Descargar Excel</Button>
              ) : tab === "requisitions" && requisitions.length > 0 ? (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => void exportar("requisitions")}>Descargar Excel</Button>
              ) : tab === "receipts" && visibleReceipts.length > 0 ? (
                <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => void exportar("receipts")}>Descargar Excel</Button>
              ) : undefined
            }
          />

          {highlightId && (
            <p className={s.aviso}>
              {tab === "receipts"
                ? "Vienes de un enlace: se muestra solo esa recepción."
                : "Vienes de un enlace: ese registro va primero en la lista."}
              <button type="button" className={s.enlace} onClick={() => navegar({ tab })}>Ver todos</button>
            </p>
          )}
          {poId && tab === "receipts" && (
            <p className={s.aviso}>
              Recepciones de la orden {poNumberFiltro ?? "elegida"}.
              <button type="button" className={s.enlace} onClick={() => navegar({ tab: "receipts" })}>Ver todas</button>
            </p>
          )}

          {detailKind && (
            <section className={chrome.poDetail} aria-labelledby="detalle-compra-titulo">
              <div className={chrome.poDetailHead}>
                <h2 id="detalle-compra-titulo" className={chrome.poDetailTitle}>
                  {detailKind === "order" ? `Orden de compra ${poDetail?.poNumber ?? ""}` : `Requisición ${reqDetail?.reqNumber ?? ""}`}
                </h2>
                <Button variant="ghost" size="sm" onClick={cerrarDetalle}>Cerrar</Button>
              </div>
              {detailLoading && <SkeletonRows rows={4} label="Cargando detalle" />}
              {detailErr && !detailLoading && <InlineAlert variant="danger" message={detailErr} />}
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
                        <Tag variant={variantePo(poDetail.status)}>{PO_STATUS[poDetail.status] ?? "Sin estado"}</Tag>
                      </div>
                    </div>
                    <div className={chrome.poMetaItem}>
                      <span className={chrome.poMetaLabel}>Monto</span>
                      <div className={chrome.poMetaValue}><Money value={Number(poDetail.totalAmount)} /></div>
                    </div>
                    <div className={chrome.poMetaItem}>
                      <span className={chrome.poMetaLabel}>Entrega estimada</span>
                      <div className={chrome.poMetaValue}>{fechaCorta(poDetail.expectedDate)}</div>
                    </div>
                    <div className={chrome.poMetaItem}>
                      <span className={chrome.poMetaLabel}>Creada por</span>
                      <div className={chrome.poMetaValue}>{poDetail.createdBy?.nombre ?? "—"}</div>
                    </div>
                  </div>
                  {(poDetail.items ?? []).length > 0 ? (
                    <div className={s.tablaEnvoltura}>
                      <table className={chrome.poTable}>
                        <thead>
                          <tr>
                            <th scope="col">Artículo</th>
                            <th scope="col" className={s.num}>Pedido</th>
                            <th scope="col" className={s.num}>Recibido</th>
                            <th scope="col" className={s.num}>Precio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(poDetail.items ?? []).map((i) => (
                            <tr key={i.id}>
                              <td>{i.description}</td>
                              <td className={s.num}>{cantidad(i.quantity)}</td>
                              <td className={s.num}>{cantidad(i.receivedQty ?? 0)}</td>
                              <td className={s.num}><Money value={Number(i.unitPrice ?? 0)} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState variant="compact" title="Sin artículos" description="Esta orden no tiene artículos registrados." />
                  )}
                  <div className={s.accionesFila} style={{ marginTop: 12 }}>
                    <Button variant="secondary" onClick={() => void downloadPoPdf(poDetail.id, poDetail.poNumber)}>
                      Descargar PDF
                    </Button>
                    {cfg.canCreate && ocAbierta(poDetail.status) && (
                      <Button variant="primary" onClick={() => openReceiptForPo(poDetail.id)}>Registrar recepción</Button>
                    )}
                    <Button variant="ghost" onClick={() => navegar({ tab: "receipts", poId: poDetail.id })}>
                      Ver sus recepciones
                    </Button>
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
                      <div className={chrome.poMetaValue}>
                        <Tag variant={varianteReq(reqDetail.status)}>{REQ_STATUS[reqDetail.status] ?? "Sin estado"}</Tag>
                      </div>
                    </div>
                    <div className={chrome.poMetaItem}>
                      <span className={chrome.poMetaLabel}>Prioridad</span>
                      <div className={chrome.poMetaValue}>{prioridad(reqDetail.priority).texto}</div>
                    </div>
                    <div className={chrome.poMetaItem}>
                      <span className={chrome.poMetaLabel}>Solicitó</span>
                      <div className={chrome.poMetaValue}>{reqDetail.requestedBy?.nombre ?? "—"}</div>
                    </div>
                  </div>
                  {reqDetail.rejectionReason && (
                    <InlineAlert variant="danger" message={`Motivo del rechazo: ${reqDetail.rejectionReason}`} />
                  )}
                  {(reqDetail.items ?? []).length > 0 ? (
                    <div className={s.tablaEnvoltura}>
                      <table className={chrome.poTable}>
                        <thead>
                          <tr>
                            <th scope="col">Artículo</th>
                            <th scope="col" className={s.num}>Cantidad</th>
                            <th scope="col" className={s.num}>Costo estimado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(reqDetail.items ?? []).map((i) => (
                            <tr key={i.id}>
                              <td>{i.description}</td>
                              <td className={s.num}>{cantidad(i.quantity)}</td>
                              <td className={s.num}><Money value={Number(i.estimatedCost ?? 0)} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState variant="compact" title="Sin artículos" description="Esta requisición no tiene artículos." />
                  )}
                  {reqDetail.status === "PENDING" && cfg.canApprove && (
                    <div className={s.accionesFila} style={{ marginTop: 12 }}>
                      <Button
                        variant="primary"
                        loading={aprobandoId === `req-${reqDetail.id}`}
                        onClick={() => void approveReq(reqDetail.id).then(() => loadReqDetail(reqDetail.id))}
                      >
                        Aprobar
                      </Button>
                      <Button variant="ghost" onClick={() => openRejectReq(reqDetail)}>Rechazar</Button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <Section title={tituloSeccion}>
            {primeraCarga ? (
              <SkeletonRows rows={6} label="Cargando compras" />
            ) : errorCarga && !cargado[tab] ? null : tab === "rfq" ? (
              <DataTable
                columns={rfqColumns}
                rows={visibleRfqs}
                rowKey={(r) => r.id}
                emptyTitle={busqueda ? "Ninguna cotización coincide" : "Aún no hay cotizaciones"}
                emptyDescription="Pide precios a varios proveedores a partir de una requisición y compáralos antes de crear la orden de compra."
                emptyAction={cfg.canCreate ? <Button size="sm" variant="primary" onClick={abrirRfqForm}>Pedir cotización</Button> : undefined}
              />
            ) : tab === "orders" ? (
              <DataTable
                columns={orderColumns}
                rows={visibleOrders}
                rowKey={(o) => o.id}
                onRowClick={(o) => void loadOrderDetail(o.id)}
                emptyTitle={busqueda || filterPoStatus ? "Ninguna orden coincide" : "Aún no hay órdenes de compra"}
                emptyDescription={
                  busqueda || filterPoStatus
                    ? "Prueba con otra búsqueda o quita el filtro de estado."
                    : "Crea una orden directa o aprueba una requisición para generar la primera."
                }
                emptyAction={
                  busqueda || filterPoStatus ? (
                    <Button size="sm" variant="secondary" onClick={() => { setSearchQ(""); setFilterPoStatus(""); }}>Quitar filtros</Button>
                  ) : cfg.canCreate ? (
                    <Button size="sm" variant="primary" onClick={abrirPoForm}>Nueva orden de compra</Button>
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
                emptyTitle={busqueda || filterReqStatus ? "Ninguna requisición coincide" : "Aún no hay requisiciones"}
                emptyDescription={
                  busqueda || filterReqStatus
                    ? "Prueba con otra búsqueda o quita el filtro de estado."
                    : "Pide aquí materiales o servicios; compras los cotiza y genera la orden."
                }
                emptyAction={
                  busqueda || filterReqStatus ? (
                    <Button size="sm" variant="secondary" onClick={() => { setSearchQ(""); setFilterReqStatus(""); }}>Quitar filtros</Button>
                  ) : cfg.canCreate ? (
                    <Button size="sm" variant="primary" onClick={abrirReqForm}>Nueva requisición</Button>
                  ) : undefined
                }
              />
            ) : (
              <DataTable
                columns={receiptColumns}
                rows={visibleReceipts}
                rowKey={(r) => r.id}
                emptyTitle={busqueda ? "Ninguna recepción coincide" : "Aún no hay recepciones"}
                emptyDescription="Cuando llegue mercancía, regístrala contra su orden de compra: entra al almacén y genera la cuenta por pagar."
                emptyAction={
                  cfg.canCreate ? (
                    <Button size="sm" variant="primary" onClick={abrirRecepcion}>Registrar recepción</Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setTab("orders")}>Ver órdenes</Button>
                  )
                }
              />
            )}
          </Section>
        </>
      )}

      {/* ── Nueva requisición ─────────────────────────────────────────── */}
      <Modal
        open={showReqForm}
        onClose={() => setShowReqForm(false)}
        title="Nueva requisición"
        maxWidth={680}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowReqForm(false)} disabled={savingReq}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveReq()} loading={savingReq}>Crear requisición</Button>
          </>
        }
      >
        {reqErr && <InlineAlert variant="danger" message={reqErr} style={{ marginBottom: 12 }} />}
        <div className={s.rejilla}>
          <label className={`${s.campo} ${s.ancho}`}>
            <span className={s.etiqueta}>Qué se necesita</span>
            <input
              value={reqForm.title}
              onChange={(e) => setReqForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ej. Cables y conectores para obra Pachuca"
              className={s.input}
              aria-invalid={reqErr && !reqForm.title.trim() ? true : undefined}
            />
          </label>
          <label className={s.campo}>
            <span className={s.etiqueta}>Prioridad</span>
            <select value={reqForm.priority} onChange={(e) => setReqForm((f) => ({ ...f, priority: e.target.value }))} className={s.input}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </label>
        </div>
        <p className={s.subtitulo}>Artículos</p>
        {reqItems.map((item, idx) => (
          <div key={idx} className={s.partida}>
            <input
              value={item.description}
              onChange={(e) => setReqItems((prev) => prev.map((it, i) => (i === idx ? { ...it, description: e.target.value } : it)))}
              placeholder="Descripción del artículo"
              aria-label={`Artículo ${idx + 1}: descripción`}
              className={s.input}
            />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={item.quantity}
              onChange={(e) => setReqItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: +e.target.value } : it)))}
              placeholder="Cant."
              aria-label={`Artículo ${idx + 1}: cantidad`}
              className={`${s.input} ${s.num}`}
            />
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={item.estimatedCost}
              onChange={(e) => setReqItems((prev) => prev.map((it, i) => (i === idx ? { ...it, estimatedCost: e.target.value } : it)))}
              placeholder="Costo est."
              aria-label={`Artículo ${idx + 1}: costo estimado por pieza`}
              className={`${s.input} ${s.num}`}
            />
            {reqItems.length > 1 ? (
              <button
                type="button"
                className={s.quitar}
                aria-label={`Quitar artículo ${idx + 1}`}
                onClick={() => setReqItems((prev) => prev.filter((_, i) => i !== idx))}
              >
                ✕
              </button>
            ) : <span />}
          </div>
        ))}
        <button type="button" className={s.agregar} onClick={() => setReqItems((prev) => [...prev, { ...emptyReqItem }])}>
          + Agregar artículo
        </button>
        {totalReq > 0 && (
          <p className={s.total}>Estimado: <strong>{pesos(totalReq)}</strong></p>
        )}
      </Modal>

      {/* ── Nueva orden de compra ─────────────────────────────────────── */}
      <Modal
        open={showPoForm}
        onClose={() => setShowPoForm(false)}
        title="Nueva orden de compra"
        maxWidth={680}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowPoForm(false)} disabled={savingPo}>Cancelar</Button>
            <Button variant="primary" onClick={() => void savePo()} loading={savingPo}>Crear orden</Button>
          </>
        }
      >
        {poErr && <InlineAlert variant="danger" message={poErr} style={{ marginBottom: 12 }} />}
        <div className={s.rejilla}>
          <label className={s.campo}>
            <span className={s.etiqueta}>Proveedor</span>
            <input
              value={poForm.supplierName}
              onChange={(e) => setPoForm((f) => ({ ...f, supplierName: e.target.value }))}
              placeholder="Nombre del proveedor"
              list="compras-proveedores"
              autoComplete="off"
              className={s.input}
              aria-invalid={poErr && !poForm.supplierName.trim() ? true : undefined}
            />
            <datalist id="compras-proveedores">
              {suppliers.map((sp) => <option key={sp.id} value={sp.name} />)}
            </datalist>
          </label>
          <label className={s.campo}>
            <span className={s.etiqueta}>Entrega estimada</span>
            <input
              type="date"
              min={hoyIso()}
              value={poForm.expectedDate}
              onChange={(e) => setPoForm((f) => ({ ...f, expectedDate: e.target.value }))}
              className={s.input}
            />
          </label>
        </div>
        <p className={s.subtitulo}>Artículos</p>
        {poItems.map((item, idx) => (
          <div key={idx} className={s.partida}>
            <input
              value={item.description}
              onChange={(e) => setPoItems((prev) => prev.map((it, i) => (i === idx ? { ...it, description: e.target.value } : it)))}
              placeholder="Descripción del artículo"
              aria-label={`Artículo ${idx + 1}: descripción`}
              className={s.input}
            />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={item.quantity}
              onChange={(e) => setPoItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: +e.target.value } : it)))}
              placeholder="Cant."
              aria-label={`Artículo ${idx + 1}: cantidad`}
              className={`${s.input} ${s.num}`}
            />
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={item.unitPrice}
              onChange={(e) => setPoItems((prev) => prev.map((it, i) => (i === idx ? { ...it, unitPrice: e.target.value } : it)))}
              placeholder="Precio unit."
              aria-label={`Artículo ${idx + 1}: precio unitario`}
              className={`${s.input} ${s.num}`}
            />
            {poItems.length > 1 ? (
              <button
                type="button"
                className={s.quitar}
                aria-label={`Quitar artículo ${idx + 1}`}
                onClick={() => setPoItems((prev) => prev.filter((_, i) => i !== idx))}
              >
                ✕
              </button>
            ) : <span />}
          </div>
        ))}
        <button type="button" className={s.agregar} onClick={() => setPoItems((prev) => [...prev, { ...emptyPoItem }])}>
          + Agregar artículo
        </button>
        {totalPo > 0 && (
          <p className={s.total}>Total: <strong>{pesos(totalPo)}</strong></p>
        )}
      </Modal>

      {/* ── Pedir cotización ──────────────────────────────────────────── */}
      <Modal
        open={showRfqForm}
        onClose={() => setShowRfqForm(false)}
        title="Pedir cotización"
        maxWidth={640}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowRfqForm(false)} disabled={savingRfq}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => void submitCreateRfq()}
              loading={savingRfq}
              disabled={!rfqForm.requisitionId || !rfqForm.supplierIds.length}
            >
              Pedir precios
            </Button>
          </>
        }
      >
        <div className={s.rejilla}>
          <label className={`${s.campo} ${s.ancho}`}>
            <span className={s.etiqueta}>Requisición</span>
            <select
              value={rfqForm.requisitionId}
              onChange={(e) => setRfqForm((f) => ({ ...f, requisitionId: e.target.value }))}
              className={s.input}
            >
              <option value="">Elige qué se va a cotizar…</option>
              {requisitions
                .filter((r) => r.status !== "REJECTED" && r.status !== "CANCELLED")
                .map((r) => <option key={r.id} value={r.id}>{r.title} ({r.reqNumber})</option>)}
            </select>
          </label>
          <fieldset className={`${s.campo} ${s.ancho}`} style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className={s.etiqueta} style={{ marginBottom: 4 }}>
              Proveedores a los que se pide precio
              {rfqForm.supplierIds.length > 0 ? ` · ${rfqForm.supplierIds.length} elegidos` : ""}
            </legend>
            <div className={s.opciones}>
              {suppliers.length === 0 && (
                <span className={s.ayuda}>Aún no hay proveedores. Da de alta el primero con «Nuevo proveedor».</span>
              )}
              {suppliers.map((sp) => {
                const checked = rfqForm.supplierIds.includes(sp.id);
                return (
                  <label key={sp.id} className={`${s.opcion} ${checked ? s.opcionActiva : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setRfqForm((f) => ({
                          ...f,
                          supplierIds: e.target.checked ? [...f.supplierIds, sp.id] : f.supplierIds.filter((id) => id !== sp.id),
                        }))
                      }
                    />
                    {sp.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className={s.campo}>
            <span className={s.etiqueta}>Responder antes del</span>
            <input
              type="date"
              min={hoyIso()}
              value={rfqForm.dueDate}
              onChange={(e) => setRfqForm((f) => ({ ...f, dueDate: e.target.value }))}
              className={s.input}
            />
          </label>
          <label className={`${s.campo} ${s.ancho}`}>
            <span className={s.etiqueta}>Notas para el proveedor</span>
            <input
              value={rfqForm.notes}
              onChange={(e) => setRfqForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Condiciones, marcas aceptadas, lugar de entrega…"
              className={s.input}
            />
          </label>
        </div>
      </Modal>

      {/* ── Registrar recepción ───────────────────────────────────────── */}
      <Modal
        open={showReceiptForm}
        onClose={cerrarRecepcion}
        title="Registrar recepción de mercancía"
        maxWidth={760}
        footer={
          <>
            <Button variant="ghost" onClick={cerrarRecepcion} disabled={savingReceipt}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => void saveReceipt()}
              loading={savingReceipt}
              disabled={!receiptPoId || receiptLines.length === 0}
            >
              Registrar entrada
            </Button>
          </>
        }
      >
        <div className={s.rejilla}>
          <label className={`${s.campo} ${s.ancho}`}>
            <span className={s.etiqueta}>Orden de compra que llegó</span>
            <select value={receiptPoId} onChange={(e) => elegirOrdenRecepcion(e.target.value)} className={s.input}>
              <option value="">{ordenesAbiertas.length ? "Elige la orden…" : "No hay órdenes abiertas por recibir"}</option>
              {ordenRecepcionFuera && (
                <option value={receiptPoId}>{poDetail && String(poDetail.id) === receiptPoId ? poDetail.poNumber : "Orden elegida"}</option>
              )}
              {ordenesAbiertas.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.poNumber} · {o.supplier?.name ?? "Sin proveedor"} · {pesos(o.totalAmount, { enteros: true })}
                  {o.status === "DRAFT" ? " (por aprobar)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={s.campo}>
            <span className={s.etiqueta}>Almacén donde entra</span>
            <select value={receiptWarehouseId} onChange={(e) => setReceiptWarehouseId(e.target.value)} className={s.input}>
              <option value="">El de siempre</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label className={s.campo}>
            <span className={s.etiqueta}>Notas</span>
            <input
              value={receiptNotes}
              onChange={(e) => setReceiptNotes(e.target.value)}
              placeholder="Ej. llegó una caja golpeada"
              className={s.input}
            />
          </label>
        </div>

        {loadingReceiptPo && <SkeletonRows rows={3} label="Cargando artículos de la orden" />}

        {!loadingReceiptPo && receiptLines.length > 0 && (
          <>
            <div className={s.tablaEnvoltura}>
              <table className={s.tabla}>
                <thead>
                  <tr>
                    <th scope="col">Artículo</th>
                    <th scope="col" className={s.num}>Pedido</th>
                    <th scope="col" className={s.num}>Ya llegó</th>
                    <th scope="col" className={s.num}>Llega ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptLines.map((line) => (
                    <tr key={line.purchaseOrderItemId}>
                      <td>{line.description}</td>
                      <td className={s.num}>{cantidad(line.ordered)}</td>
                      <td className={s.num}>{cantidad(line.alreadyReceived)}</td>
                      <td className={s.num}>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={Math.max(0, line.ordered - line.alreadyReceived)}
                          value={line.qty}
                          aria-label={`Cantidad que llega de ${line.description}`}
                          onChange={(e) =>
                            setReceiptLines((prev) =>
                              prev.map((l) => (l.purchaseOrderItemId === line.purchaseOrderItemId ? { ...l, qty: e.target.value } : l)),
                            )
                          }
                          className={`${s.input} ${s.num}`}
                          style={{ width: 96 }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={s.ayuda} style={{ margin: "8px 0 0" }}>
              Si no llegó todo, registra lo que sí llegó; lo demás queda pendiente en la orden.
            </p>

            <div className={s.caja}>
              <p className={s.cajaTitulo}>Costos de importación (opcional)</p>
              <p className={s.ayuda} style={{ margin: 0 }}>
                Se reparten entre los artículos según su valor y se suman a su costo.
              </p>
              <div className={s.rejilla4}>
                {COSTOS_EXTRA.map((c) => (
                  <label key={c.key} className={s.campo}>
                    <span className={s.etiqueta}>{c.label}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={receiptLandedCost[c.key]}
                      onChange={(e) => setReceiptLandedCost((f) => ({ ...f, [c.key]: e.target.value }))}
                      className={`${s.input} ${s.num}`}
                    />
                  </label>
                ))}
              </div>
              {totalCostosExtra > 0 && (
                <p className={s.total}>A repartir: <strong>{pesos(totalCostosExtra)}</strong></p>
              )}
            </div>
          </>
        )}

        {receiptErr && <InlineAlert variant="danger" message={receiptErr} style={{ marginTop: 12 }} />}
      </Modal>

      {/* ── Rechazar requisición ──────────────────────────────────────── */}
      <Modal
        open={rejectReqModal != null}
        onClose={() => setRejectReqModal(null)}
        title="Rechazar requisición"
        maxWidth={480}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectReqModal(null)} disabled={rejectingReq}>Cancelar</Button>
            <Button variant="danger" onClick={() => void submitRejectReq()} loading={rejectingReq}>Rechazar</Button>
          </>
        }
      >
        {rejectReqModal && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)" }}>
            <strong>{rejectReqModal.title}</strong> · {rejectReqModal.reqNumber}
          </p>
        )}
        <label className={s.campo}>
          <span className={s.etiqueta}>Motivo</span>
          <textarea
            value={rejectReqReason}
            onChange={(e) => {
              setRejectReqReason(e.target.value);
              if (e.target.value.trim()) setRejectReqErr(null);
            }}
            rows={4}
            placeholder="Explica por qué, para que quien la pidió sepa qué corregir…"
            aria-invalid={rejectReqErr ? true : undefined}
            className={s.input}
            style={{ resize: "vertical", lineHeight: 1.45 }}
          />
        </label>
        {rejectReqErr && <InlineAlert variant="danger" message={rejectReqErr} style={{ marginTop: 12 }} />}
      </Modal>

      {/* ── Alta de proveedor ─────────────────────────────────────────── */}
      <Modal
        open={showSupplierForm}
        onClose={() => setShowSupplierForm(false)}
        title="Nuevo proveedor"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowSupplierForm(false)} disabled={savingSupplier}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveSupplier()} loading={savingSupplier}>Dar de alta</Button>
          </>
        }
      >
        {supplierErr && <InlineAlert variant="danger" message={supplierErr} style={{ marginBottom: 12 }} />}
        <FinanceFormGrid>
          <FinanceField label="Nombre o razón social" fullWidth hint="Tal como aparece en sus facturas. Si ya existe, se completa su ficha en vez de duplicarla.">
            <input
              value={supplierForm.name}
              onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Distribuidora del Norte S.A. de C.V."
              className={s.input}
            />
          </FinanceField>
          <FinanceField label="RFC" optional hint="Sin él no entra en la DIOT ni cuadra su factura recibida.">
            <input
              value={supplierForm.rfc}
              onChange={(e) => setSupplierForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
              placeholder="DNO920101AB1"
              maxLength={13}
              className={s.input}
              style={{ textTransform: "uppercase" }}
            />
          </FinanceField>
          <FinanceField label="Qué surte" optional hint="Una línea, para reconocerlo al cotizar.">
            <input
              value={supplierForm.description}
              onChange={(e) => setSupplierForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Material eléctrico y canalización"
              className={s.input}
            />
          </FinanceField>
          <FinanceField label="Convenio de mayorista" fullWidth optional hint="Márcalo solo si hay condiciones pactadas. Así aparece en la pestaña Mayoristas.">
            <label className={s.opcion} style={{ border: "none", padding: 0, background: "none" }}>
              <input
                type="checkbox"
                checked={supplierForm.esMayorista}
                onChange={(e) => setSupplierForm((f) => ({ ...f, esMayorista: e.target.checked }))}
              />
              Es mayorista con convenio
            </label>
          </FinanceField>
          {supplierForm.esMayorista && (
            <>
              <FinanceField label="Días de crédito" optional hint="Vacío o cero = pago de contado.">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={supplierForm.creditoDias}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, creditoDias: e.target.value }))}
                  className={`${s.input} ${s.num}`}
                />
              </FinanceField>
              <FinanceField label="Límite de crédito" optional hint="Tope de saldo por pagar. La orden avisa antes de pasarse.">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={supplierForm.limiteCredito}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, limiteCredito: e.target.value }))}
                  className={`${s.input} ${s.num}`}
                />
              </FinanceField>
            </>
          )}
        </FinanceFormGrid>
      </Modal>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
