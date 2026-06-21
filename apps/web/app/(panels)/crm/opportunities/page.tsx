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

interface Opportunity {
  id: number;
  nombre?: string;
  concepto?: string;
  monto?: number;
  probabilidad?: number;
  etapa?: string;
  cierreEsperado?: string;
  estado?: string;
  cliente?: { razonSocial?: string };
  owner?: { nombre?: string };
}

const ETAPAS = ["Discovery", "Calificado", "Cotización", "Negociación", "Cierre", "Ganado", "Perdido"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { nombre: "", concepto: "", monto: 0, probabilidad: 20, etapa: "Discovery", cierreEsperado: "" };

export default function OpportunitiesPage() {
  const { user } = useUser();
  const { canCreate, canEdit, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Opportunity | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("ventas/oportunidades", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (o: Opportunity) => {
    setEditing(o);
    setForm({ nombre: o.nombre ?? "", concepto: o.concepto ?? "", monto: o.monto ?? 0, probabilidad: o.probabilidad ?? 20, etapa: o.etapa ?? "Discovery", cierreEsperado: o.cierreEsperado?.slice(0, 10) ?? "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`ventas/oportunidades/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(o => o.id === editing.id ? { ...o, ...updated } : o));
      } else {
        const created = await apiFetch("ventas/oportunidades", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar esta oportunidad?")) return;
    try {
      await apiFetch(`ventas/oportunidades/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(o => o.id !== id));
    } catch { /* skip */ }
  };

  const patchEtapa = async (id: number, etapa: string) => {
    if (!token) return;
    try {
      await apiFetch(`ventas/oportunidades/${id}`, token, { method: "PATCH", body: JSON.stringify({ etapa }) });
      setItems(prev => prev.map(o => o.id === id ? { ...o, etapa } : o));
    } catch { /* skip */ }
  };

  const pipelineTotal = items.filter(o => o.etapa !== "Perdido").reduce((s, o) => s + (o.monto ?? 0), 0);
  const weighted = items.filter(o => o.etapa !== "Perdido").reduce((s, o) => s + (o.monto ?? 0) * ((o.probabilidad ?? 0) / 100), 0);
  const enCierre = items.filter(o => ["Negociación", "Cierre"].includes(o.etapa ?? "")).length;

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const etapaVariant = (e?: string): "accent" | "warning" | "neutral" | "danger" =>
    e === "Ganado" ? "neutral" : e === "Perdido" ? "danger" : ["Negociación", "Cierre"].includes(e ?? "") ? "accent" : "warning";

  const columns: Column<Opportunity>[] = [
    { key: "nombre", label: "Oportunidad", render: o => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{o.nombre ?? o.concepto ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{o.cliente?.razonSocial ?? o.owner?.nombre}</div>
      </div>
    )},
    { key: "monto", label: "Monto", render: o => <Money value={o.monto ?? 0} />, width: 120 },
    { key: "probabilidad", label: "Prob.", accessor: o => `${o.probabilidad ?? 0}%`, width: 70 },
    { key: "etapa", label: "Etapa", render: o => (
      <select value={o.etapa ?? "Discovery"} onChange={e => patchEtapa(o.id, e.target.value)}
        style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)", cursor: "pointer" }}>
        {ETAPAS.map(s => <option key={s}>{s}</option>)}
      </select>
    ), width: 140 },
    { key: "cierreEsperado", label: "Cierre est.", accessor: o => o.cierreEsperado ? new Date(o.cierreEsperado).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "id", label: "", render: o => (
      <div style={{ display: "flex", gap: 4 }}>
        {canEdit && <button onClick={() => openEdit(o)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {canDelete && <button onClick={() => remove(o.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Pipeline"
        title="Oportunidades"
        subtitle="Pipeline de ventas activo: Discovery → Calificado → Cotización → Negociación → Cierre."
        actions={canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva oportunidad</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Pipeline total" value={`$${(pipelineTotal / 1000000).toFixed(1)}M`} />
        <KpiCard label="Ponderado" value={`$${(weighted / 1000000).toFixed(1)}M`} />
        <KpiCard label="En cierre" value={enCierre} />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nombre</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre de la oportunidad" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Concepto</label>
            <input value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} placeholder="Descripción del servicio o producto" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monto ($)</label>
            <input type="number" min={0} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Probabilidad (%)</label>
            <input type="number" min={0} max={100} value={form.probabilidad} onChange={e => setForm(f => ({ ...f, probabilidad: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Etapa</label>
            <select value={form.etapa} onChange={e => setForm(f => ({ ...f, etapa: e.target.value }))} style={inp}>
              {ETAPAS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Cierre esperado</label>
            <input type="date" value={form.cierreEsperado} onChange={e => setForm(f => ({ ...f, cierreEsperado: e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear oportunidad"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} oportunidades`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={o => o.id} emptyTitle="Sin oportunidades" emptyDescription="Agrega la primera oportunidad al pipeline." />
        )}
      </Section>
    </>
  );
}
