"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getErpInventorySectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

type ProcTab = "orders" | "requisitions" | "receipts";

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

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
        const data = await apiFetch("procurement/purchase-orders", token);
        setOrders(Array.isArray(data) ? data : (data.data ?? []));
      } else if (tab === "requisitions") {
        const data = await apiFetch("procurement/requisitions", token);
        setRequisitions(Array.isArray(data) ? data : (data.data ?? []));
      } else {
        const qs = poId ? `?purchaseOrderId=${poId}` : "";
        const data = await apiFetch(`procurement/goods-receipts${qs}`, token);
        setReceipts(Array.isArray(data) ? data : (data.data ?? []));
      }
    } catch {
      /* skip */
    } finally {
      setLoading(false);
    }
  }, [token, tab, poId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleOrders = useMemo(() => sortHighlight(orders, highlightId), [orders, highlightId]);
  const visibleReqs = useMemo(() => sortHighlight(requisitions, highlightId), [requisitions, highlightId]);
  const visibleReceipts = useMemo(() => {
    let rows = receipts;
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = rows.filter((r) => r.id === id);
    }
    return rows;
  }, [receipts, highlightId]);

  const approvePo = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`procurement/purchase-orders/${id}/approve`, token, { method: "PATCH" });
      void load();
    } catch {
      /* skip */
    }
  };

  const approveReq = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`procurement/requisitions/${id}/approve`, token, { method: "PATCH" });
      void load();
    } catch {
      /* skip */
    }
  };

  const orderColumns: Column<PurchaseOrder>[] = [
    { key: "poNumber", label: "OC", render: (o) => <code style={{ fontSize: 11.5 }}>{o.poNumber}</code>, width: 130 },
    {
      key: "supplier",
      label: "Proveedor",
      render: (o) => <span style={{ fontWeight: 600, fontSize: 13 }}>{o.supplier?.name ?? "—"}</span>,
    },
    { key: "totalAmount", label: "Monto", render: (o) => <Money value={Number(o.totalAmount)} />, width: 120 },
    {
      key: "expectedDate",
      label: "Entrega est.",
      accessor: (o) => (o.expectedDate ? new Date(o.expectedDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"),
      width: 100,
    },
    {
      key: "status",
      label: "Estado",
      render: (o) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Tag variant={o.status === "RECEIVED" ? "neutral" : o.status === "CANCELLED" ? "danger" : "accent"}>
            {PO_STATUS[o.status] ?? o.status}
          </Tag>
          {o.status === "DRAFT" && cfg.canApprove && (
            <button onClick={() => void approvePo(o.id)} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>
              ✓
            </button>
          )}
        </div>
      ),
      width: 160,
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
    { key: "priority", label: "Prioridad", render: (r) => <Tag variant="neutral">{r.priority ?? "NORMAL"}</Tag>, width: 100 },
    {
      key: "status",
      label: "Estado",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Tag variant={r.status === "APPROVED" ? "neutral" : r.status === "REJECTED" ? "danger" : "warning"}>
            {REQ_STATUS[r.status] ?? r.status}
          </Tag>
          {r.status === "PENDING" && cfg.canApprove && (
            <button onClick={() => void approveReq(r.id)} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>
              ✓
            </button>
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 14px",
    borderRadius: 8,
    border: active ? "1px solid var(--primary)" : "1px solid var(--border)",
    background: active ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--surface)",
    color: active ? "var(--primary)" : "var(--text-secondary)",
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    cursor: "pointer",
  });

  return (
    <>
      <PageHeader
        eyebrow="ERP · Compras"
        title="Compras y abastecimiento"
        subtitle="Requisiciones, órdenes de compra y recepciones de mercancía."
        actions={<Button variant="ghost" onClick={() => void load()}>Actualizar</Button>}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" style={tabStyle(tab === "requisitions")} onClick={() => setTab("requisitions")}>
          Requisiciones
        </button>
        <button type="button" style={tabStyle(tab === "orders")} onClick={() => setTab("orders")}>
          Órdenes de compra
        </button>
        <button type="button" style={tabStyle(tab === "receipts")} onClick={() => setTab("receipts")}>
          Recepciones
        </button>
      </div>

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

      <Section
        title={
          loading
            ? "Cargando…"
            : tab === "orders"
              ? `${visibleOrders.length} órdenes`
              : tab === "requisitions"
                ? `${visibleReqs.length} requisiciones`
                : `${visibleReceipts.length} recepciones`
        }
      >
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : tab === "orders" ? (
          <DataTable columns={orderColumns} rows={visibleOrders} rowKey={(o) => o.id} emptyTitle="Sin órdenes" emptyDescription="Las OC se generan desde requisiciones aprobadas." />
        ) : tab === "requisitions" ? (
          <DataTable columns={reqColumns} rows={visibleReqs} rowKey={(r) => r.id} emptyTitle="Sin requisiciones" emptyDescription="No hay solicitudes de compra pendientes." />
        ) : (
          <DataTable columns={receiptColumns} rows={visibleReceipts} rowKey={(r) => r.id} emptyTitle="Sin recepciones" emptyDescription="Registra la entrada de mercancía contra una OC." />
        )}
      </Section>
    </>
  );
}
