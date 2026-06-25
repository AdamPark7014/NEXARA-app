"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getOpsTeamSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

interface ToolRequest {
  id: number;
  herramienta?: string;
  cantidad?: number;
  estado?: string;
  solicitante?: string;
  fechaSolicitud?: string;
  observaciones?: string;
  tipo?: string;
}

const ESTADOS = ["Pendiente", "Aprobado", "Entregado", "Devuelto", "Rechazado"];
const TIPOS = ["Préstamo", "Consumible", "Reposición"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { herramienta: "", cantidad: 1, tipo: "Préstamo", observaciones: "", estado: "Pendiente" };

export default function ToolsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getOpsTeamSectionConfig(user, "tools"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<ToolRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ToolRequest | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("tool-requests", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (t: ToolRequest) => {
    setEditing(t);
    setForm({ herramienta: t.herramienta ?? "", cantidad: t.cantidad ?? 1, tipo: t.tipo ?? "Préstamo", observaciones: t.observaciones ?? "", estado: t.estado ?? "Pendiente" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`tool-requests/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(t => t.id === editing.id ? { ...t, ...updated } : t));
      } else {
        const created = await apiFetch("tool-requests", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar esta solicitud?")) return;
    try {
      await apiFetch(`tool-requests/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado: "Rechazado" }) });
      setItems(prev => prev.filter(t => t.id !== id));
    } catch { /* skip */ }
  };

  const patchEstado = async (id: number, estado: string) => {
    if (!token) return;
    try {
      await apiFetch(`tool-requests/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado }) });
      setItems(prev => prev.map(t => t.id === id ? { ...t, estado } : t));
    } catch { /* skip */ }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const visibleItems = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    if (Number.isNaN(id)) return items;
    return [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  const columns: Column<ToolRequest>[] = [
    { key: "id", label: "ID", render: t => <Tag variant="accent">#{t.id}</Tag>, width: 70 },
    { key: "herramienta", label: "Herramienta / Kit", render: t => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{t.herramienta ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.tipo} · cant. {t.cantidad}</div>
      </div>
    )},
    { key: "solicitante", label: "Solicitante", accessor: t => t.solicitante ?? "—", width: 140 },
    { key: "fechaSolicitud", label: "Fecha", accessor: t => t.fechaSolicitud ? new Date(t.fechaSolicitud).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "estado", label: "Estado", render: t => (
      <select value={t.estado ?? "Pendiente"} onChange={e => patchEstado(t.id, e.target.value)}
        style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)", cursor: "pointer" }}>
        {ESTADOS.map(s => <option key={s}>{s}</option>)}
      </select>
    ), width: 140 },
    { key: "id", label: "", render: t => (
      <div style={{ display: "flex", gap: 4 }}>
        {cfg.canEdit && <button onClick={() => openEdit(t)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {cfg.canDelete && <button onClick={() => remove(t.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Campo"
        title="Herramientas y kits"
        subtitle="Préstamo y devolución de equipo de trabajo: probadores, taladros, escaleras, equipo de altura."
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva solicitud</Button> : undefined}
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Herramienta / Kit</label>
            <input value={form.herramienta} onChange={e => setForm(f => ({ ...f, herramienta: e.target.value }))} placeholder='Kit "Instalación CCTV", Taladro, Escalera…' style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tipo</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={inp}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Cantidad</label>
            <input type="number" min={1} value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: +e.target.value }))} style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Observaciones</label>
            <input value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} placeholder="Notas adicionales" style={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Solicitar"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} solicitudes`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando solicitud <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={visibleItems} rowKey={t => t.id} emptyTitle="Sin solicitudes" emptyDescription="Crea la primera solicitud de herramienta o kit." />
        )}
      </Section>
    </>
  );
}
