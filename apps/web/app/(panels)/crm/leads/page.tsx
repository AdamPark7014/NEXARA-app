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

interface Lead {
  id: number;
  empresa?: string;
  contacto?: string;
  email?: string;
  telefono?: string;
  fuente?: string;
  interes?: string;
  potencial?: number;
  estado?: string;
  asignadoA?: string;
  creadoEn?: string;
}

const ESTADOS = ["Nuevo", "Contactado", "Calificado", "Descartado"];
const FUENTES = ["Web", "Referido", "LinkedIn", "Llamada", "Feria"];
const INTERESES = ["CCTV", "Redes", "Cómputo", "Mantenimiento", "Multiple"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { empresa: "", contacto: "", email: "", telefono: "", fuente: "Web", interes: "CCTV", potencial: 0, estado: "Nuevo" };

export default function LeadsPage() {
  const { user } = useUser();
  const { canCreate, canEdit, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("ventas/leads", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (l: Lead) => {
    setEditing(l);
    setForm({ empresa: l.empresa ?? "", contacto: l.contacto ?? "", email: l.email ?? "", telefono: l.telefono ?? "", fuente: l.fuente ?? "Web", interes: l.interes ?? "CCTV", potencial: l.potencial ?? 0, estado: l.estado ?? "Nuevo" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`ventas/leads/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(l => l.id === editing.id ? { ...l, ...updated } : l));
      } else {
        const created = await apiFetch("ventas/leads", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar este lead?")) return;
    try {
      await apiFetch(`ventas/leads/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(l => l.id !== id));
    } catch { /* skip */ }
  };

  const patchEstado = async (id: number, estado: string) => {
    if (!token) return;
    try {
      await apiFetch(`ventas/leads/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado }) });
      setItems(prev => prev.map(l => l.id === id ? { ...l, estado } : l));
    } catch { /* skip */ }
  };

  const nuevos = items.filter(l => l.estado === "Nuevo").length;
  const calificados = items.filter(l => l.estado === "Calificado").length;
  const pipeline = items.filter(l => l.estado !== "Descartado").reduce((s, l) => s + (l.potencial ?? 0), 0);

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const columns: Column<Lead>[] = [
    { key: "empresa", label: "Empresa / Contacto", render: l => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{l.empresa ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{l.contacto} · {l.telefono}</div>
      </div>
    )},
    { key: "fuente", label: "Fuente", render: l => <Tag variant="neutral">{l.fuente ?? "—"}</Tag>, width: 100 },
    { key: "interes", label: "Interés", render: l => <Tag variant="accent">{l.interes ?? "—"}</Tag>, width: 120 },
    { key: "potencial", label: "Potencial", render: l => <Money value={l.potencial ?? 0} />, width: 110 },
    { key: "estado", label: "Estado", render: l => (
      <select value={l.estado ?? "Nuevo"} onChange={e => patchEstado(l.id, e.target.value)}
        style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 6px", background: "var(--surface)", color: "var(--foreground)", cursor: "pointer" }}>
        {ESTADOS.map(s => <option key={s}>{s}</option>)}
      </select>
    ), width: 140 },
    { key: "creadoEn", label: "Capturado", accessor: l => l.creadoEn ? new Date(l.creadoEn).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 90 },
    { key: "id", label: "", render: l => (
      <div style={{ display: "flex", gap: 4 }}>
        {canEdit && <button onClick={() => openEdit(l)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {canDelete && <button onClick={() => remove(l.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Captación"
        title="Leads"
        subtitle="Prospectos entrantes por todos los canales. Aquí se califican y convierten en oportunidades."
        actions={canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo lead</Button> : undefined}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Nuevos" value={nuevos} />
        <KpiCard label="Calificados" value={calificados} />
        <KpiCard label="Pipeline total" value={`$${(pipeline / 1000000).toFixed(1)}M`} />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Empresa", key: "empresa", ph: "Nombre de la empresa" },
            { label: "Contacto", key: "contacto", ph: "Nombre del contacto" },
            { label: "Email", key: "email", ph: "correo@empresa.com" },
            { label: "Teléfono", key: "telefono", ph: "222 555 1234" },
          ].map(({ label, key, ph }) => (
            <div key={key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
              <input value={(form as Record<string, string | number>)[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inp} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Fuente</label>
            <select value={form.fuente} onChange={e => setForm(f => ({ ...f, fuente: e.target.value }))} style={inp}>
              {FUENTES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Interés</label>
            <select value={form.interes} onChange={e => setForm(f => ({ ...f, interes: e.target.value }))} style={inp}>
              {INTERESES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Potencial ($)</label>
            <input type="number" min={0} value={form.potencial} onChange={e => setForm(f => ({ ...f, potencial: +e.target.value }))} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={inp}>
              {ESTADOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear lead"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} leads`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={l => l.id} emptyTitle="Sin leads" emptyDescription="Agrega el primer lead." />
        )}
      </Section>
    </>
  );
}
