"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface PurchaseOrder {
  id: number;
  folio?: string;
  proveedor?: string;
  concepto?: string;
  montoTotal?: number;
  estado?: string;
  fechaEmision?: string;
  entregaEstimada?: string;
  solicitadoPor?: { nombre?: string };
}

const ESTADOS = ["Solicitada", "Aprobada", "En_transito", "Recibida", "Rechazada"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { proveedor: "", concepto: "", montoTotal: 0, entregaEstimada: "" };

export default function ProcurementPage() {
  const { user } = useUser();
  const { canCreate, canEdit, canDelete, canApprove } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("procurement/purchase-orders", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (o: PurchaseOrder) => {
    setEditing(o);
    setForm({ proveedor: o.proveedor ?? "", concepto: o.concepto ?? "", montoTotal: o.montoTotal ?? 0, entregaEstimada: o.entregaEstimada?.slice(0, 10) ?? "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`procurement/purchase-orders/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(o => o.id === editing.id ? { ...o, ...updated } : o));
      } else {
        const created = await apiFetch("procurement/purchase-orders", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const approve = async (id: number) => {
    if (!token) return;
    try {
      const updated = await apiFetch(`procurement/purchase-orders/${id}/approve`, token, { method: "PATCH" });
      setItems(prev => prev.map(o => o.id === id ? { ...o, ...updated } : o));
    } catch { /* skip */ }
  };

  const cancelOrder = async (id: number) => {
    if (!token || !confirm("¿Cancelar esta orden de compra?")) return;
    try {
      const updated = await apiFetch(`procurement/purchase-orders/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado: "Rechazada" }) });
      setItems(prev => prev.map(o => o.id === id ? { ...o, ...updated } : o));
    } catch { /* skip */ }
  };

  const estadoVariant = (e?: string): "accent" | "warning" | "neutral" | "danger" =>
    e === "Recibida" ? "neutral" : e === "Rechazada" ? "danger" : e === "Aprobada" || e === "En_transito" ? "accent" : "warning";

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const columns: Column<PurchaseOrder>[] = [
    { key: "folio", label: "OC", render: o => <code style={{ fontSize: 11.5 }}>{o.folio ?? `OC-${o.id}`}</code>, width: 130 },
    { key: "proveedor", label: "Proveedor / Concepto", render: o => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{o.proveedor ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{o.concepto?.slice(0, 60)}</div>
      </div>
    )},
    { key: "montoTotal", label: "Monto", render: o => <Money value={o.montoTotal ?? 0} />, width: 120 },
    { key: "entregaEstimada", label: "Entrega est.", accessor: o => o.entregaEstimada ? new Date(o.entregaEstimada).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 100 },
    { key: "estado", label: "Estado", render: o => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={estadoVariant(o.estado)}>{(o.estado ?? "—").replace(/_/g, " ")}</Tag>
        {o.estado === "Solicitada" && canApprove && (
          <button onClick={() => approve(o.id)} style={{ fontSize: 11, background: "#1F5F4E", color: "#fff", border: "none", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>✓ Aprobar</button>
        )}
      </div>
    ), width: 200 },
    { key: "id", label: "", render: o => (
      <div style={{ display: "flex", gap: 4 }}>
        {canEdit && <button onClick={() => openEdit(o)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {canDelete && o.estado !== "Recibida" && <button onClick={() => cancelOrder(o.id)} title="Cancelar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Compras"
        title="Órdenes de compra"
        subtitle="Solicitudes y aprobación de compras a proveedores: material, equipos y servicios."
        actions={canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva OC</Button> : undefined}
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Proveedor</label>
            <input value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} placeholder="Nombre del proveedor" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Concepto</label>
            <input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} placeholder="Descripción de lo que se compra" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monto total ($)</label>
            <input type="number" min={0} value={form.montoTotal} onChange={e => setForm(f => ({ ...f, montoTotal: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Entrega estimada</label>
            <input type="date" value={form.entregaEstimada} onChange={e => setForm(f => ({ ...f, entregaEstimada: e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear OC"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} órdenes`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={o => o.id} emptyTitle="Sin órdenes de compra" emptyDescription="Crea la primera orden de compra." />
        )}
      </Section>
    </>
  );
}
