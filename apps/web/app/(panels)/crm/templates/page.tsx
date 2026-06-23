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

interface OrderTemplate {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  companyName?: string | null;
  primaryColor: string;
  footerText?: string | null;
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

const emptyForm = { name: "", description: "", companyName: "", companyEmail: "", companyPhone: "", primaryColor: "#0f6ad6", footerText: "" };

export default function TemplatesPage() {
  const { user } = useUser();
  const { canCreate, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<OrderTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("ventas/order-templates", token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar plantillas");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!token || !form.name) return;
    setSaving(true);
    try {
      await apiFetch("ventas/order-templates", token, { method: "POST", body: JSON.stringify(form) });
      setShowForm(false); setForm({ ...emptyForm });
      void load();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const setDefault = async (t: OrderTemplate) => {
    if (!token) return;
    try {
      await apiFetch(`ventas/order-templates/${t.id}/set-default`, token, { method: "POST" });
      void load();
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const remove = async (t: OrderTemplate) => {
    if (!token || !confirm(`¿Eliminar la plantilla "${t.name}"?`)) return;
    try {
      await apiFetch(`ventas/order-templates/${t.id}`, token, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== t.id));
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const columns: Column<OrderTemplate>[] = [
    {
      key: "name", label: "Plantilla",
      render: (t) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, background: t.primaryColor, border: "1px solid var(--border)" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name} {t.isDefault && <Tag variant="accent" dot>Predeterminada</Tag>}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.description ?? "—"}</div>
          </div>
        </div>
      ),
    },
    { key: "companyName", label: "Empresa", accessor: (t) => t.companyName ?? "—", width: 180 },
    ...((canCreate) ? [{
      key: "acciones" as keyof OrderTemplate, label: "",
      render: (t: OrderTemplate) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {!t.isDefault && <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void setDefault(t); }}>Predeterminar</Button>}
          {canDelete && <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void remove(t); }}>Eliminar</Button>}
        </div>
      ),
      width: 220,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Catálogo"
        title="Plantillas"
        subtitle="Diseños reutilizables para PDF de cotización: logo, colores corporativos y datos fiscales."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {canCreate && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nueva plantilla</Button>}
          </>
        }
      />

      <Section title={loading ? "Cargando…" : `${items.length} plantillas`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando plantillas de cotización." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(t) => t.id} emptyTitle="Sin plantillas" emptyDescription="Crea la primera plantilla de cotización." />}
      </Section>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 460, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nueva plantilla</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nombre</span>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Cotización estándar NEXARA" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Descripción</span>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nombre de empresa (encabezado)</span>
                <input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} placeholder="NEXARA" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Color primario</span>
                <input type="color" value={form.primaryColor} onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))} style={{ ...inp, height: 40, padding: 4 }} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Pie de página</span>
                <textarea value={form.footerText} onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.name}>{saving ? "Guardando…" : "Crear"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
