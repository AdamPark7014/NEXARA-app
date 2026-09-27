"use client";

/**
 * ERP · Avisos automáticos (webhooks salientes)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import MetricStrip from "@/components/ui/MetricStrip";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { FormField, FormGrid } from "@/components/ui/FormField";
import { SkeletonList } from "@/components/PageState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";
import SettingsModuleRail from "@/components/erp/SettingsModuleRail";
import { eventLabel, formatDateTime } from "../settings-labels";

type WebhookRow = {
  id: number;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastDeliveryAt?: string | null;
  lastStatusCode?: number | null;
  secret?: string | null;
  _count?: { deliveries: number };
};

type DlqRow = {
  id: number;
  event: string;
  status: string;
  attempts: number;
  responseCode?: number | null;
  responseBody?: string | null;
  createdAt: string;
  webhook?: { id: number; name: string; url: string };
};

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid var(--border)", minHeight: 40, boxSizing: "border-box",
  borderRadius: 8, background: "var(--surface)", color: "var(--foreground)",
};

function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function statusTone(code?: number | null): "positive" | "warning" | "danger" | "neutral" {
  if (code == null) return "neutral";
  if (code >= 200 && code < 300) return "positive";
  if (code >= 400 && code < 500) return "warning";
  return "danger";
}

export default function WebhooksSettingsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const canManage = Boolean(user?.isSuperAdmin || user?.permissions?.includes("console.admin") || user?.permissions?.includes("company.settings.manage"));

  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [dlq, setDlq] = useState<DlqRow[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[] });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replaying, setReplaying] = useState<number | null>(null);
  const [busyHook, setBusyHook] = useState<number | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [list, cat, dead] = await Promise.all([
        apiFetch("webhooks", token),
        apiFetch("webhooks/catalog", token).catch(() => ({ events: [] })),
        apiFetch("webhooks/dlq", token).catch(() => []),
      ]);
      setHooks(Array.isArray(list) ? list : []);
      setCatalog(Array.isArray(cat?.events) ? cat.events : []);
      setDlq(Array.isArray(dead) ? dead : []);
      setLoaded(true);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar los avisos automáticos."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const sortedCatalog = useMemo(
    () => [...catalog].sort((a, b) => eventLabel(a).localeCompare(eventLabel(b), "es")),
    [catalog],
  );

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((x) => x !== ev) : [...f.events, ev],
    }));
  };

  const nameError = touched && !form.name.trim() ? "Escribe un nombre." : null;
  const urlError = touched
    ? (!form.url.trim() ? "Escribe la dirección que recibirá los avisos." : !isValidUrl(form.url) ? "La dirección debe empezar con https://" : null)
    : null;
  const eventsError = touched && !form.events.length ? "Elige al menos un evento." : null;

  const create = async () => {
    setTouched(true);
    if (!form.name.trim() || !isValidUrl(form.url) || !form.events.length) return;
    setSaving(true);
    try {
      await apiFetch("webhooks", token, { method: "POST", body: JSON.stringify({ ...form, url: form.url.trim() }) });
      setForm({ name: "", url: "", events: [] });
      setTouched(false);
      toast.success("Aviso automático creado");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo crear el aviso"));
    } finally {
      setSaving(false);
    }
  };

  const test = async (id: number) => {
    setBusyHook(id);
    try {
      await apiFetch(`webhooks/${id}/test`, token, { method: "POST", body: "{}" });
      toast.success("Prueba enviada: revisa tu sistema en unos segundos");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo enviar la prueba"));
    } finally {
      setBusyHook(null);
    }
  };

  const toggleActive = async (h: WebhookRow) => {
    setBusyHook(h.id);
    try {
      await apiFetch(`webhooks/${h.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !h.isActive }),
      });
      toast.success(h.isActive ? "Aviso pausado" : "Aviso reactivado");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo actualizar"));
    } finally {
      setBusyHook(null);
    }
  };

  const remove = (h: WebhookRow) => {
    setConfirmState({
      title: "Eliminar aviso automático",
      message: `«${h.name}» dejará de recibir eventos y se borrará su historial de entregas.`,
      confirmLabel: "Eliminar",
      danger: true,
      fn: async () => {
        try {
          await apiFetch(`webhooks/${h.id}`, token, { method: "DELETE" });
          toast.success("Aviso eliminado");
          void load();
        } catch (e) {
          toast.error(formatApiError(e, "No se pudo eliminar"));
        }
      },
    });
  };

  const replay = async (deliveryId: number) => {
    setReplaying(deliveryId);
    try {
      await apiFetch(`webhooks/deliveries/${deliveryId}/replay`, token, { method: "POST", body: "{}" });
      toast.success("Reenvío programado");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo reenviar"));
    } finally {
      setReplaying(null);
    }
  };

  if (!canManage) {
    return (
      <EmptyState
        variant="page"
        icon="🔒"
        title="Sin permiso"
        description="Solo los administradores de la empresa pueden gestionar avisos automáticos."
      />
    );
  }

  const initialLoading = loading && !loaded;
  const activeCount = hooks.filter((h) => h.isActive).length;
  const failing = hooks.filter((h) => h.failureCount > 0).length;

  return (
    <>
      <PageHeader
        eyebrow="Gobierno · Configuración"
        title="Avisos automáticos (webhooks)"
        subtitle="Envía eventos firmados a tus otros sistemas en cuanto ocurren: facturas, inventario, tickets, cuentas y más."
        density="ops"
        actions={
          <Button variant="secondary" iconLeft="↻" loading={loading && loaded} onClick={() => void load()}>
            Actualizar
          </Button>
        }
      />
      <SettingsModuleRail />

      {error && (
        <InlineAlert
          variant={loaded ? "warning" : "danger"}
          title={loaded ? "No se pudo actualizar" : "No se pudieron cargar los avisos"}
          message={loaded ? `${error} Mostramos la última información cargada.` : error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      {loaded && (
        <div style={{ marginBottom: 20 }}>
          <MetricStrip
            ariaLabel="Resumen de avisos"
            metrics={[
              { label: "Destinos activos", value: activeCount, hint: `${hooks.length} en total` },
              { label: "Con fallos recientes", value: failing, tone: failing ? "warning" : "success" },
              { label: "Entregas fallidas", value: dlq.length, tone: dlq.length ? "danger" : "success", hint: dlq.length ? "Puedes reenviarlas abajo" : "Sin pendientes" },
            ]}
          />
        </div>
      )}

      <Section title="Nuevo aviso" subtitle="Indica a dónde enviar los eventos y cuáles te interesan.">
        <div style={{ display: "grid", gap: 14, maxWidth: 720 }}>
          <FormGrid>
            <FormField label="Nombre" error={nameError} hint="Ej. Contabilidad externa">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inp} aria-invalid={!!nameError} />
            </FormField>
            <FormField label="Dirección de destino" error={urlError}>
              <input
                type="url"
                inputMode="url"
                placeholder="https://api.tu-sistema.com/nexara"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                onBlur={() => form.url && setTouched(true)}
                style={inp}
                aria-invalid={!!urlError}
                autoCapitalize="off"
                spellCheck={false}
              />
            </FormField>
          </FormGrid>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, display: "flex", gap: 10, alignItems: "center" }}>
              Eventos
              {form.events.length > 0 && (
                <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>
                  {form.events.length} {form.events.length === 1 ? "elegido" : "elegidos"}
                </span>
              )}
            </legend>
            {initialLoading ? (
              <SkeletonList rows={2} />
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {sortedCatalog.map((ev) => {
                  const on = form.events.includes(ev);
                  return (
                    <button
                      key={ev}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleEvent(ev)}
                      style={{
                        border: `1px solid ${on ? "color-mix(in srgb, var(--primary) 60%, var(--border))" : "var(--border)"}`,
                        borderRadius: 999,
                        padding: "6px 12px",
                        minHeight: 36,
                        fontSize: 13,
                        cursor: "pointer",
                        background: on ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
                        color: on ? "var(--primary)" : "var(--foreground)",
                        fontWeight: on ? 600 : 500,
                      }}
                    >
                      {on ? "✓ " : ""}{eventLabel(ev)}
                    </button>
                  );
                })}
              </div>
            )}
            {eventsError && <p role="alert" style={{ margin: "6px 0 0", fontSize: 12, color: "var(--state-danger-text)" }}>{eventsError}</p>}
          </fieldset>
          <div>
            <Button variant="primary" onClick={() => void create()} loading={saving} disabled={initialLoading}>
              Crear aviso
            </Button>
          </div>
        </div>
      </Section>

      <Section title={`Destinos${loaded ? ` (${hooks.length})` : ""}`}>
        {initialLoading && !error && <SkeletonList rows={3} />}
        {loaded && !hooks.length && (
          <EmptyState
            variant="compact"
            icon="🔗"
            title="Aún no hay destinos"
            description="Crea un aviso arriba para recibir, por ejemplo, facturas pagadas o inventario bajo."
          />
        )}
        <ul style={{ display: "flex", flexDirection: "column", gap: 12, listStyle: "none", margin: 0, padding: 0 }}>
          {hooks.map((h) => (
            <li key={h.id} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 320px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 14 }}>{h.name}</strong>
                    <Tag variant={h.isActive ? "positive" : "neutral"} size="sm" dot>{h.isActive ? "Activo" : "En pausa"}</Tag>
                    {h.failureCount > 0 && <Tag variant="warning" size="sm">{h.failureCount} {h.failureCount === 1 ? "fallo" : "fallos"}</Tag>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", wordBreak: "break-all", marginTop: 2 }}>{h.url}</div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span>{h.lastDeliveryAt ? `Último envío ${formatDateTime(h.lastDeliveryAt)}` : "Sin envíos todavía"}</span>
                    {h.lastStatusCode != null && (
                      <Tag variant={statusTone(h.lastStatusCode)} size="sm">Respuesta {h.lastStatusCode}</Tag>
                    )}
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{(h._count?.deliveries ?? 0).toLocaleString("es-MX")} entregas</span>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {h.events.map((ev) => <Tag key={ev} variant="accent" size="sm">{eventLabel(ev)}</Tag>)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <Button size="sm" variant="secondary" loading={busyHook === h.id} onClick={() => void test(h.id)}>Enviar prueba</Button>
                  <Button size="sm" variant="ghost" disabled={busyHook === h.id} onClick={() => void toggleActive(h)}>{h.isActive ? "Pausar" : "Reactivar"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(h)} style={{ color: "var(--danger)" }}>Eliminar</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={`Entregas fallidas${loaded ? ` (${dlq.length})` : ""}`}
        subtitle="Eventos que no se pudieron entregar tras varios intentos. Corrige el destino y reenvíalos."
      >
        {loaded && !dlq.length && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>No hay entregas pendientes. Todo se entregó correctamente.</p>
        )}
        <ul style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none", margin: 0, padding: 0 }}>
          {dlq.map((d) => (
            <li
              key={d.id}
              style={{
                padding: 12, border: "1px solid var(--border)", borderLeft: "3px solid var(--danger)", borderRadius: 10,
                display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", background: "var(--surface)",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 300px" }}>
                <strong style={{ fontSize: 13.5 }}>{eventLabel(d.event)}</strong>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {d.webhook?.name ?? "Destino eliminado"} · {d.attempts} {d.attempts === 1 ? "intento" : "intentos"}
                  {d.responseCode != null ? ` · respuesta ${d.responseCode}` : " · sin respuesta"} · {formatDateTime(d.createdAt)}
                </div>
                {d.responseBody ? (
                  <div
                    title={d.responseBody}
                    style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4, maxWidth: 560, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {d.responseBody}
                  </div>
                ) : null}
              </div>
              <Button size="sm" variant="secondary" loading={replaying === d.id} onClick={() => void replay(d.id)}>
                Reenviar
              </Button>
            </li>
          ))}
        </ul>
      </Section>
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
