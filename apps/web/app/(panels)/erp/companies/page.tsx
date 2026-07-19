"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";

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
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "companies"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<CompanyProfile[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CompanyProfile | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

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

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setSaveErr(null); setShowForm(true); };
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
      setSaveErr(e instanceof Error ? e.message : "No se pudo guardar");
    } finally { setSaving(false); }
  };

  const setPrimary = async (c: CompanyProfile) => {
    if (!token) return;
    try {
      await apiFetch(`company/${c.id}/primary`, token, { method: "PATCH" });
      void load();
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Error en la operación"); }
  };

  const toggleActive = async (c: CompanyProfile) => {
    if (!token) return;
    if (c.isPrimary) { setActionErr("No puedes desactivar la empresa primaria."); return; }
    try {
      await apiFetch(`company/${c.id}/active`, token, { method: "PATCH", body: JSON.stringify({ isActive: !c.isActive }) });
      void load();
    } catch (e) { setActionErr(e instanceof Error ? e.message : "Error en la operación"); }
  };

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((c) =>
        (c.legalName ?? "").toLowerCase().includes(q) ||
        (c.tradeName ?? "").toLowerCase().includes(q) ||
        (c.rfc ?? "").toLowerCase().includes(q)
      );
    }
    if (filterActive === "active") rows = rows.filter((c) => c.isActive);
    if (filterActive === "inactive") rows = rows.filter((c) => !c.isActive);
    return rows;
  }, [items, searchQ, filterActive]);

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
    ...(cfg.canAssign ? [{
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
            {cfg.canAssign && <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva empresa</Button>}
          </>
        }
      />
      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Empresas totales" value={items.length} icon="🏢" />
          <KpiCard label="Activas" value={items.filter(c => c.isActive).length} variant="positive" icon="✅" />
          <KpiCard label="Inactivas" value={items.filter(c => !c.isActive).length} variant={items.filter(c => !c.isActive).length > 0 ? "warning" : "default"} icon="⛔" />
          <KpiCard label="Empresa primaria" value={items.filter(c => c.isPrimary).length > 0 ? "Configurada" : "Sin definir"} variant={items.some(c => c.isPrimary) ? "positive" : "warning"} icon="🏛️" hint="Razón social principal" />
        </div>
      )}
      {!loading && items.length > 0 && (() => {
        const active = items.filter(c => c.isActive).length;
        const inactive = items.length - active;
        const primary = items.filter(c => c.isPrimary).length;
        const total = items.length;
        const rows: { label: string; count: number; color: string }[] = [
          { label: "Activas", count: active, color: "var(--success)" },
          { label: "Inactivas", count: inactive, color: "var(--warning)" },
          { label: "Primaria", count: primary, color: "var(--primary)" },
        ].filter(r => r.count > 0);
        return (
          <div style={{ marginBottom: 18, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Distribución de empresas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {rows.map(r => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: "80px 1fr 48px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(r.count / total) * 100}%`, background: r.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {actionErr && (
        <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{actionErr}</span>
          <button type="button" onClick={() => setActionErr(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
      )}
      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por razón social, nombre comercial o RFC…" }}
        selects={[{
          label: "Estado",
          value: filterActive,
          onChange: setFilterActive,
          options: [
            { value: "active", label: "Activa" },
            { value: "inactive", label: "Inactiva" },
          ],
          allowAll: true,
        }]}
        onClear={() => { setSearchQ(""); setFilterActive(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "legalName", label: "Razón social" },
            { key: "tradeName", label: "Nombre comercial" },
            { key: "rfc", label: "RFC" },
            { key: "contactEmail", label: "Email" },
            { key: "isActive", label: "Estado", format: (v) => v ? "Activa" : "Inactiva" },
          ], "empresas")}>Excel</Button>
        ) : undefined}
      />
      <Section title={loading ? "Cargando…" : `${visibleItems.length} empresas`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando empresas registradas." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={visibleItems} rowKey={(c) => c.id} emptyTitle="Sin empresas" emptyDescription="Registra la primera razón social." />}
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
              {saveErr && <p style={{ color: "var(--danger)", fontSize: 12, margin: "0 0 8px" }}>{saveErr}</p>}
              <Button variant="secondary" onClick={() => { setShowForm(false); setSaveErr(null); }}>Cancelar</Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving || !form.legalName || !form.rfc}>{saving ? "Guardando…" : "Guardar"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
