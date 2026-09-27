"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import PageChrome from "@/components/ui/PageChrome";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import MetricStrip from "@/components/ui/MetricStrip";
import { FormField, FormGrid } from "@/components/ui/FormField";
import { SkeletonList } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { getErpGovernanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import FilterToolbar from "@/components/FilterToolbar";
import { toast } from "@/components/Toast";
import SettingsModuleRail from "@/components/erp/SettingsModuleRail";
import ErpModuleCards from "@/components/erp/ErpModuleCards";

interface SettingRow {
  key: string;
  value: string;
  category: string;
  label?: string | null;
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

const emptyForm = { key: "", value: "", category: "general", label: "" };

const CATEGORY_META: Record<string, { label: string; description: string }> = {
  general: { label: "General", description: "Datos básicos de la empresa y valores por defecto." },
  branding: { label: "Marca", description: "Colores, logotipos y textos que ven clientes y colaboradores." },
  integraciones: { label: "Integraciones", description: "Conexiones con servicios externos." },
  integrations: { label: "Integraciones", description: "Conexiones con servicios externos." },
  finanzas: { label: "Finanzas", description: "Parámetros contables y fiscales." },
  finance: { label: "Finanzas", description: "Parámetros contables y fiscales." },
  notificaciones: { label: "Notificaciones", description: "Avisos por correo, WhatsApp y dentro del sistema." },
  notifications: { label: "Notificaciones", description: "Avisos por correo, WhatsApp y dentro del sistema." },
  seguridad: { label: "Seguridad", description: "Políticas de acceso y contraseñas." },
  security: { label: "Seguridad", description: "Políticas de acceso y contraseñas." },
  rh: { label: "Recursos humanos", description: "Horarios, nómina y políticas de personal." },
  hr: { label: "Recursos humanos", description: "Horarios, nómina y políticas de personal." },
};

function categoryLabel(cat: string): string {
  const meta = CATEGORY_META[cat.toLowerCase()];
  if (meta) return meta.label;
  const s = cat.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Sin categoría";
}

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]*$/;

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--foreground)", minHeight: 40, boxSizing: "border-box",
};

function looksLikeColor(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

export default function SettingsPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpGovernanceSectionConfig(user, "settings"), [user]);
  const token = user?.token ?? "";

  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSetting, setEditingSetting] = useState<SettingRow | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [touched, setTouched] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const deferredQ = useDeferredValue(searchQ);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("settings", token);
      setSettings(Array.isArray(data) ? data : []);
      setLoaded(true);
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar la configuración."));
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filteredCount = useMemo(() => {
    const q = deferredQ.trim().toLowerCase();
    if (!q) return settings.length;
    return settings.filter((s) => s.key.toLowerCase().includes(q) || (s.label ?? "").toLowerCase().includes(q) || s.value.toLowerCase().includes(q)).length;
  }, [settings, deferredQ]);

  const grouped = useMemo(() => {
    const q = deferredQ.trim().toLowerCase();
    const filtered = q
      ? settings.filter((s) => s.key.toLowerCase().includes(q) || (s.label ?? "").toLowerCase().includes(q) || s.value.toLowerCase().includes(q))
      : settings;
    const map = new Map<string, SettingRow[]>();
    for (const s of filtered) {
      const list = map.get(s.category);
      if (list) list.push(s);
      else map.set(s.category, [s]);
    }
    return Array.from(map.entries()).sort((a, b) => categoryLabel(a[0]).localeCompare(categoryLabel(b[0]), "es"));
  }, [settings, deferredQ]);

  const stats = useMemo(() => ({
    total: settings.length,
    categories: new Set(settings.map((s) => s.category)).size,
    unnamed: settings.filter((s) => !s.label).length,
  }), [settings]);

  const openNew = () => { setEditingSetting(null); setForm({ ...emptyForm }); setFormErr(null); setTouched(false); setShowForm(true); };
  const openEdit = (s: SettingRow) => {
    setEditingSetting(s);
    setForm({ key: s.key, value: s.value, category: s.category, label: s.label ?? "" });
    setFormErr(null);
    setTouched(false);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingSetting(null); setFormErr(null); };

  const keyError = !editingSetting && touched
    ? (!form.key.trim()
      ? "Escribe una clave."
      : !KEY_PATTERN.test(form.key.trim())
        ? "Usa letras, números, puntos o guiones, sin espacios. Ej. marca.colorPrincipal"
        : settings.some((s) => s.key === form.key.trim())
          ? "Ya existe un parámetro con esta clave."
          : null)
    : null;
  const valueError = touched && !form.value.trim() ? "El valor no puede quedar vacío." : null;
  const dirty = editingSetting
    ? form.value !== editingSetting.value || form.category !== editingSetting.category || form.label !== (editingSetting.label ?? "")
    : !!(form.key || form.value || form.label);

  const save = async () => {
    setTouched(true);
    if (!token || !form.key.trim() || !form.value.trim()) return;
    if (!editingSetting && (!KEY_PATTERN.test(form.key.trim()) || settings.some((s) => s.key === form.key.trim()))) return;
    setSaving(true);
    setFormErr(null);
    try {
      await apiFetch("settings", token, { method: "PUT", body: JSON.stringify({ ...form, key: form.key.trim() }) });
      toast.success(editingSetting ? "Cambios guardados" : "Parámetro creado");
      setShowForm(false);
      setEditingSetting(null);
      setForm({ ...emptyForm });
      void load();
    } catch (e) {
      setFormErr(formatApiError(e, "No se pudo guardar el parámetro."));
    } finally { setSaving(false); }
  };

  const remove = (s: SettingRow) => {
    if (!token) return;
    setConfirmState({
      title: "Eliminar parámetro",
      message: `Se eliminará «${s.label || s.key}». Las funciones que dependan de este valor volverán a su comportamiento por defecto.`,
      confirmLabel: "Eliminar",
      danger: true,
      fn: async () => {
        try {
          await apiFetch(`settings/${s.key}`, token, { method: "DELETE" });
          setSettings((prev) => prev.filter((x) => x.key !== s.key));
          toast.success("Parámetro eliminado");
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo eliminar el parámetro"));
        }
      },
    });
  };

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(["general", "branding", "integraciones", "notificaciones"]);
    for (const s of settings) set.add(s.category);
    return Array.from(set);
  }, [settings]);

  const initialLoading = loading && !loaded;

  return (
    <PageChrome
      eyebrow="Gobierno · Configuración"
      title="Configuración"
      subtitle="Parámetros de la empresa activa, integraciones y facturación de tu cuenta."
      primaryAction={
        cfg.canCreate ? <Button variant="primary" iconLeft="+" onClick={openNew}>Nuevo parámetro</Button> : undefined
      }
      secondaryActions={
        <Button variant="secondary" iconLeft="↻" loading={loading && loaded} onClick={() => void load()}>Actualizar</Button>
      }
      context={<SettingsModuleRail />}
    >
      <Section title="Integraciones y cuenta" subtitle="Accesos rápidos a la configuración avanzada." dense>
        <ErpModuleCards
          items={[
            { href: "/erp/settings/billing", title: "Plan y facturación", description: "Plan contratado, usuarios incluidos y pagos", icon: "💳" },
            { href: "/erp/settings/webhooks", title: "Avisos automáticos (webhooks)", description: "Envía eventos a otros sistemas en tiempo real", icon: "🔗" },
            { href: "/erp/settings/api-keys", title: "Claves de acceso (API)", description: "Conexiones de otros sistemas con NEXARA", icon: "🔑" },
            { href: "/erp/companies", title: "Empresas", description: "Razones sociales y quién tiene acceso a cada una", icon: "🏛️" },
          ]}
        />
      </Section>

      {loaded && settings.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <MetricStrip
            ariaLabel="Resumen de parámetros"
            metrics={[
              { label: "Parámetros", value: stats.total },
              { label: "Categorías", value: stats.categories },
              {
                label: "Sin nombre visible",
                value: stats.unnamed,
                tone: stats.unnamed > 0 ? "warning" : "success",
                hint: stats.unnamed > 0 ? "Agrega un nombre para identificarlos" : "Todos tienen nombre",
              },
            ]}
          />
        </div>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por nombre, clave o valor…", ariaLabel: "Buscar parámetros" }}
        onClear={() => setSearchQ("")}
        resultCount={initialLoading ? null : filteredCount}
      />

      {error && loaded && (
        <InlineAlert
          variant="warning"
          title="No se pudo actualizar"
          message={`${error} Mostramos la última información cargada.`}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      {initialLoading && !error && <SkeletonList rows={5} />}
      {!loaded && !loading && error && (
        <EmptyState
          icon="⚠️"
          title="No se pudo cargar la configuración"
          description={error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
        />
      )}
      {loaded && grouped.length === 0 && (
        searchQ ? (
          <EmptyState
            icon="🔎"
            title="Sin coincidencias"
            description="Ningún parámetro coincide con la búsqueda."
            action={<Button size="sm" variant="secondary" onClick={() => setSearchQ("")}>Limpiar búsqueda</Button>}
          />
        ) : (
          <EmptyState
            icon="⚙️"
            title="Aún no hay parámetros"
            description="Los parámetros guardan valores que usa el sistema, como colores de marca o datos de contacto."
            action={cfg.canCreate ? <Button size="sm" variant="primary" onClick={openNew}>Nuevo parámetro</Button> : undefined}
          />
        )
      )}

      {loaded && grouped.map(([category, rows]) => (
        <Section
          key={category}
          title={categoryLabel(category)}
          subtitle={CATEGORY_META[category.toLowerCase()]?.description}
          actions={<span style={{ fontSize: 12, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{rows.length}</span>}
        >
          <ul style={{ display: "grid", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((s) => (
              <li
                key={s.key}
                style={{
                  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
                }}
              >
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.label || s.key}</div>
                  {s.label && (
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontFamily: "var(--nx-font-mono, ui-monospace, monospace)" }}>{s.key}</div>
                  )}
                </div>
                <div
                  style={{
                    flex: "2 1 260px", minWidth: 0, fontSize: 13, color: "var(--text-secondary)",
                    display: "flex", alignItems: "center", gap: 8, wordBreak: "break-word",
                  }}
                >
                  {looksLikeColor(s.value) && (
                    <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 4, background: s.value, border: "1px solid var(--border)", flexShrink: 0 }} />
                  )}
                  <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={s.value}>
                    {s.value}
                  </span>
                </div>
                {cfg.canCreate && (
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                    <Button size="sm" variant="secondary" onClick={() => openEdit(s)} aria-label={`Editar ${s.label || s.key}`}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(s)} aria-label={`Eliminar ${s.label || s.key}`} style={{ color: "var(--danger)" }}>
                      Eliminar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <Modal
        open={showForm}
        onClose={closeForm}
        dirty={dirty && !saving}
        title={editingSetting ? `Editar «${editingSetting.label || editingSetting.key}»` : "Nuevo parámetro"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!!editingSetting && !dirty}>
              {editingSetting ? "Guardar cambios" : "Crear parámetro"}
            </Button>
          </>
        }
      >
        <FormGrid>
          <FormField
            label="Nombre visible"
            optional
            fullWidth
            hint="Cómo se mostrará en esta pantalla. Ej. Color principal de la marca"
          >
            <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} style={inp} />
          </FormField>
          <FormField
            label="Clave"
            fullWidth
            error={keyError}
            hint={editingSetting ? "La clave no se puede cambiar una vez creada." : "Identificador que usa el sistema. Ej. marca.colorPrincipal"}
          >
            <input
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              onBlur={() => setTouched(true)}
              placeholder="marca.colorPrincipal"
              style={{ ...inp, fontFamily: "var(--nx-font-mono, ui-monospace, monospace)" }}
              disabled={!!editingSetting}
              aria-invalid={!!keyError}
              autoCapitalize="off"
              spellCheck={false}
            />
          </FormField>
          <FormField label="Valor" fullWidth error={valueError}>
            <textarea
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              onBlur={() => setTouched(true)}
              rows={3}
              style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}
              aria-invalid={!!valueError}
            />
          </FormField>
          <FormField label="Categoría" fullWidth hint="Agrupa parámetros relacionados en esta pantalla.">
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              list="settings-category-options"
              placeholder="general"
              style={inp}
            />
            <datalist id="settings-category-options">
              {categoryOptions.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </datalist>
          </FormField>
        </FormGrid>
        {formErr && <InlineAlert message={formErr} style={{ marginTop: 14 }} />}
      </Modal>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </PageChrome>
  );
}
