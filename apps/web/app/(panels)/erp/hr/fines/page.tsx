"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useHrManagementGuard } from "@/lib/useHrManagementGuard";
import { buildApiUrl } from "@/lib/api-base";

interface Fine {
  id: number;
  tipo?: string;
  descripcion?: string;
  monto?: number;
  estado?: string;
  fecha?: string;
  aplicaDescuento?: boolean;
  user?: { nombre?: string };
  creadoPor?: { nombre?: string };
}

const TIPOS = ["FALTA_INJUSTIFICADA", "DANO_VEHICULO", "HERRAMIENTA_PERDIDA", "COMPORTAMIENTO", "TARDANZA", "OTRO"];
const ESTADOS = ["PENDIENTE", "APLICADO", "APELADO", "CANCELADO"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { tipo: "TARDANZA", descripcion: "", monto: 0, aplicaDescuento: false, estado: "PENDIENTE" };

export default function FinesPage() {
  const { user } = useUser();
  const cfg = useHrManagementGuard();
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Fine | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("fines", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (f: Fine) => {
    setEditing(f);
    setForm({ tipo: f.tipo ?? "TARDANZA", descripcion: f.descripcion ?? "", monto: f.monto ?? 0, aplicaDescuento: f.aplicaDescuento ?? false, estado: f.estado ?? "PENDIENTE" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`fines/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(f => f.id === editing.id ? { ...f, ...updated } : f));
      } else {
        const created = await apiFetch("fines", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Cancelar/eliminar esta sanción?")) return;
    try {
      await apiFetch(`fines/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(f => f.id !== id));
    } catch { /* skip */ }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const visibleItems = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    if (Number.isNaN(id)) return items;
    return [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  const columns: Column<Fine>[] = [
    { key: "id", label: "ID", render: f => <Tag variant="danger">#{f.id}</Tag>, width: 70 },
    { key: "user", label: "Empleado", render: f => <span style={{ fontWeight: 600, fontSize: 13 }}>{f.user?.nombre ?? "—"}</span>, width: 150 },
    { key: "tipo", label: "Tipo", render: f => <Tag variant="warning">{(f.tipo ?? "—").replace(/_/g, " ")}</Tag>, width: 170 },
    { key: "descripcion", label: "Descripción", render: f => <span style={{ fontSize: 13 }}>{f.descripcion ?? "—"}</span> },
    { key: "monto", label: "Monto", render: f => <Money value={f.monto ?? 0} />, width: 100 },
    { key: "aplicaDescuento", label: "Descuento nómina", render: f => <Tag variant={f.aplicaDescuento ? "danger" : "neutral"}>{f.aplicaDescuento ? "Sí" : "No"}</Tag>, width: 140 },
    { key: "estado", label: "Estado", render: f => <Tag variant={f.estado === "APLICADO" ? "neutral" : f.estado === "CANCELADO" ? "danger" : "warning"}>{f.estado ?? "—"}</Tag>, width: 100 },
    { key: "id", label: "", render: f => (
      <div style={{ display: "flex", gap: 4 }}>
        {cfg.canEdit && <button onClick={() => openEdit(f)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {cfg.canApprove && <button onClick={() => remove(f.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Personas"
        title="Multas e incidencias"
        subtitle="Sanciones administrativas con bitácora: faltas, daño a vehículo, herramienta perdida, comportamiento."
        actions={cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva sanción</Button> : undefined}
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tipo de sanción</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={inp}>
              {TIPOS.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={inp}>
              {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Descripción del hecho</label>
            <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Describe la incidencia con detalle" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monto a descontar ($)</label>
            <input type="number" min={0} value={form.monto} onChange={e => setForm(f => ({ ...f, monto: +e.target.value }))} style={inp} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 22 }}>
            <input type="checkbox" id="descuento" checked={form.aplicaDescuento} onChange={e => setForm(f => ({ ...f, aplicaDescuento: e.target.checked }))} />
            <label htmlFor="descuento" style={{ fontSize: 13, fontWeight: 500 }}>Aplica descuento en nómina</label>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Registrar sanción"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} sanciones`}>
        {highlightId && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando sanción <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={visibleItems} rowKey={f => f.id} emptyTitle="Sin sanciones registradas" emptyDescription="Registra una incidencia cuando sea necesario." />
        )}
      </Section>
    </>
  );
}
