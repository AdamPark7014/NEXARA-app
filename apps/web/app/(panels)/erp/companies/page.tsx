"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip from "@/components/ui/MetricStrip";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { FormField, FormGrid } from "@/components/ui/FormField";
import { SkeletonList } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";
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

/** Catálogo SAT c_RegimenFiscal (los más comunes). */
const FISCAL_REGIMES: Record<string, string> = {
  "601": "General de Ley Personas Morales",
  "603": "Personas Morales con Fines no Lucrativos",
  "605": "Sueldos y Salarios",
  "606": "Arrendamiento",
  "608": "Demás ingresos",
  "612": "Personas Físicas con Actividades Empresariales y Profesionales",
  "616": "Sin obligaciones fiscales",
  "621": "Incorporación Fiscal",
  "625": "Plataformas Tecnológicas",
  "626": "Régimen Simplificado de Confianza (RESICO)",
};

function regimeLabel(code?: string | null): string {
  if (!code) return "—";
  const digits = code.replace(/\D/g, "");
  const name = FISCAL_REGIMES[digits];
  return name ? `${digits} · ${name}` : code;
}

const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--foreground)", minHeight: 40, boxSizing: "border-box",
};

export default function CompaniesPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "companies"), [user]);
  const token = user?.token ?? "";

  const [items, setItems] = useState<CompanyProfile[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const deferredQ = useDeferredValue(searchQ);
  const [filterActive, setFilterActive] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CompanyProfile | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("company/list", token);
      setItems(Array.isArray(data) ? data : []);
      setLoaded(true);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las empresas."));
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setSaveErr(null); setTouched(false); setShowForm(true); };
  const openEdit = (c: CompanyProfile) => {
    setEditing(c);
    setForm({ legalName: c.legalName, tradeName: c.tradeName ?? "", rfc: c.rfc, fiscalRegime: c.fiscalRegime ?? "", contactEmail: c.contactEmail ?? "", websiteUrl: c.websiteUrl ?? "" });
    setSaveErr(null);
    setTouched(false);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setSaveErr(null); };

  const rfcChanged = !editing || form.rfc.trim() !== editing.rfc;
  const rfcInvalid = !form.rfc.trim() || (rfcChanged && !RFC_PATTERN.test(form.rfc.trim().toUpperCase()));
  const errors = {
    legalName: touched && !form.legalName.trim() ? "Escribe la razón social." : null,
    rfc: touched && rfcInvalid
      ? (!form.rfc.trim() ? "Escribe el RFC." : "El RFC debe tener 12 o 13 caracteres. Ej. NTE010101AB1")
      : null,
    contactEmail: touched && form.contactEmail.trim() && !EMAIL_PATTERN.test(form.contactEmail.trim()) ? "Revisa el correo." : null,
  };
  const hasErrors = !form.legalName.trim() || rfcInvalid ||
    (!!form.contactEmail.trim() && !EMAIL_PATTERN.test(form.contactEmail.trim()));
  const dirty = editing
    ? form.legalName !== editing.legalName || form.tradeName !== (editing.tradeName ?? "") || form.rfc !== editing.rfc ||
      form.fiscalRegime !== (editing.fiscalRegime ?? "") || form.contactEmail !== (editing.contactEmail ?? "") || form.websiteUrl !== (editing.websiteUrl ?? "")
    : Object.values(form).some((v) => v.trim() !== "");

  const save = async () => {
    if (!token) return;
    setTouched(true);
    if (hasErrors) return;
    setSaving(true);
    setSaveErr(null);
    const body = { ...form, rfc: rfcChanged ? form.rfc.trim().toUpperCase() : editing?.rfc ?? form.rfc };
    try {
      if (editing) {
        await apiFetch(`company/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("company", token, { method: "POST", body: JSON.stringify(body) });
      }
      toast.success(editing ? "Cambios guardados" : "Empresa registrada");
      setShowForm(false);
      void load();
    } catch (e) {
      setSaveErr(formatApiError(e, "No se pudo guardar la empresa."));
    } finally { setSaving(false); }
  };

  const setPrimary = (c: CompanyProfile) => {
    if (!token) return;
    setConfirmState({
      title: "Cambiar empresa principal",
      message: `${c.tradeName || c.legalName} será la razón social principal: se usará por defecto en documentos y reportes.`,
      confirmLabel: "Hacer principal",
      danger: false,
      fn: async () => {
        try {
          await apiFetch(`company/${c.id}/primary`, token, { method: "PATCH" });
          toast.success("Empresa principal actualizada");
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo cambiar la empresa principal"));
        }
      },
    });
  };

  const toggleActive = (c: CompanyProfile) => {
    if (!token) return;
    if (c.isPrimary) {
      toast.error("No puedes desactivar la empresa principal. Elige otra como principal primero.");
      return;
    }
    const run = async () => {
      try {
        await apiFetch(`company/${c.id}/active`, token, { method: "PATCH", body: JSON.stringify({ isActive: !c.isActive }) });
        toast.success(c.isActive ? "Empresa desactivada" : "Empresa activada");
        void load();
      } catch (e) {
        toast.error(formatApiError(e, "No se pudo cambiar el estado"));
      }
    };
    if (!c.isActive) { void run(); return; }
    setConfirmState({
      title: "Desactivar empresa",
      message: `${c.tradeName || c.legalName} dejará de aparecer para operar. Podrás reactivarla en cualquier momento.`,
      confirmLabel: "Desactivar",
      danger: true,
      fn: run,
    });
  };

  const visibleItems = useMemo(() => {
    let rows = items;
    const q = deferredQ.trim().toLowerCase();
    if (q) {
      rows = rows.filter((c) =>
        (c.legalName ?? "").toLowerCase().includes(q) ||
        (c.tradeName ?? "").toLowerCase().includes(q) ||
        (c.rfc ?? "").toLowerCase().includes(q)
      );
    }
    if (filterActive === "active") rows = rows.filter((c) => c.isActive);
    if (filterActive === "inactive") rows = rows.filter((c) => !c.isActive);
    return [...rows].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || Number(b.isActive) - Number(a.isActive));
  }, [items, deferredQ, filterActive]);

  const stats = useMemo(() => {
    const active = items.filter((c) => c.isActive).length;
    return { total: items.length, active, inactive: items.length - active, primary: items.find((c) => c.isPrimary) };
  }, [items]);

  const columns: Column<CompanyProfile>[] = [
    {
      key: "legalName", label: "Empresa",
      render: (c) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {c.tradeName || c.legalName}
            {c.isPrimary && <Tag variant="accent" size="sm" dot>Principal</Tag>}
          </div>
          {c.tradeName && <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{c.legalName}</div>}
        </div>
      ),
    },
    { key: "rfc", label: "RFC", render: (c) => <span style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>{c.rfc}</span>, width: 140 },
    {
      key: "fiscalRegime", label: "Régimen fiscal", width: 220,
      render: (c) => <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{regimeLabel(c.fiscalRegime)}</span>,
    },
    {
      key: "contactEmail", label: "Contacto", width: 200,
      render: (c) => (
        <div style={{ fontSize: 12.5, minWidth: 0 }}>
          {c.contactEmail ? <a href={`mailto:${c.contactEmail}`} style={{ color: "var(--primary)" }}>{c.contactEmail}</a> : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
          {c.websiteUrl && (
            <div style={{ color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.websiteUrl.replace(/^https?:\/\//, "")}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "isActive", label: "Estado", width: 100,
      render: (c) => <Tag variant={c.isActive ? "positive" : "neutral"} size="sm" dot>{c.isActive ? "Activa" : "Inactiva"}</Tag>,
    },
    ...(cfg.canAssign ? [{
      key: "acciones" as keyof CompanyProfile, label: "Acciones", align: "right" as const,
      render: (c: CompanyProfile) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>Editar</Button>
          {!c.isPrimary && c.isActive && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setPrimary(c); }}>Hacer principal</Button>
          )}
          {!c.isPrimary && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); toggleActive(c); }}
              style={c.isActive ? { color: "var(--danger)" } : undefined}
            >
              {c.isActive ? "Desactivar" : "Activar"}
            </Button>
          )}
        </div>
      ),
      width: 280,
    }] : []),
  ];

  const initialLoading = loading && !loaded;
  const clearFilters = () => { setSearchQ(""); setFilterActive(""); };

  return (
    <>
      <PageHeader
        eyebrow="Gobierno · Empresas"
        title="Empresas"
        subtitle="Razones sociales con las que opera tu organización y cuál es la principal."
        actions={
          <>
            <Button variant="ghost" onClick={() => { window.location.href = "/erp/settings"; }}>Ir a Configuración</Button>
            <Button variant="secondary" iconLeft="↻" loading={loading && loaded} onClick={() => void load()}>Actualizar</Button>
            {cfg.canAssign && <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva empresa</Button>}
          </>
        }
      />

      {loaded && items.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <MetricStrip
            ariaLabel="Resumen de empresas"
            metrics={[
              { label: "Empresas", value: stats.total },
              { label: "Activas", value: stats.active, tone: "success" },
              { label: "Inactivas", value: stats.inactive, tone: stats.inactive ? "warning" : "default" },
              {
                label: "Principal",
                value: stats.primary ? (stats.primary.tradeName || stats.primary.legalName) : "Sin definir",
                tone: stats.primary ? "default" : "warning",
                hint: stats.primary ? stats.primary.rfc : "Elige una razón social principal",
              },
            ]}
          />
        </div>
      )}

      {error && loaded && (
        <InlineAlert
          variant="warning"
          title="No se pudo actualizar"
          message={`${error} Mostramos la última información cargada.`}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por razón social, nombre comercial o RFC…", ariaLabel: "Buscar empresas" }}
        selects={[{
          label: "Estado",
          value: filterActive,
          onChange: setFilterActive,
          options: [
            { value: "active", label: "Activas" },
            { value: "inactive", label: "Inactivas" },
          ],
          allowAll: true,
          allLabel: "Todas",
        }]}
        onClear={clearFilters}
        resultCount={initialLoading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "legalName", label: "Razón social" },
            { key: "tradeName", label: "Nombre comercial" },
            { key: "rfc", label: "RFC" },
            { key: "fiscalRegime", label: "Régimen fiscal", format: (v) => regimeLabel(v as string | null) },
            { key: "contactEmail", label: "Correo" },
            { key: "isPrimary", label: "Principal", format: (v) => v ? "Sí" : "No" },
            { key: "isActive", label: "Estado", format: (v) => v ? "Activa" : "Inactiva" },
          ], "empresas")}>Exportar a Excel</Button>
        ) : undefined}
      />
      <Section title={initialLoading ? "Cargando empresas" : `${visibleItems.length} ${visibleItems.length === 1 ? "empresa" : "empresas"}`}>
        {initialLoading && !error && <SkeletonList rows={4} tableLike />}
        {!loaded && !loading && error && (
          <InlineAlert
            variant="danger"
            title="No se pudieron cargar las empresas"
            message={error}
            action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          />
        )}
        {loaded && (
          <DataTable
            columns={columns}
            rows={visibleItems}
            rowKey={(c) => c.id}
            ariaLabel="Empresas"
            emptyTitle={items.length === 0 ? "Aún no hay empresas" : "Sin coincidencias"}
            emptyDescription={items.length === 0 ? "Registra la primera razón social para facturar y operar." : "Ninguna empresa coincide con la búsqueda o el filtro."}
            emptyAction={
              items.length === 0
                ? (cfg.canAssign ? <Button size="sm" variant="primary" onClick={openNew}>Nueva empresa</Button> : undefined)
                : <Button size="sm" variant="secondary" onClick={clearFilters}>Limpiar filtros</Button>
            }
          />
        )}
      </Section>

      <Modal
        open={showForm}
        onClose={closeForm}
        dirty={dirty && !saving}
        maxWidth={580}
        title={editing ? `Editar ${editing.tradeName || editing.legalName}` : "Nueva empresa"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!!editing && !dirty}>
              {editing ? "Guardar cambios" : "Registrar empresa"}
            </Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Razón social" fullWidth error={errors.legalName}>
            <input
              value={form.legalName}
              onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
              placeholder="NEXARA Tech S.A. de C.V."
              style={inp}
              aria-invalid={!!errors.legalName}
            />
          </FormField>
          <FormField label="Nombre comercial" optional>
            <input value={form.tradeName} onChange={(e) => setForm((f) => ({ ...f, tradeName: e.target.value }))} placeholder="NEXARA" style={inp} />
          </FormField>
          <FormField label="RFC" error={errors.rfc}>
            <input
              value={form.rfc}
              onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
              onBlur={() => form.rfc && setTouched(true)}
              placeholder="XAXX010101000"
              style={{ ...inp, letterSpacing: "0.03em" }}
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={13}
              aria-invalid={!!errors.rfc}
            />
          </FormField>
          <FormField label="Régimen fiscal" optional fullWidth hint="Clave del catálogo del SAT.">
            <select value={form.fiscalRegime} onChange={(e) => setForm((f) => ({ ...f, fiscalRegime: e.target.value }))} style={inp}>
              <option value="">Sin especificar</option>
              {form.fiscalRegime && !Object.keys(FISCAL_REGIMES).some((k) => k === form.fiscalRegime || `R${k}` === form.fiscalRegime) && (
                <option value={form.fiscalRegime}>{form.fiscalRegime}</option>
              )}
              {Object.entries(FISCAL_REGIMES).map(([code, name]) => {
                const value = form.fiscalRegime === `R${code}` ? `R${code}` : code;
                return <option key={code} value={value}>{code} · {name}</option>;
              })}
            </select>
          </FormField>
          <FormField label="Correo de contacto" optional error={errors.contactEmail}>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              onBlur={() => form.contactEmail && setTouched(true)}
              placeholder="contacto@empresa.com.mx"
              style={inp}
              aria-invalid={!!errors.contactEmail}
            />
          </FormField>
          <FormField label="Sitio web" optional>
            <input
              type="url"
              inputMode="url"
              value={form.websiteUrl}
              onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              placeholder="https://empresa.com.mx"
              style={inp}
            />
          </FormField>
        </FormGrid>
        {saveErr && <InlineAlert message={saveErr} style={{ marginTop: 14 }} />}
      </Modal>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
