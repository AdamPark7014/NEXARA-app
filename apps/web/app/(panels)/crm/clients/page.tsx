"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface Client {
  id: number;
  razonSocial?: string;
  tipo?: string;
  rfc?: string;
  contactoPrincipal?: string;
  emailContacto?: string;
  telefono?: string;
  estado?: string;
  facturadoYTD?: number;
  desde?: string;
}

const TIPOS = ["Corporativo", "Gobierno", "PyME", "Hogar"];
const ESTADOS = ["Activo", "Inactivo", "Prospecto"];

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { razonSocial: "", tipo: "PyME", rfc: "", contactoPrincipal: "", emailContacto: "", telefono: "", estado: "Prospecto" };

export default function ClientsPage() {
  const { user } = useUser();
  const { canCreate, canEdit, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("clients", token);
      setItems(Array.isArray(data) ? data : (data.data ?? []));
    } catch { /* skip */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({ razonSocial: c.razonSocial ?? "", tipo: c.tipo ?? "PyME", rfc: c.rfc ?? "", contactoPrincipal: c.contactoPrincipal ?? "", emailContacto: c.emailContacto ?? "", telefono: c.telefono ?? "", estado: c.estado ?? "Prospecto" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editing) {
        const updated = await apiFetch(`clients/${editing.id}`, token, { method: "PUT", body: JSON.stringify(form) });
        setItems(prev => prev.map(c => c.id === editing.id ? { ...c, ...updated } : c));
      } else {
        const created = await apiFetch("clients", token, { method: "POST", body: JSON.stringify(form) });
        setItems(prev => [created, ...prev]);
      }
      setShowForm(false);
    } catch { /* skip */ }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("¿Eliminar este cliente?")) return;
    try {
      await apiFetch(`clients/${id}`, token, { method: "DELETE" });
      setItems(prev => prev.filter(c => c.id !== id));
    } catch { /* skip */ }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const columns: Column<Client>[] = [
    { key: "razonSocial", label: "Cliente", render: c => (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{c.razonSocial ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.rfc}</div>
      </div>
    )},
    { key: "tipo", label: "Tipo", render: c => <Tag variant="neutral">{c.tipo ?? "—"}</Tag>, width: 110 },
    { key: "contactoPrincipal", label: "Contacto", render: c => (
      <div>
        <div style={{ fontSize: 13 }}>{c.contactoPrincipal ?? "—"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.telefono}</div>
      </div>
    ), width: 160 },
    { key: "facturadoYTD", label: "Facturado YTD", render: c => <Money value={c.facturadoYTD ?? 0} />, width: 130 },
    { key: "estado", label: "Estado", render: c => <Tag variant={c.estado === "Activo" ? "accent" : c.estado === "Prospecto" ? "warning" : "neutral"}>{c.estado ?? "—"}</Tag>, width: 100 },
    { key: "id", label: "", render: c => (
      <div style={{ display: "flex", gap: 4 }}>
        {canEdit && <button onClick={() => openEdit(c)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✎</button>}
        {canDelete && <button onClick={() => remove(c.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--text-tertiary)", padding: "4px 6px" }}>✕</button>}
      </div>
    ), width: 60 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Clientes"
        title="Cartera de clientes"
        subtitle="Base de clientes activos, prospectos y contratos vigentes."
        actions={canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo cliente</Button> : undefined}
      />

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Razón social</label>
            <input value={form.razonSocial} onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))} placeholder="Empresa S.A. de C.V." style={inp} />
          </div>
          {[
            { label: "RFC", key: "rfc", ph: "ABC123456XYZ" },
            { label: "Contacto principal", key: "contactoPrincipal", ph: "Nombre del contacto" },
            { label: "Email", key: "emailContacto", ph: "correo@empresa.com" },
            { label: "Teléfono", key: "telefono", ph: "222 555 1234" },
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
            <Button variant="primary" onClick={save}>{editing ? "Guardar" : "Crear cliente"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${items.length} clientes`}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable columns={columns} rows={items} rowKey={c => c.id} emptyTitle="Sin clientes" emptyDescription="Agrega el primer cliente a la cartera." />
        )}
      </Section>
    </>
  );
}
