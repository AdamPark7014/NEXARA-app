"use client";

/**
 * ERP · Claves de acceso (API) — autenticación entre sistemas por empresa
 */

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { SkeletonList } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { getActiveCompanyId } from "@/lib/tenant";
import { toast } from "@/components/Toast";
import SettingsModuleRail from "@/components/erp/SettingsModuleRail";
import { API_SCOPE_LABEL, formatDateTime, scopeLabel } from "../settings-labels";

type ApiKeyRow = {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const companyId = getActiveCompanyId();
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(companyId ? { "X-Company-Id": String(companyId) } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--foreground)",
  minHeight: 40,
  boxSizing: "border-box",
};

export default function ApiKeysSettingsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const canManage = Boolean(
    user?.isSuperAdmin ||
      user?.permissions?.includes("console.admin") ||
      user?.permissions?.includes("company.settings.manage"),
  );

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", scopes: [] as string[] });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [list, cat] = await Promise.all([
        apiFetch("company/api-keys", token),
        apiFetch("company/api-keys/catalog", token).catch(() => ({ scopes: [] })),
      ]);
      setKeys(Array.isArray(list) ? list : []);
      setCatalog(Array.isArray(cat?.scopes) ? cat.scopes : []);
      setLoaded(true);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las claves de acceso."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleScope = (scope: string) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((x) => x !== scope) : [...f.scopes, scope],
    }));
  };

  const nameError = touched && !form.name.trim() ? "Escribe un nombre para reconocer la clave." : null;
  const scopesError = touched && !form.scopes.length ? "Elige al menos un permiso." : null;

  const create = async () => {
    setTouched(true);
    if (!form.name.trim() || !form.scopes.length) return;
    setSaving(true);
    try {
      const created = await apiFetch("company/api-keys", token, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", scopes: [] });
      setTouched(false);
      if (created?.apiKey) {
        setRevealed(created.apiKey);
        toast.success("Clave creada: cópiala ahora, no se volverá a mostrar");
      } else {
        toast.success("Clave creada");
      }
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo crear la clave"));
    } finally {
      setSaving(false);
    }
  };

  const revoke = (k: ApiKeyRow) => {
    setConfirmState({
      title: "Revocar clave",
      message: `Los sistemas que usan «${k.name}» dejarán de conectarse de inmediato. Esta acción no se puede deshacer.`,
      confirmLabel: "Revocar",
      danger: true,
      fn: async () => {
        try {
          await apiFetch(`company/api-keys/${k.id}`, token, { method: "DELETE" });
          toast.success("Clave revocada");
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo revocar la clave"));
        }
      },
    });
  };

  if (!canManage) {
    return (
      <EmptyState
        variant="page"
        icon="🔒"
        title="Sin permiso"
        description="Solo los administradores de la empresa pueden gestionar claves de acceso."
      />
    );
  }

  const active = keys.filter((k) => k.isActive);
  const revokedKeys = keys.filter((k) => !k.isActive);
  const initialLoading = loading && !loaded;

  return (
    <>
      <PageHeader
        eyebrow="Gobierno · Configuración"
        title="Claves de acceso (API)"
        subtitle="Permiten que otros sistemas se conecten a NEXARA en nombre de la empresa activa."
        density="ops"
        actions={
          <Button variant="secondary" iconLeft="↻" loading={loading && loaded} onClick={() => void load()}>
            Actualizar
          </Button>
        }
      />
      <SettingsModuleRail />

      {revealed && (
        <InlineAlert
          variant="warning"
          title="Copia la clave ahora"
          message="Por seguridad no volverá a mostrarse. Guárdala en un lugar seguro."
          style={{ marginBottom: 16 }}
          action={
            <div style={{ display: "grid", gap: 8, width: "100%" }}>
              <code
                style={{
                  display: "block", wordBreak: "break-all", padding: "8px 10px", borderRadius: 8,
                  background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13, userSelect: "all",
                }}
              >
                {revealed}
              </code>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(revealed);
                    toast.success("Clave copiada");
                  }}
                >
                  Copiar clave
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
                  Ya la guardé
                </Button>
              </div>
            </div>
          }
        />
      )}

      {error && (
        <InlineAlert
          variant={loaded ? "warning" : "danger"}
          title={loaded ? "No se pudo actualizar" : "No se pudieron cargar las claves"}
          message={loaded ? `${error} Mostramos la última información cargada.` : error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      <Section title="Nueva clave" subtitle="Dale un nombre claro y concede solo los permisos que el sistema necesita.">
        <div style={{ display: "grid", gap: 14, maxWidth: 640 }}>
          <FormField label="Nombre" error={nameError} hint="Ej. Integración con Power BI">
            <input
              style={inp}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onBlur={() => form.name && setTouched(true)}
              aria-invalid={!!nameError}
            />
          </FormField>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Permisos</legend>
            {initialLoading ? (
              <SkeletonList rows={2} />
            ) : catalog.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>No hay permisos disponibles para esta empresa.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                {catalog.map((s) => {
                  const checked = form.scopes.includes(s);
                  return (
                    <label
                      key={s}
                      style={{
                        display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", minHeight: 44,
                        borderRadius: 10, cursor: "pointer",
                        border: `1px solid ${checked ? "color-mix(in srgb, var(--primary) 55%, var(--border))" : "var(--border)"}`,
                        background: checked ? "color-mix(in srgb, var(--primary) 7%, var(--surface))" : "var(--surface)",
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleScope(s)} style={{ width: 18, height: 18, marginTop: 1 }} />
                      <span style={{ display: "grid", gap: 2 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{scopeLabel(s)}</span>
                        {API_SCOPE_LABEL[s]?.description && (
                          <span style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.4 }}>{API_SCOPE_LABEL[s].description}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            {scopesError && <p role="alert" style={{ margin: "6px 0 0", fontSize: 12, color: "var(--state-danger-text)" }}>{scopesError}</p>}
          </fieldset>
          <div>
            <Button variant="primary" loading={saving} disabled={initialLoading} onClick={() => void create()}>
              Crear clave
            </Button>
          </div>
        </div>
      </Section>

      <Section title={`Claves activas${loaded ? ` (${active.length})` : ""}`}>
        {initialLoading && !error && <SkeletonList rows={3} />}
        {loaded && active.length === 0 && (
          <EmptyState
            variant="compact"
            icon="🔑"
            title="No hay claves activas"
            description="Crea una clave arriba cuando necesites conectar otro sistema."
          />
        )}
        <ul style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none", margin: 0, padding: 0 }}>
          {[...active, ...revokedKeys].map((k) => (
            <li
              key={k.id}
              style={{
                display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap",
                padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)",
                opacity: k.isActive ? 1 : 0.7,
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 280px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 14 }}>{k.name}</strong>
                  <Tag variant={k.isActive ? "positive" : "neutral"} size="sm" dot>{k.isActive ? "Activa" : "Revocada"}</Tag>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>Empieza con <code>{k.keyPrefix}…</code></span>
                  <span>Creada {formatDateTime(k.createdAt)}</span>
                  <span>{k.lastUsedAt ? `Último uso ${formatDateTime(k.lastUsedAt)}` : "Nunca usada"}</span>
                  {k.expiresAt && <span>Vence {formatDateTime(k.expiresAt)}</span>}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {k.scopes.map((s) => <Tag key={s} variant="default" size="sm">{scopeLabel(s)}</Tag>)}
                </div>
              </div>
              {k.isActive && (
                <Button variant="ghost" size="sm" onClick={() => revoke(k)} style={{ color: "var(--danger)" }}>
                  Revocar
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
