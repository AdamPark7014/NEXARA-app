"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface SalesProject {
  id: number;
  nombre?: string;
  descripcion?: string;
  estado?: string;
  montoContrato?: number;
  margenEstimado?: number;
  fechaInicio?: string;
  fechaEntrega?: string;
  cliente?: { razonSocial?: string };
  responsable?: { nombre?: string };
}

const ESTADOS = ["ACTIVO", "EN_EJECUCION", "COMPLETADO", "PAUSADO", "CANCELADO"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { nombre: "", descripcion: "", estado: "ACTIVO", montoContrato: 0, fechaInicio: "", fechaEntrega: "" };

export default function CrmProjectsPage() {
  const { user } = useUser();
  const { canCreate, canEdit } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<SalesProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesProject | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("ventas/proyectos", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (p: SalesProject) => {
    setEditing(p);
    setForm({ nombre: p.nombre ?? "", descripcion: p.descripcion ?? "", estado: p.estado ?? "ACTIVO", montoContrato: p.montoContrato ?? 0, fechaInicio: p.fechaInicio?.slice(0, 10) ?? "", fechaEntrega: p.fechaEntrega?.slice(0, 10) ?? "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`ventas/proyectos/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(p => p.id === editing.id ? { ...p, ...updated } : p));
      } else {
        const created = await apiFetch("ventas/proyectos", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const totalContrato = items.reduce((s, p) => s + (p.montoContrato ?? 0), 0);
  const activos = items.filter(p => p.estado === "EN_EJECUCION" || p.estado === "ACTIVO").length;

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const statusVariant = (s?: string): "accent" | "warning" | "neutral" | "danger" =>
    s === "COMPLETADO" ? "neutral" : s === "CANCELADO" ? "danger" : s === "EN_EJECUCION" ? "accent" : "warning";

  const columns: Column<SalesProject>[] = [
    { key: "nombre", label: "Proyecto", render: p => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nombre ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.cliente?.razonSocial ?? p.responsable?.nombre}</div>
      </div>
    )},
    { key: "montoContrato", label: "Contrato", render: p => <Money value={p.montoContrato ?? 0} />, width: 120 },
    { key: "fechaInicio", label: "Inicio", accessor: p => p.fechaInicio ? new Date(p.fechaInicio).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "fechaEntrega", label: "Entrega", accessor: p => p.fechaEntrega ? new Date(p.fechaEntrega).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "estado", label: "Estado", render: p => <Tag variant={statusVariant(p.estado)}>{(p.estado ?? "—").replace(/_/g, " ")}</Tag>, width: 120 },
    { key: "id", label: "", render: p => (
      canEdit ? <button onClick={() => openEdit(p)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 8px" }}>✎</button> : null
    ), width: 40 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Proyectos"
        title="Proyectos comerciales"
        subtitle="Venta ganada → proyecto con contrato, entregables, costo y facturación."
        actions={canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo proyecto</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Proyectos activos" value={activos} />
        <KpiCard label="Valor total contratos" value={`$${(totalContrato / 1000000).toFixed(1)}M`} />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nombre del proyecto</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Proyecto UDLA Cholula — Fase 1" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Descripción</label>
            <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Alcance del proyecto" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={inp}>
              {ESTADOS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monto contrato ($)</label>
            <input type="number" min={0} value={form.montoContrato} onChange={e => setForm(f => ({ ...f, montoContrato: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha inicio</label>
            <input type="date" value={form.fechaInicio} onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha entrega</label>
            <input type="date" value={form.fechaEntrega} onChange={e => setForm(f => ({ ...f, fechaEntrega: e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear proyecto"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} proyectos`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={p => p.id} emptyTitle="Sin proyectos" emptyDescription="Los proyectos se crean desde una oportunidad ganada." />
        )}
      </Section>
    </>
  );
}
