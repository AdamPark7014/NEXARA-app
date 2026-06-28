"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { Tag } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { normalizeLegacyPath } from "@/lib/legacy-path-remap";

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
  if (m < 1)  return "Hace un momento";
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

  const [notifs, setNotifs]   = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch("notifications?limit=50", token);
      setNotifs(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`notifications/${id}/read`, token, { method: "PATCH" });
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (e: unknown) {
      window.alert("No se pudo marcar como leída: " + (e instanceof Error ? e.message : "error"));
    }
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      await apiFetch("notifications/read-all", token, { method: "PATCH" });
      setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (e: unknown) {
      window.alert("No se pudieron marcar todas: " + (e instanceof Error ? e.message : "error"));
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`notifications/${id}`, token, { method: "DELETE" });
      setNotifs(prev => prev.filter(n => n.id !== id));
    } catch (e: unknown) {
      window.alert("No se pudo eliminar: " + (e instanceof Error ? e.message : "error"));
    }
  };

  const openNotif = (n: Notif) => {
    if (!n.isRead) void markRead(n.id);
    if (n.relatedUrl) {
      const path = normalizeLegacyPath(n.relatedUrl.split("?")[0]) + (n.relatedUrl.includes("?") ? "?" + n.relatedUrl.split("?").slice(1).join("?") : "");
      router.push(path);
    }
  };

  const unread = notifs.filter(n => !n.isRead).length;

  return (
    <>
      <PageHeader
        eyebrow="ERP · Auditoría"
        title="Centro de notificaciones"
        subtitle="Todo lo que el sistema y los compañeros te están avisando, en un solo lugar."
        actions={
          unread > 0 ? (
            <Button variant="secondary" onClick={markAllRead}>
              Marcar todas leídas ({unread})
            </Button>
          ) : undefined
        }
      />

      <Section
        title={loading ? "Cargando…" : `${unread} sin leer`}
        subtitle="Notificaciones recientes"
      >
        {error && (
          <div style={{ padding: 14, borderRadius: 10, background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", marginBottom: 12 }}>
            {error}
          </div>
        )}

        {!loading && notifs.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-tertiary)" }}>
            Sin notificaciones 🎉
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notifs.map(n => (
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
              <span style={{ fontSize: 22 }}>
                {CATEGORY_ICON[n.category] ?? CATEGORY_ICON.default}
              </span>
              <div>
                <div style={{ fontWeight: !n.isRead ? 700 : 500, fontSize: 13 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{n.message}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                  {timeAgo(n.createdAt)} · <Tag variant="neutral">{n.category}</Tag>
                  {n.priority === "high" && <> · <Tag variant="danger">ALTA</Tag></>}
                  {n.relatedUrl && <> · <span style={{ color: "var(--primary)" }}>Abrir →</span></>}
                </div>
              </div>

              {!n.isRead && (
                <button
                  onClick={(e) => { e.stopPropagation(); void markRead(n.id); }}
                  title="Marcar como leída"
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--primary)", padding: "4px 8px" }}
                >
                  ✓
                </button>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); void remove(n.id); }}
                title="Eliminar notificación"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-tertiary)", padding: "4px 8px" }}
              >
                ✕
              </button>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
