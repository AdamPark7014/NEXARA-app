"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Socket } from "socket.io-client";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { Tag } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { normalizeLegacyPath } from "@/lib/legacy-path-remap";
import { toast } from "@/components/Toast";
import KpiCard from "@/components/ui/KpiCard";
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

type ViewMode = "notifications" | "feed";

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

const CATEGORY_ICON: Record<string, string> = {
  attendance: "🕐", activity: "🧰", tool: "🔧", finance: "💸",
  noc: "🚨", crm: "✨", approval: "🛡️", evidence: "📸", default: "🔔",
};

export default function NotificationsCenterPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const socketRef = useRef<Socket | null>(null);

  const initialView = searchParams.get("view") === "feed" ? "feed" : "notifications";
  const [view, setView] = useState<ViewMode>(initialView);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [feed, setFeed] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const v = searchParams.get("view") === "feed" ? "feed" : "notifications";
    setView(v);
  }, [searchParams]);

  const loadNotifs = useCallback(async () => {
    if (!token) return;
    const data = await apiFetch("notifications?limit=50", token);
    setNotifs(Array.isArray(data) ? data : (data.data ?? []));
  }, [token]);

  const loadFeed = useCallback(async () => {
    if (!token) return;
    const data = await fetchActivityFeed(token, 50);
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
      setNotifs((prev) => prev.map((n) => n.id === payload.id ? { ...n, isRead: true } : n));
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
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
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
    const normalized =
      normalizeLegacyPath(path.split("?")[0]) +
      (path.includes("?") ? "?" + path.split("?").slice(1).join("?") : "");
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
    background: "transparent",
    color: active ? "var(--primary)" : "var(--text-secondary)",
    fontFamily: "inherit",
  });

  return (
    <>
      <PageHeader
        eyebrow="NEXARA · Comunicación"
        title="Centro de notificaciones"
        subtitle="Alertas personales y feed operacional de la empresa en un solo lugar."
        actions={
          unread > 0 ? (
            <Button variant="secondary" onClick={markAllRead}>
              Marcar todas leídas ({unread})
            </Button>
          ) : undefined
        }
      />

      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid var(--border)" }}>
        <button type="button" style={tabStyle(view === "notifications")} onClick={() => setView("notifications")}>
          Notificaciones {unread > 0 ? `(${unread})` : ""}
        </button>
        <button type="button" style={tabStyle(view === "feed")} onClick={() => setView("feed")}>
          Actividad global
        </button>
      </div>

      {view === "notifications" && !loading && notifs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 18 }}>
          <KpiCard label="Total" value={notifs.length} icon="🔔" />
          <KpiCard label="Sin leer" value={unread} icon="📬" variant={unread > 0 ? "warning" : "positive"} />
          <KpiCard label="Leídas" value={notifs.length - unread} icon="✅" variant="positive" />
        </div>
      )}

      {view === "feed" && !loading && feed.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <KpiCard label="Eventos recientes" value={feed.length} icon="📡" variant="accent" />
        </div>
      )}

      <Section title={view === "notifications" ? (loading ? "Cargando…" : `${unread} sin leer`) : "Actividad de la plataforma"}>
        {error && (
          <div style={{ padding: 14, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", marginBottom: 12 }}>
            {error}
          </div>
        )}

        {view === "notifications" && (
          <>
            {!loading && notifs.length === 0 && !error && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-tertiary)" }}>
                Sin notificaciones 🎉
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {notifs.map((n) => (
                <article
                  key={n.id}
                  onClick={() => n.relatedUrl && openNotif(n)}
                  style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, alignItems: "center",
                    padding: 14,
                    cursor: n.relatedUrl ? "pointer" : "default",
                    background: !n.isRead ? "color-mix(in srgb, var(--primary) 5%, transparent)" : "var(--surface)",
                    border: "1px solid var(--border)",
                    borderLeft: !n.isRead ? "3px solid var(--primary)" : "1px solid var(--border)",
                    borderRadius: 12,
                  }}
                >
                  <span style={{ fontSize: 22 }}>{CATEGORY_ICON[n.category] ?? CATEGORY_ICON.default}</span>
                  <div>
                    <div style={{ fontWeight: !n.isRead ? 700 : 500, fontSize: 13 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{n.message}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                      {timeAgo(n.createdAt)} · <Tag variant="neutral">{n.category}</Tag>
                    </div>
                  </div>
                  {!n.isRead && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void markRead(n.id); }}
                      title="Marcar como leída"
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--primary)" }}
                    >
                      ✓
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); void remove(n.id); }}
                    title="Eliminar"
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-tertiary)" }}
                  >
                    ✕
                  </button>
                </article>
              ))}
            </div>
          </>
        )}

        {view === "feed" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {loading && <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando feed…</div>}
            {!loading && feed.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-tertiary)" }}>
                Sin actividad reciente en tu tenant.
              </div>
            )}
            {feed.map((item) => (
              <article
                key={item.id}
                onClick={() => item.deepLink && openPath(item.deepLink)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 14,
                  padding: 14,
                  cursor: item.deepLink ? "pointer" : "default",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              >
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                  {item.subtitle && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{item.subtitle}</div>}
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                    {timeAgo(item.at)}
                    {item.actorName && <> · {item.actorName}</>}
                    · <Tag variant="neutral">{item.kind}</Tag>
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
