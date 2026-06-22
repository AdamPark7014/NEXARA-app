"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface Project {
  id: number;
  nombre?: string;
  descripcion?: string;
  estado?: string;
  fechaInicio?: string;
  fechaFin?: string;
  presupuesto?: number;
  costoReal?: number;
  cliente?: { razonSocial?: string };
  lider?: { nombre?: string };
}

const ESTADOS = ["PLANEACION", "EN_EJECUCION", "PAUSADO", "COMPLETADO", "CANCELADO"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { nombre: "", descripcion: "", estado: "PLANEACION", fechaInicio: "", fechaFin: "", presupuesto: 0 };

export default function OpsProjectsPage() {
  const { user } = useUser();
  const { canCreate, canEdit, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("projects", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({ nombre: p.nombre ?? "", descripcion: p.descripcion ?? "", estado: p.estado ?? "PLANEACION", fechaInicio: p.fechaInicio?.slice(0, 10) ?? "", fechaFin: p.fechaFin?.slice(0, 10) ?? "", presupuesto: p.presupuesto ?? 0 });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`projects/${editing.id}`, token, { method: "PUT", body: JSON.stringify(form) });
        setItems(prev => prev.map(p => p.id === editing.id ? { ...p, ...updated } : p));
      } else {
        const created = await apiFetch("projects", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar este proyecto?")) return;
    try {
      await apiFetch(`projects/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(p => p.id !== id));
    } catch { /* skip */ }
  };

  const statusVariant = (s?: string): "accent" | "warning" | "neutral" | "danger" =>
    s === "COMPLETADO" ? "neutral" : s === "EN_EJECUCION" ? "accent" : s === "CANCELADO" ? "danger" : "warning";

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const columns: Column<Project>[] = [
    { key: "nombre", label: "Proyecto", render: p => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nombre ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.cliente?.razonSocial ?? p.descripcion?.slice(0, 50)}</div>
      </div>
    )},
    { key: "lider", label: "Líder", accessor: p => p.lider?.nombre ?? "—", width: 130 },
    { key: "fechaInicio", label: "Inicio", accessor: p => p.fechaInicio ? new Date(p.fechaInicio).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" }) : "—", width: 90 },
    { key: "fechaFin", label: "Fin", accessor: p => p.fechaFin ? new Date(p.fechaFin).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" }) : "—", width: 90 },
    { key: "presupuesto", label: "Presupuesto", render: p => <Money value={p.presupuesto ?? 0} />, width: 120 },
    { key: "estado", label: "Estado", render: p => <Tag variant={statusVariant(p.estado)}>{(p.estado ?? "—").replace(/_/g, " ")}</Tag>, width: 120 },
    { key: "id", label: "", render: p => (
      <div style={{ display: "flex", gap: 4 }}>
        {canEdit && <button onClick={() => openEdit(p)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {canDelete && <button onClick={() => remove(p.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Proyectos"
        title="Proyectos operativos"
        subtitle="Venta ganada convertida en proyecto: alcance, cuadrilla, calendario y presupuesto."
        actions={canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo proyecto</Button> : undefined}
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nombre del proyecto</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Instalación CCTV Hotel Camino Real…" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Descripción</label>
            <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Alcance y entregables" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={inp}>
              {ESTADOS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Presupuesto ($)</label>
            <input type="number" min={0} value={form.presupuesto} onChange={e => setForm(f => ({ ...f, presupuesto: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha inicio</label>
            <input type="date" value={form.fechaInicio} onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha fin</label>
            <input type="date" value={form.fechaFin} onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value }))} style={inp} />
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
          <DataTable columns={columns} rows={items} rowKey={p => p.id} emptyTitle="Sin proyectos" emptyDescription="Crea el primer proyecto operativo." />
        )}
      </Section>
    </>
  );
}
