"use client";

/**
 * ERP · Outbound Webhooks — integraciones enterprise
 */

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";
import { DashPill } from "@/components/dashboard/DashKit";
import SettingsModuleRail from "@/components/erp/SettingsModuleRail";

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

export default function WebhooksSettingsPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const canManage = Boolean(user?.isSuperAdmin || user?.permissions?.includes("console.admin") || user?.permissions?.includes("company.settings.manage"));

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

  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [dlq, setDlq] = useState<DlqRow[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [replaying, setReplaying] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [list, cat, dead] = await Promise.all([
        apiFetch("webhooks", token),
        apiFetch("webhooks/catalog", token).catch(() => ({ events: [] })),
        apiFetch("webhooks/dlq", token).catch(() => []),
      ]);
      setHooks(Array.isArray(list) ? list : []);
      setCatalog(Array.isArray(cat?.events) ? cat.events : []);
      setDlq(Array.isArray(dead) ? dead : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar webhooks");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((x) => x !== ev) : [...f.events, ev],
    }));
  };

  const create = async () => {
    if (!form.name.trim() || !form.url.trim() || !form.events.length) {
      toast.error("Nombre, URL y al menos un evento son requeridos");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("webhooks", token, { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", url: "", events: [] });
      toast.success("Webhook creado");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  const test = async (id: number) => {
    try {
      await apiFetch(`webhooks/${id}/test`, token, { method: "POST", body: "{}" });
      toast.success("Ping encolado");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test falló");
    }
  };

  const toggleActive = async (h: WebhookRow) => {
    try {
      await apiFetch(`webhooks/${h.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !h.isActive }),
      });
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  };

  const remove = async (id: number) => {
    try {
      await apiFetch(`webhooks/${id}`, token, { method: "DELETE" });
      toast.success("Eliminado");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  const replay = async (deliveryId: number) => {
    setReplaying(deliveryId);
    try {
      await apiFetch(`webhooks/deliveries/${deliveryId}/replay`, token, { method: "POST", body: "{}" });
      toast.success("Reintento encolado");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Replay falló");
    } finally {
      setReplaying(null);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
    borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13,
  };

  if (!canManage) {
    return <EmptyState title="Sin permiso" description="Solo administradores pueden gestionar webhooks." />;
  }

  return (
    <>
      <PageHeader
        eyebrow="ERP · Gobierno"
        title="Webhooks salientes"
        subtitle="Eventos firmados HMAC hacia tus sistemas (facturas, stock, SLA, IAM)."
        density="ops"
        actions={<Button variant="ghost" onClick={() => void load()}>Actualizar</Button>}
      />
      <SettingsModuleRail />

      {loading ? (
        <EmptyState title="Cargando…" description="Webhooks y catálogo de eventos." />
      ) : (
        <>
          <Section title="Nuevo webhook">
            <div style={{ display: "grid", gap: 12, maxWidth: 640 }}>
              <input placeholder="Nombre" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inp} />
              <input placeholder="https://api.tu-sistema.com/nexara" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} style={inp} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {catalog.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggleEvent(ev)}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      background: form.events.includes(ev) ? "var(--primary)" : "var(--surface)",
                      color: form.events.includes(ev) ? "#fff" : "var(--foreground)",
                    }}
                  >
                    {ev}
                  </button>
                ))}
              </div>
              <Button variant="primary" onClick={() => void create()} disabled={saving}>
                {saving ? "Guardando…" : "Crear webhook"}
              </Button>
            </div>
          </Section>

          <Section title={`Dead letter (${dlq.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dlq.map((d) => (
                <div key={d.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ fontSize: 13 }}>{d.event}</strong>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      {d.webhook?.name ?? `hook #${d.webhook?.id}`} · intentos {d.attempts}
                      {d.responseCode != null ? ` · HTTP ${d.responseCode}` : ""}
                    </div>
                    {d.responseBody ? (
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.responseBody}
                      </div>
                    ) : null}
                  </div>
                  <Button size="sm" variant="secondary" disabled={replaying === d.id} onClick={() => void replay(d.id)}>
                    {replaying === d.id ? "Reintentando…" : "Replay"}
                  </Button>
                </div>
              ))}
              {!dlq.length && (
                <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin entregas fallidas — cola limpia.</span>
              )}
            </div>
          </Section>

          <Section title={`${hooks.length} endpoints`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {hooks.map((h) => (
                <div key={h.id} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong>{h.name}</strong>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", wordBreak: "break-all" }}>{h.url}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {h.events.map((ev) => <DashPill key={ev} tone="accent">{ev}</DashPill>)}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <Tag variant={h.isActive ? "positive" : "danger"}>{h.isActive ? "Activo" : "Off"}</Tag>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        fallos {h.failureCount} · deliveries {h._count?.deliveries ?? 0}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" variant="secondary" onClick={() => void test(h.id)}>Test</Button>
                        <Button size="sm" variant="ghost" onClick={() => void toggleActive(h)}>{h.isActive ? "Pausar" : "Activar"}</Button>
                        <Button size="sm" variant="ghost" onClick={() => void remove(h.id)}>Eliminar</Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!hooks.length && (
                <EmptyState
                  variant="compact"
                  title="Sin webhooks"
                  description="Crea un endpoint arriba para recibir invoice.paid, stock.low, ticket.sla_breach y más."
                />
              )}
            </div>
          </Section>
        </>
      )}
    </>
  );
}
