"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface ServiceClient {
  id: number;
  nombre?: string;
  contacto?: string;
  telefono?: string;
  direccion?: string;
  tipo?: string;
  estado?: string;
  contrato?: string;
  proximaVisita?: string;
}

const ESTADOS = ["Activo", "Inactivo", "Suspendido"];
const TIPOS = ["Corporativo", "Gobierno", "PyME", "Hogar"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { nombre: "", contacto: "", telefono: "", direccion: "", tipo: "Corporativo", estado: "Activo" };

export default function ServiceClientsPage() {
  const { user } = useUser();
  const { canCreate, canEdit, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<ServiceClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ServiceClient | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("service-clients", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (c: ServiceClient) => {
    setEditing(c);
    setForm({ nombre: c.nombre ?? "", contacto: c.contacto ?? "", telefono: c.telefono ?? "", direccion: c.direccion ?? "", tipo: c.tipo ?? "Corporativo", estado: c.estado ?? "Activo" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`service-clients/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
        setItems(prev => prev.map(c => c.id === editing.id ? { ...c, ...updated } : c));
      } else {
        const created = await apiFetch("service-clients", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Dar de baja este cliente?")) return;
    try {
      await apiFetch(`service-clients/${id}`, token, { method: "PATCH", body: JSON.stringify({ estado: "Inactivo" }) });
      setItems(prev => prev.filter(c => c.id !== id));
    } catch { /* skip */ }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const columns: Column<ServiceClient>[] = [
    { key: "nombre", label: "Cliente", render: c => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{c.nombre ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.direccion}</div>
      </div>
    )},
    { key: "contacto", label: "Contacto", render: c => (
      <div>
        <div style={{ fontSize: 13 }}>{c.contacto ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.telefono}</div>
      </div>
    ), width: 150 },
    { key: "tipo", label: "Tipo", render: c => <Tag variant="neutral">{c.tipo ?? "—"}</Tag>, width: 110 },
    { key: "contrato", label: "Contrato", accessor: c => c.contrato ?? "—", width: 130 },
    { key: "proximaVisita", label: "Próxima visita", accessor: c => c.proximaVisita ? new Date(c.proximaVisita).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—", width: 120 },
    { key: "estado", label: "Estado", render: c => <Tag variant={c.estado === "Activo" ? "accent" : "neutral"}>{c.estado ?? "—"}</Tag>, width: 90 },
    { key: "id", label: "", render: c => (
      <div style={{ display: "flex", gap: 4 }}>
        {canEdit && <button onClick={() => openEdit(c)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {canDelete && <button onClick={() => remove(c.id)} title="Dar de baja" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="OPS · Clientes en servicio"
        title="Clientes en servicio"
        subtitle="Base de clientes con contratos de mantenimiento activos y visitas programadas."
        actions={canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Agregar cliente</Button> : undefined}
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nombre del cliente / empresa</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre" style={inp} />
          </div>
          {[
            { label: "Contacto", key: "contacto", ph: "Nombre del contacto" },
            { label: "Teléfono", key: "telefono", ph: "222 555 1234" },
            { label: "Dirección", key: "direccion", ph: "Calle, colonia, ciudad" },
          ].map(({ label, key, ph }) => (
            <div key={key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
              <input value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inp} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Tipo</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={inp}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Estado</label>
            <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={inp}>
              {ESTADOS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Agregar"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} clientes`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={c => c.id} emptyTitle="Sin clientes en servicio" emptyDescription="Agrega el primer cliente con contrato activo." />
        )}
      </Section>
    </>
  );
}
