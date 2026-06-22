"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface CompanyProfile {
  id: number;
  legalName: string;
  tradeName?: string | null;
  rfc: string;
  fiscalRegime?: string | null;
  contactEmail?: string | null;
  websiteUrl?: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const emptyForm = { legalName: "", tradeName: "", rfc: "", fiscalRegime: "", contactEmail: "", websiteUrl: "" };

export default function CompaniesPage() {
  const { user } = useUser();
  const { canManageUsers, isCeo } = useRbacGuard();
  const token = user?.token ?? "";
  const canManage = canManageUsers || isCeo;

  const [items, setItems] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CompanyProfile | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("company/list", token);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar empresas");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (c: CompanyProfile) => {
    setEditing(c);
    setForm({ legalName: c.legalName, tradeName: c.tradeName ?? "", rfc: c.rfc, fiscalRegime: c.fiscalRegime ?? "", contactEmail: c.contactEmail ?? "", websiteUrl: c.websiteUrl ?? "" });
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`company/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("company", token, { method: "POST", body: JSON.stringify(form) });
      }
      setShowForm(false);
      void load();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const setPrimary = async (c: CompanyProfile) => {
    if (!token) return;
    try {
      await apiFetch(`company/${c.id}/primary`, token, { method: "PATCH" });
      void load();
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const toggleActive = async (c: CompanyProfile) => {
    if (!token) return;
    if (c.isPrimary) { alert("No puedes desactivar la empresa primaria."); return; }
    try {
      await apiFetch(`company/${c.id}/active`, token, { method: "PATCH", body: JSON.stringify({ isActive: !c.isActive }) });
      void load();
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<CompanyProfile>[] = [
    {
      key: "legalName", label: "Empresa",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.tradeName || c.legalName}{c.isPrimary && <Tag variant="accent" dot>Primaria</Tag>}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{c.legalName}</div>
        </div>
      ),
    },
    { key: "rfc", label: "RFC", render: (c) => <code style={{ fontSize: 11.5 }}>{c.rfc}</code>, width: 130 },
    { key: "fiscalRegime", label: "Régimen", accessor: (c) => c.fiscalRegime ?? "—", width: 100 },
    { key: "contactEmail", label: "Contacto", accessor: (c) => c.contactEmail ?? "—", width: 180 },
    { key: "isActive", label: "Estado", render: (c) => <Tag variant={c.isActive ? "positive" : "danger"}>{c.isActive ? "Activa" : "Inactiva"}</Tag>, width: 100 },
    ...(canManage ? [{
      key: "acciones" as keyof CompanyProfile, label: "",
      render: (c: CompanyProfile) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>✎</Button>
          {!c.isPrimary && <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void setPrimary(c); }}>Hacer primaria</Button>}
          <Button size="sm" variant={c.isActive ? "danger" : "secondary"} onClick={(e) => { e.stopPropagation(); void toggleActive(c); }}>{c.isActive ? "Desactivar" : "Activar"}</Button>
        </div>
      ),
      width: 240,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Gobierno"
        title="Multi-empresa"
        subtitle="Razones sociales registradas en NEXARA: RFC, régimen, contacto fiscal y cuál opera como primaria."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {canManage && <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva empresa</Button>}
          </>
        }
      />
      <Section title={loading ? "Cargando…" : `${items.length} empresas`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando empresas registradas." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(c) => c.id} emptyTitle="Sin empresas" emptyDescription="Registra la primera razón social." />}
      </Section>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{editing ? "Editar empresa" : "Nueva empresa"}</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Razón social</span>
                <input value={form.legalName} onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} placeholder="NEXARA Tech S.A. de C.V." style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nombre comercial</span>
                <input value={form.tradeName} onChange={(e) => setForm((f) => ({ ...f, tradeName: e.target.value }))} placeholder="NEXARA" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>RFC</span>
                <input value={form.rfc} onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value }))} placeholder="XAXX010101000" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Régimen fiscal (clave SAT)</span>
                <input value={form.fiscalRegime} onChange={(e) => setForm((f) => ({ ...f, fiscalRegime: e.target.value }))} placeholder="R601" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Email de contacto</span>
                <input value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder="contacto@nexara.com.mx" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Sitio web</span>
                <input value={form.websiteUrl} onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))} placeholder="https://nexara.com.mx" style={inp} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving || !form.legalName || !form.rfc}>{saving ? "Guardando…" : "Guardar"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
