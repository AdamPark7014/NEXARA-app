"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { useCrmManagerGuard } from "@/lib/useCrmManagerGuard";
import { getCrmManagerSubmoduleConfig } from "@/lib/section-views";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

interface OrderTemplate {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  companyName?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  companyAddress?: string | null;
  companyRfc?: string | null;
  companyWebsite?: string | null;
  primaryColor: string;
  footerText?: string | null;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  companyName: "",
  companyEmail: "",
  companyPhone: "",
  companyAddress: "",
  companyRfc: "",
  companyWebsite: "",
  primaryColor: "#0f6ad6",
  footerText: "",
};

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...((init.headers ?? {}) as Record<string, string>) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export default function TemplatesPage() {
  const { user } = useUser();
  const cfg = useCrmManagerGuard();
  const viewCfg = useMemo(() => getCrmManagerSubmoduleConfig(user, "templates"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<OrderTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

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
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) if (v !== "") payload[k] = v;
      await apiFetch("ventas/order-templates", token, { method: "POST", body: JSON.stringify(payload) });
      setShowForm(false); setForm({ ...EMPTY_FORM });
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo guardar la plantilla");
    } finally { setSaving(false); }
  };

  const setDefault = async (t: OrderTemplate) => {
    if (!token) return;
    try {
      await apiFetch(`ventas/order-templates/${t.id}/set-default`, token, { method: "POST" });
      void load();
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Error al predeterminar"); }
  };

  const remove = async (t: OrderTemplate) => {
    if (!token) return;
    setConfirmState({ message: `¿Eliminar la plantilla "${t.name}"?`, fn: async () => {
    try {
      await apiFetch(`ventas/order-templates/${t.id}`, token, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== t.id));
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Error al eliminar"); }
  } });
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface-2)",
    color: "var(--foreground)", fontSize: 13,
  };

  const lbl = (text: string, required?: boolean) => (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "flex", gap: 3 }}>
      {text}{required && <span style={{ color: "#ef4444" }}>*</span>}
    </span>
  );

  const columns: Column<OrderTemplate>[] = [
    {
      key: "name", label: "Plantilla",
      render: (t) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
            background: t.primaryColor, border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: `0 2px 8px ${t.primaryColor}44`,
          }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {t.name}{" "}
              {t.isDefault && <Tag variant="accent" dot>Predeterminada</Tag>}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.description ?? "—"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "companyName", label: "Empresa",
      render: (t) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.companyName ?? "—"}</div>
          {t.companyRfc && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>RFC: {t.companyRfc}</div>}
        </div>
      ),
      width: 180,
    },
    {
      key: "companyEmail", label: "Contacto",
      render: (t) => (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {t.companyEmail && <div>{t.companyEmail}</div>}
          {t.companyPhone && <div>{t.companyPhone}</div>}
          {!t.companyEmail && !t.companyPhone && "—"}
        </div>
      ),
      width: 200,
    },
    ...(cfg.canCreate ? [{
      key: "acciones" as keyof OrderTemplate, label: "",
      render: (t: OrderTemplate) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {!t.isDefault && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void setDefault(t); }}>
              Predeterminar
            </Button>
          )}
          {cfg.canDelete && (
            <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void remove(t); }}>
              Eliminar
            </Button>
          )}
        </div>
      ),
      width: 230,
    }] : []),
  ];

  if (!cfg.canAccess) return null;

  return (
    <>
      <PageHeader
        eyebrow="CRM · Catálogo"
        title={viewCfg.title}
        subtitle={viewCfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={() => { setShowForm(true); setSaveErr(null); }}>Nueva plantilla</Button>
            )}
          </>
        }
      />

      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{actionErr}</span>
          <button type="button" onClick={() => setActionErr(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}
      <Section title={loading ? "Cargando…" : `${items.length} plantilla${items.length === 1 ? "" : "s"}`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando plantillas de cotización." />}
        {!loading && error && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !error && (
          <DataTable columns={columns} rows={items} rowKey={(t) => t.id}
            emptyTitle="Sin plantillas" emptyDescription="Crea la primera plantilla de cotización para PDF." />
        )}
      </Section>

      {showForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: "28px 32px", width: 560, maxWidth: "calc(100vw - 32px)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Nueva plantilla de cotización</div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
                Estos datos aparecerán en el encabezado del PDF generado.
              </div>
            </div>

            {/* Color preview banner */}
            <div style={{ borderRadius: 10, overflow: "hidden", marginBottom: 20, border: "1px solid var(--border)" }}>
              <div style={{ height: 6, background: form.primaryColor }} />
              <div style={{ background: "#0a1f3d", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: form.primaryColor, border: "2px solid rgba(255,255,255,0.2)" }} />
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{form.companyName || "Nombre empresa"}</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{form.companyRfc || "RFC"} · {form.companyPhone || "Teléfono"}</div>
                </div>
                <div style={{ marginLeft: "auto", background: form.primaryColor, borderRadius: 8, padding: "4px 14px" }}>
                  <div style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>COTIZACIÓN</div>
                  <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 700 }}>COT-0001</div>
                </div>
              </div>
            </div>

            {/* Form fields */}
            <div style={{ display: "grid", gap: 14 }}>

              {/* Row 1: Identificación */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 4 }}>
                Identificación
              </div>

              <label style={{ display: "grid", gap: 4 }}>
                {lbl("Nombre de la plantilla", true)}
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Cotización estándar NEXARA" style={inp} autoFocus />
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                {lbl("Descripción")}
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Uso interno para describir esta plantilla" style={inp} />
              </label>

              {/* Row: Color */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  {lbl("Pie de página del PDF")}
                  <input value={form.footerText} onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))}
                    placeholder="NEXARA · Propuesta confidencial" style={inp} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  {lbl("Color primario")}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="color" value={form.primaryColor} onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                      style={{ width: 48, height: 40, padding: 2, borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }} />
                    <input value={form.primaryColor} onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                      placeholder="#0f6ad6" style={{ ...inp, flex: 1 }} />
                  </div>
                </label>
              </div>

              {/* Datos empresa */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 6 }}>
                Datos de la empresa (encabezado del PDF)
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  {lbl("Razón social / Empresa")}
                  <input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                    placeholder="NEXARA S.A. de C.V." style={inp} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  {lbl("RFC")}
                  <input value={form.companyRfc} onChange={(e) => setForm((f) => ({ ...f, companyRfc: e.target.value }))}
                    placeholder="NEX000101AAA" style={{ ...inp, textTransform: "uppercase" }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  {lbl("Correo electrónico")}
                  <input type="email" value={form.companyEmail} onChange={(e) => setForm((f) => ({ ...f, companyEmail: e.target.value }))}
                    placeholder="cotizaciones@nexara.mx" style={inp} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  {lbl("Teléfono")}
                  <input type="tel" value={form.companyPhone} onChange={(e) => setForm((f) => ({ ...f, companyPhone: e.target.value }))}
                    placeholder="+52 55 1234 5678" style={inp} />
                </label>
              </div>

              <label style={{ display: "grid", gap: 4 }}>
                {lbl("Dirección fiscal")}
                <input value={form.companyAddress} onChange={(e) => setForm((f) => ({ ...f, companyAddress: e.target.value }))}
                  placeholder="Av. Reforma 100, Col. Centro, CDMX 06600" style={inp} />
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                {lbl("Sitio web")}
                <input type="url" value={form.companyWebsite} onChange={(e) => setForm((f) => ({ ...f, companyWebsite: e.target.value }))}
                  placeholder="www.nexara.mx" style={inp} />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submit()} disabled={saving || !form.name}>
                {saving ? "Guardando…" : "Crear plantilla"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
