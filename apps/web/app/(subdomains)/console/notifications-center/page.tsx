"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Notification = {
  id: number;
  title: string;
  message: string;
  category: string;
  type?: string;
  isRead: boolean;
  link?: string | null;
  metadata?: any;
  createdAt: string;
};

const CATEGORY_ICONS: Record<string, string> = {
  SALES: "💼",
  PROJECT: "🏗️",
  ACTIVITY: "🛠️",
  CONTACT: "📬",
  INVOICE: "💵",
  MAINTENANCE: "🔧",
  TENDER: "📋",
  SYSTEM: "⚙️",
  USER: "👤",
  CRM: "🧠",
};

export default function NotificationsCenterPage() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<"all" | "unread">("all");

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const [n, s] = await Promise.all([
        fetch(buildApiUrl(`notifications?limit=100`), { headers: { Authorization: `Bearer ${user.token}` } }).then((r) => r.json()),
        fetch(buildApiUrl(`notifications/stats`), { headers: { Authorization: `Bearer ${user.token}` } }).then((r) => r.ok ? r.json() : null),
      ]);
      setNotifications(Array.isArray(n) ? n : n.notifications || []);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const markRead = async (id: number) => {
    await fetch(buildApiUrl(`notifications/${id}/read`), { method: "PATCH", headers: { Authorization: `Bearer ${user?.token}` } });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const markAllRead = async () => {
    await fetch(buildApiUrl(`notifications/read/all`), { method: "PATCH", headers: { Authorization: `Bearer ${user?.token}` } });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const deleteN = async (id: number) => {
    await fetch(buildApiUrl(`notifications/${id}`), { method: "DELETE", headers: { Authorization: `Bearer ${user?.token}` } });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const categories = Array.from(new Set(notifications.map((n) => n.category)));
  const filtered = notifications.filter((n) => {
    if (filter !== "all" && n.category !== filter) return false;
    if (readFilter === "unread" && n.isRead) return false;
    return true;
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🔔 Centro de notificaciones</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Todas tus alertas y mensajes en un solo lugar.
          </p>
        </div>
        <button type="button" onClick={markAllRead} className="button-primary">
          ✓ Marcar todas como leídas
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginTop: 16 }}>
        <Kpi label="Total" value={notifications.length} color="#6b7280" />
        <Kpi label="No leídas" value={notifications.filter((n) => !n.isRead).length} color="#dc2626" />
        <Kpi label="Categorías" value={categories.length} color="#3b82f6" />
        <Kpi label="Hoy" value={notifications.filter((n) => new Date(n.createdAt).toDateString() === new Date().toDateString()).length} color="#16a34a" />
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>Todas ({notifications.length})</Pill>
        {categories.map((c) => (
          <Pill key={c} active={filter === c} onClick={() => setFilter(c)}>
            {CATEGORY_ICONS[c] || "•"} {c} ({notifications.filter((n) => n.category === c).length})
          </Pill>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <Pill active={readFilter === "all"} onClick={() => setReadFilter("all")}>Todas</Pill>
          <Pill active={readFilter === "unread"} onClick={() => setReadFilter("unread")}>Sin leer</Pill>
        </div>
      </div>

      {loading ? <p>Cargando…</p> : filtered.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", textAlign: "center", marginTop: 32 }}>
          🎉 No tienes notificaciones {readFilter === "unread" ? "sin leer" : ""}.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((n) => (
            <div key={n.id} style={{
              padding: 14,
              background: n.isRead ? "var(--bg-secondary)" : "var(--bg-primary)",
              border: `1px solid var(--border)`,
              borderLeft: `4px solid ${n.isRead ? "#6b7280" : "#0ea5e9"}`,
              borderRadius: 8,
              opacity: n.isRead ? 0.7 : 1,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                    {CATEGORY_ICONS[n.category] || "•"} {n.category}
                  </div>
                  <strong style={{ fontSize: 14 }}>{n.title}</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{n.message}</p>
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                    {new Date(n.createdAt).toLocaleString("es-MX")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {!n.isRead && (
                    <button type="button" onClick={() => markRead(n.id)} style={{ ...btnSmall, background: "#16a34a" }}>✓</button>
                  )}
                  {n.link && (
                    <a href={n.link} style={{ ...btnSmall, background: "#3b82f6", textDecoration: "none", display: "inline-block" }}>↗</a>
                  )}
                  <button type="button" onClick={() => deleteN(n.id)} style={{ ...btnSmall, background: "#dc2626" }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 10, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} style={{ padding: "6px 12px", borderRadius: 999, border: "none", background: active ? "var(--primary)" : "var(--bg-secondary)", color: active ? "#fff" : "var(--text-primary)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{children}</button>;
}
const btnSmall: React.CSSProperties = { padding: "4px 10px", borderRadius: 6, border: "none", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 };
