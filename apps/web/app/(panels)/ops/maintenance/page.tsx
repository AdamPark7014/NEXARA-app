"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { canAccessMaintenanceContracts, getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";

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
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "maintenance"), [user]);
  const showContracts = useMemo(() => canAccessMaintenanceContracts(user), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("maintenance/work-orders", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar ordenes de mantenimiento");
    } finally { setLoading(false); }
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
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Error al guardar OT"); }
  };

  const remove = async (id: number) => {
    if (!token) return;
    setConfirmState({ message: "¿Cancelar esta OT de mantenimiento?", confirmLabel: "Cancelar OT", fn: async () => {
    try {
      await apiFetch(`maintenance/work-orders/${id}`, token, { method: "PATCH", body: JSON.stringify({ status: "CANCELADA" }) });
      setItems(prev => prev.filter(w => w.id !== id));
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Error al cancelar OT"); }
  } });
  };

  const patchStatus = async (id: number, action: "start" | "complete") => {
    if (!token) return;
    try {
      const updated = await apiFetch(`maintenance/work-orders/${id}/${action}`, token, { method: "PATCH" });
      setItems(prev => prev.map(w => w.id === id ? { ...w, ...updated } : w));
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Error al actualizar estado"); }
  };

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((w) => ((w.title ?? "") + " " + (w.asset?.name ?? "") + " " + (w.description ?? "")).toLowerCase().includes(q));
    }
    if (filterStatus) rows = rows.filter((w) => w.status === filterStatus);
    if (filterPriority) rows = rows.filter((w) => w.priority === filterPriority);
    return rows;
  }, [items, searchQ, filterStatus, filterPriority]);

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
    {
      key: "scheduledAt", label: "Programada",
      render: (w) => {
        if (!w.scheduledAt) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const daysLeft = Math.ceil((new Date(w.scheduledAt).getTime() - Date.now()) / 86400000);
        const isOpen = w.status === "PENDIENTE" || w.status === "EN_PROGRESO";
        const color = !isOpen ? "var(--text-tertiary)" : daysLeft < 0 ? "var(--danger)" : daysLeft <= 3 ? "var(--danger)" : daysLeft <= 7 ? "var(--warning)" : "var(--text-secondary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color }}>{new Date(w.scheduledAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
            {isOpen && <span style={{ fontSize: 10.5, fontWeight: daysLeft <= 7 ? 700 : 400, color }}>{daysLeft < 0 ? "VENCIDA" : `${daysLeft}d`}</span>}
          </div>
        );
      },
      width: 100,
    },
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
        {cfg.canEdit && <button onClick={() => openEdit(w)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {cfg.canDelete && <button onClick={() => remove(w.id)} title="Cancelar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Mantenimiento"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {showContracts && (
              <Link href="/ops/maintenance/contracts">
                <Button variant="ghost">Contratos de servicio</Button>
              </Link>
            )}
            {cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva OT</Button> : undefined}
          </div>
        }
      />

      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{actionErr}</span>
          <button type="button" onClick={() => setActionErr(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}
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

      {!loading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
            <KpiCard label="Pendientes" value={items.filter(w => w.status === "PENDIENTE").length} variant="warning" icon="⏳" />
            <KpiCard label="En progreso" value={items.filter(w => w.status === "EN_PROGRESO").length} variant="accent" icon="🔧" />
            <KpiCard label="Completadas" value={items.filter(w => w.status === "COMPLETADA").length} icon="✅" />
            <KpiCard label="Criticas" value={items.filter(w => w.priority === "CRITICA").length} variant={items.filter(w => w.priority === "CRITICA").length > 0 ? "danger" : "default"} icon="🚨" />
            <KpiCard label="Costo estimado total" value={new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(items.reduce((s, w) => s + (w.estimatedCost ?? 0), 0))} icon="💰" />
          </div>
          {items.length > 0 && (() => {
            const total = items.filter(w => w.status !== "CANCELADA").length;
            const completadas = items.filter(w => w.status === "COMPLETADA").length;
            const enProg = items.filter(w => w.status === "EN_PROGRESO").length;
            const pct = total > 0 ? Math.round((completadas / total) * 100) : 0;
            return (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Avance general de OTs</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 80 ? "var(--success)" : "var(--text-secondary)" }}>{pct}% completado</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: "var(--surface)", overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", height: "100%", width: `${total > 0 ? ((completadas + enProg) / total) * 100 : 0}%`, background: "color-mix(in srgb, var(--primary) 40%, transparent)", borderRadius: 4 }} />
                  <div style={{ position: "absolute", height: "100%", width: `${pct}%`, background: pct >= 80 ? "var(--success)" : "var(--primary)", borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>✅ {completadas} completadas</span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>🔧 {enProg} en progreso</span>
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>⏳ {items.filter(w => w.status === "PENDIENTE").length} pendientes</span>
                </div>
              </div>
            );
          })()}
        </>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por título, activo o descripción…" }}
        selects={[
          {
            label: "Estado",
            value: filterStatus,
            onChange: setFilterStatus,
            options: STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
            allowAll: true,
          },
          {
            label: "Prioridad",
            value: filterPriority,
            onChange: setFilterPriority,
            options: PRIORITIES.map((p) => ({ value: p, label: p })),
            allowAll: true,
          },
        ]}
        onClear={() => { setSearchQ(""); setFilterStatus(""); setFilterPriority(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "id", label: "ID" },
            { key: "title", label: "Trabajo" },
            { key: "priority", label: "Prioridad" },
            { key: "status", label: "Estado" },
            { key: "estimatedCost", label: "Costo est." },
            { key: "scheduledAt", label: "Programada", format: (v) => v ? String(v).slice(0, 10) : "" },
          ], "mantenimiento-ots")}>Excel</Button>
        ) : undefined}
      />

      <Section title={loading ? "Cargando…" : `${items.length} ordenes`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando ordenes de mantenimiento." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && (
          <DataTable
            columns={columns}
            rows={visibleItems}
            rowKey={w => w.id}
            emptyTitle="Sin ordenes de mantenimiento"
            emptyDescription="Crea la primera orden de trabajo para programar preventivos o correctivos."
            emptyAction={cfg.canCreate ? <Button size="sm" variant="primary" onClick={openNew}>Nueva OT</Button> : undefined}
          />
        )}
      </Section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
