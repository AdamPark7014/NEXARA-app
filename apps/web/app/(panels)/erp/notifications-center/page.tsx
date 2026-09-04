"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Socket } from "socket.io-client";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { Tag } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import PanelTabs from "@/components/ui/PanelTabs";
import { useUser } from "@/components/UserContext";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { normalizeLegacyRelatedUrl } from "@/lib/legacy-path-remap";
import { toast } from "@/components/Toast";
import { fetchActivityFeed, type ActivityFeedItem } from "@/lib/activity-feed-api";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import {
  detectCurrentPanelId,
  isCrossPanelHref,
  resolveCrossPanelHref,
} from "@/lib/cross-panel-handoff";

interface Notif {
  id: number;
  title: string;
  message: string;
  category: string;
  priority: string | null;
  isRead: boolean;
  createdAt: string;
  relatedUrl?: string | null;
}

type ViewMode = "action" | "notifications" | "feed";
type CategoryFilter = "all" | "ops" | "sales" | "erp" | "other";

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Hace un momento";
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  return `Hace ${Math.floor(h / 24)}d`;
}

function bucketCategory(category: string): CategoryFilter {
  const c = category.toLowerCase();
  if (c.includes("sla") || c === "activity" || c === "activities" || c === "noc" || c === "evidence") return "ops";
  if (c.includes("quote") || c === "crm" || c === "sales") return "sales";
  if (c === "erp" || c.includes("purchase") || c.includes("stock") || c === "finance" || c === "approval") return "erp";
  return "other";
}

function isActionable(n: Notif): boolean {
  if (n.isRead) return false;
  if (n.priority === "high") return true;
  const b = bucketCategory(n.category);
  return b === "ops" || b === "sales" || b === "erp";
}

const CATEGORY_LABEL: Record<string, string> = {
  attendance: "Asistencia",
  activity: "OT",
  activities: "OT",
  tool: "Herramientas",
  finance: "Finanzas",
  noc: "NOC",
  crm: "CRM",
  approval: "Aprobación",
  evidence: "Evidencias",
  sales: "Ventas",
  quotes: "Cotizaciones",
  "sla-alert": "SLA",
  "sla-breach": "SLA",
  erp: "ERP",
  confirmations: "Confirmación",
};

export default function NotificationsCenterPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const socketRef = useRef<Socket | null>(null);

  const initialView: ViewMode =
    searchParams.get("view") === "feed"
      ? "feed"
      : searchParams.get("view") === "all"
        ? "notifications"
        : "action";
  const [view, setView] = useState<ViewMode>(initialView);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [feed, setFeed] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "feed") setView("feed");
    else if (v === "all") setView("notifications");
    else setView("action");
  }, [searchParams]);

  const loadNotifs = useCallback(async () => {
    if (!token) return;
    const data = await apiFetch("notifications?limit=80", token);
    setNotifs(Array.isArray(data) ? data : (data.data ?? []));
  }, [token]);

  const loadFeed = useCallback(async () => {
    if (!token) return;
    const data = await fetchActivityFeed(token, 60);
    setFeed(data.items);
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await loadNotifs();
      if (view === "feed") await loadFeed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, view, loadNotifs, loadFeed]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const socket = createRealtimeSocket(getSocketBaseUrl(), { auth: { token } });
    socketRef.current = socket;

    socket.on("notification:new", (payload: Notif) => {
      setNotifs((prev) => [payload, ...prev.filter((n) => n.id !== payload.id)]);
    });
    socket.on("notification:read", (payload: { id: number }) => {
      setNotifs((prev) => prev.map((n) => (n.id === payload.id ? { ...n, isRead: true } : n)));
    });
    socket.on("notifications:read-all", () => {
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (view === "feed" && token) void loadFeed();
  }, [view, token, loadFeed]);

  const markRead = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`notifications/${id}/read`, token, { method: "PATCH" });
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch (e: unknown) {
      toast.error("No se pudo marcar como leída: " + (e instanceof Error ? e.message : "error"));
    }
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      await apiFetch("notifications/read/all", token, { method: "PATCH" });
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (e: unknown) {
      toast.error("No se pudieron marcar todas: " + (e instanceof Error ? e.message : "error"));
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`notifications/${id}`, token, { method: "DELETE" });
      setNotifs((prev) => prev.filter((n) => n.id !== id));
    } catch (e: unknown) {
      toast.error("No se pudo eliminar: " + (e instanceof Error ? e.message : "error"));
    }
  };

  const openPath = (path: string) => {
    const normalized = normalizeLegacyRelatedUrl(path);
    const current = detectCurrentPanelId();
    const userJson = user ? JSON.stringify(user) : null;
    if (isCrossPanelHref(normalized, current)) {
      window.location.assign(resolveCrossPanelHref(normalized, userJson, current));
      return;
    }
    const local = resolveCrossPanelHref(normalized, null, current);
    router.push(local);
  };

  const openNotif = (n: Notif) => {
    if (!n.isRead) void markRead(n.id);
    if (n.relatedUrl) openPath(n.relatedUrl);
  };

  const unread = notifs.filter((n) => !n.isRead).length;
  const actionable = useMemo(() => notifs.filter(isActionable), [notifs]);

  const sortedNotifs = useMemo(() => {
    const base =
      view === "action"
        ? actionable
        : category === "all"
          ? notifs
          : notifs.filter((n) => bucketCategory(n.category) === category);
    return [...base].sort((a, b) => {
      const pa = a.priority === "high" ? 0 : a.isRead ? 2 : 1;
      const pb = b.priority === "high" ? 0 : b.isRead ? 2 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [view, actionable, notifs, category]);

  const highCount = notifs.filter((n) => !n.isRead && n.priority === "high").length;

  return (
    <>
      <PageHeader
        eyebrow="NEXARA · Decisiones"
        title="Centro de notificaciones"
        subtitle="Prioriza SLA, cotizaciones y OC — no ruido. Inbox personal + feed de señales de negocio."
        actions={
          unread > 0 ? (
            <Button variant="secondary" onClick={markAllRead}>
              Marcar todas leídas ({unread})
            </Button>
          ) : undefined
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div style={kpiBox}>
          <div style={kpiLabel}>Sin leer</div>
          <div style={kpiValue}>{loading ? "…" : unread}</div>
        </div>
        <div style={kpiBox}>
          <div style={kpiLabel}>Acción ahora</div>
          <div style={{ ...kpiValue, color: actionable.length ? "var(--warning)" : "var(--text-primary)" }}>
            {loading ? "…" : actionable.length}
          </div>
        </div>
        <div style={kpiBox}>
          <div style={kpiLabel}>Prioridad alta</div>
          <div style={{ ...kpiValue, color: highCount ? "var(--danger)" : "var(--text-primary)" }}>
            {loading ? "…" : highCount}
          </div>
        </div>
      </div>

      <PanelTabs
        ariaLabel="Vistas de notificaciones"
        value={view}
        onChange={setView}
        tabs={[
          { key: "action", label: "Acción ahora", badge: actionable.length || undefined },
          { key: "notifications", label: "Inbox", badge: unread || undefined },
          { key: "feed", label: "Señales de negocio" },
        ]}
      />

      {view === "notifications" && (
        <PanelTabs
          ariaLabel="Filtro por dominio"
          value={category}
          onChange={setCategory}
          tabs={[
            { key: "all", label: "Todas" },
            { key: "ops", label: "Ops / SLA" },
            { key: "sales", label: "CRM / Cotiz." },
            { key: "erp", label: "ERP / OC" },
            { key: "other", label: "Otras" },
          ]}
        />
      )}

      <Section
        title={
          view === "feed"
            ? "Señales accionables (OT, tickets, cotizaciones, OC)"
            : view === "action"
              ? loading
                ? "Cargando…"
                : `${actionable.length} requieren decisión`
              : loading
                ? "Cargando…"
                : `${unread} sin leer`
        }
      >
        {error && (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: "color-mix(in srgb, var(--danger) 10%, transparent)",
              color: "var(--danger)",
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {(view === "action" || view === "notifications") && (
          <>
            {!loading && sortedNotifs.length === 0 && !error && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-tertiary)", fontSize: 13 }}>
                {view === "action" ? "Nada urgente en tu bandeja." : "Sin notificaciones."}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortedNotifs.map((n) => (
                <article
                  key={n.id}
                  onClick={() => n.relatedUrl && openNotif(n)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    alignItems: "start",
                    padding: "10px 12px",
                    cursor: n.relatedUrl ? "pointer" : "default",
                    background: !n.isRead
                      ? "color-mix(in srgb, var(--primary) 5%, transparent)"
                      : "var(--surface)",
                    border: "1px solid var(--nx-panel-hairline, var(--border))",
                    borderLeft:
                      n.priority === "high"
                        ? "3px solid var(--danger)"
                        : !n.isRead
                          ? "3px solid var(--panel-accent, var(--primary))"
                          : "1px solid var(--nx-panel-hairline, var(--border))",
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: !n.isRead ? 700 : 550, fontSize: 13 }}>{n.title}</span>
                      {n.priority === "high" && <Tag variant="danger">Alta</Tag>}
                      <Tag variant="neutral">{CATEGORY_LABEL[n.category] ?? n.category}</Tag>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3, lineHeight: 1.35 }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                      {timeAgo(n.createdAt)}
                      {n.relatedUrl ? " · Abrir →" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void markRead(n.id);
                        }}
                        title="Marcar como leída"
                        style={iconBtn}
                      >
                        ✓
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(n.id);
                      }}
                      title="Eliminar"
                      style={iconBtn}
                    >
                      ✕
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {view === "feed" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {loading && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                Cargando señales…
              </div>
            )}
            {!loading && feed.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-tertiary)", fontSize: 13 }}>
                Sin señales de negocio en tu alcance.
              </div>
            )}
            {feed.map((item) => (
              <article
                key={item.id}
                onClick={() => item.deepLink && openPath(item.deepLink)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  padding: "10px 12px",
                  cursor: item.deepLink ? "pointer" : "default",
                  background: "var(--surface)",
                  border: "1px solid var(--nx-panel-hairline, var(--border))",
                  borderLeft:
                    item.priority === "high"
                      ? "3px solid var(--danger)"
                      : "1px solid var(--nx-panel-hairline, var(--border))",
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 650, fontSize: 13 }}>{item.title}</span>
                    {item.priority === "high" && <Tag variant="danger">Alta</Tag>}
                    <Tag variant="neutral">{item.kind}</Tag>
                  </div>
                  {item.subtitle && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>{item.subtitle}</div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                    {timeAgo(item.at)}
                    {item.actorName && <> · {item.actorName}</>}
                    {item.deepLink ? " · Abrir →" : ""}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

const kpiBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--nx-panel-hairline, var(--border))",
  background: "var(--surface)",
};

const kpiLabel: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
};

const kpiValue: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 750,
  fontVariantNumeric: "tabular-nums",
  marginTop: 2,
  letterSpacing: "-0.02em",
};

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  color: "var(--text-tertiary)",
  padding: "2px 6px",
};
