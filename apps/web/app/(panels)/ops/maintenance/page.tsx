"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface WorkOrder {
  id: number;
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  scheduledAt?: string;
  completedAt?: string;
  asset?: { name?: string };
  assignedTo?: { nombre?: string };
  estimatedCost?: number;
}

const STATUSES = ["PENDIENTE", "EN_PROGRESO", "COMPLETADA", "CANCELADA"];
const PRIORITIES = ["BAJA", "MEDIA", "ALTA", "CRITICA"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { title: "", description: "", priority: "MEDIA", status: "PENDIENTE", scheduledAt: "", estimatedCost: 0 };

export default function MaintenancePage() {
  const { user } = useUser();
  const { canCreate, canEdit, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("maintenance/work-orders", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (w: WorkOrder) => {
    setEditing(w);
    setForm({ title: w.title ?? "", description: w.description ?? "", priority: w.priority ?? "MEDIA", status: w.status ?? "PENDIENTE", scheduledAt: w.scheduledAt?.slice(0, 16) ?? "", estimatedCost: w.estimatedCost ?? 0 });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`maintenance/work-orders/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(w => w.id === editing.id ? { ...w, ...updated } : w));
      } else {
        const created = await apiFetch("maintenance/work-orders", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar esta OT de mantenimiento?")) return;
    try {
      await apiFetch(`maintenance/work-orders/${id}`, token, { method: "PATCH", body: JSON.stringify({ status: "CANCELADA" }) });
      setItems(prev => prev.filter(w => w.id !== id));
    } catch { /* skip */ }
  };

  const patchStatus = async (id: number, action: "start" | "complete") => {
    if (!token) return;
    try {
      const updated = await apiFetch(`maintenance/work-orders/${id}/${action}`, token, { method: "PATCH" });
      setItems(prev => prev.map(w => w.id === id ? { ...w, ...updated } : w));
    } catch { /* skip */ }
  };

  const statusVariant = (s?: string): "accent" | "warning" | "neutral" | "danger" =>
    s === "COMPLETADA" ? "neutral" : s === "EN_PROGRESO" ? "accent" : s === "CANCELADA" ? "danger" : "warning";

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const columns: Column<WorkOrder>[] = [
    { key: "id", label: "ID", render: w => <Tag variant="accent">OT-{w.id}</Tag>, width: 80 },
    { key: "title", label: "Trabajo", render: w => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{w.title ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{w.asset?.name ?? w.description?.slice(0, 50)}</div>
      </div>
    )},
    { key: "priority", label: "Prioridad", render: w => <Tag variant={w.priority === "CRITICA" ? "danger" : w.priority === "ALTA" ? "warning" : "neutral"}>{w.priority ?? "—"}</Tag>, width: 90 },
    { key: "scheduledAt", label: "Programada", accessor: w => w.scheduledAt ? new Date(w.scheduledAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 100 },
    { key: "estimatedCost", label: "Costo est.", render: w => <Money value={w.estimatedCost ?? 0} />, width: 110 },
    { key: "status", label: "Estado", render: w => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Tag variant={statusVariant(w.status)}>{(w.status ?? "—").replace(/_/g, " ")}</Tag>
        {w.status === "PENDIENTE" && (
          <button onClick={() => patchStatus(w.id, "start")} style={{ fontSize: 10, background: "var(--primary)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>▶ Iniciar</button>
        )}
        {w.status === "EN_PROGRESO" && (
          <button onClick={() => patchStatus(w.id, "complete")} style={{ fontSize: 10, background: "var(--success, #1F5F4E)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>✓ Completar</button>
        )}
      </div>
    ), width: 200 },
    { key: "id", label: "", render: w => (
      <div style={{ display: "flex", gap: 4 }}>
        {canEdit && <button onClick={() => openEdit(w)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {canDelete && <button onClick={() => remove(w.id)} title="Cancelar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Mantenimiento"
        title="Órdenes de mantenimiento"
        subtitle="Correctivo, preventivo y predictivo de activos: equipos, vehículos e instalaciones."
        actions={canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva OT</Button> : undefined}
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Título</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Cambio de aceite, revisión eléctrica…" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Descripción</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalle del trabajo" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Prioridad</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inp}>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fecha programada</label>
            <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Costo estimado ($)</label>
            <input type="number" min={0} value={form.estimatedCost} onChange={e => setForm(f => ({ ...f, estimatedCost: +e.target.value }))} style={inp} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear OT"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} órdenes`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={w => w.id} emptyTitle="Sin órdenes de mantenimiento" emptyDescription="Crea la primera orden de trabajo." />
        )}
      </Section>
    </>
  );
}
