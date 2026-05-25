"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type ContactMessage = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  subject?: string | null;
  category: "SOPORTE" | "VENTAS";
  message: string;
  source?: string | null;
  pageUrl?: string | null;
  status: "NEW" | "IN_PROGRESS" | "RESOLVED" | "ARCHIVED";
  responseMessage?: string | null;
  respondedAt?: string | null;
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  NEW: "#3b82f6",
  IN_PROGRESS: "#f59e0b",
  RESOLVED: "#16a34a",
  ARCHIVED: "#6b7280",
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "Nuevo",
  IN_PROGRESS: "En proceso",
  RESOLVED: "Resuelto",
  ARCHIVED: "Archivado",
};

export default function WebInboxPage() {
  const { user } = useUser();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ status?: string; category?: string }>({});
  const [selected, setSelected] = useState<ContactMessage | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter.status) qs.set("status", filter.status);
      if (filter.category) qs.set("category", filter.category);
      const res = await fetch(buildApiUrl(`contact-messages${qs.toString() ? `?${qs.toString()}` : ""}`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : data.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.token, filter]);

  useEffect(() => { refresh(); }, [refresh]);

  const stats = useMemo(() => {
    const now = new Date();
    const last30 = messages.filter((m) => (now.getTime() - new Date(m.createdAt).getTime()) <= 30 * 86400000);
    return {
      total: messages.length,
      new: messages.filter((m) => m.status === "NEW").length,
      ventas: messages.filter((m) => m.category === "VENTAS").length,
      soporte: messages.filter((m) => m.category === "SOPORTE").length,
      last30: last30.length,
      conversion: messages.length > 0 ? ((messages.filter((m) => m.category === "VENTAS").length / messages.length) * 100).toFixed(1) : 0,
    };
  }, [messages]);

  const sources = useMemo(() => {
    const map = new Map<string, number>();
    messages.forEach((m) => {
      const src = m.source || "directo";
      map.set(src, (map.get(src) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [messages]);

  const updateStatus = async (id: number, status: string) => {
    if (!user?.token) return;
    await fetch(buildApiUrl(`contact-messages/${id}`), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refresh();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>📥 Inbox Marketing</h2>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Solicitudes recibidas desde web.nexara.com.mx. Las solicitudes VENTAS se convierten automáticamente en Leads del CRM.
          </p>
        </div>
        <button type="button" onClick={refresh} className="button-primary" style={{ padding: "8px 14px" }}>🔄 Actualizar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        <Kpi label="Total mensajes" value={stats.total} color="#6b7280" />
        <Kpi label="Nuevos" value={stats.new} color="#3b82f6" />
        <Kpi label="Solicitudes VENTAS" value={stats.ventas} color="#16a34a" />
        <Kpi label="Solicitudes SOPORTE" value={stats.soporte} color="#f59e0b" />
        <Kpi label="Últimos 30 días" value={stats.last30} color="#8b5cf6" />
        <Kpi label="Conversión ventas %" value={`${stats.conversion}%`} color="#0ea5e9" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Pill active={!filter.status} onClick={() => setFilter({ ...filter, status: undefined })}>Todos</Pill>
            {Object.entries(STATUS_LABEL).map(([k, l]) => (
              <Pill key={k} active={filter.status === k} onClick={() => setFilter({ ...filter, status: k })}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: STATUS_COLOR[k], marginRight: 6 }} />
                {l}
              </Pill>
            ))}
            <span style={{ borderLeft: "1px solid var(--border)", margin: "0 8px" }} />
            <Pill active={!filter.category} onClick={() => setFilter({ ...filter, category: undefined })}>Todas categorías</Pill>
            <Pill active={filter.category === "VENTAS"} onClick={() => setFilter({ ...filter, category: "VENTAS" })}>VENTAS</Pill>
            <Pill active={filter.category === "SOPORTE"} onClick={() => setFilter({ ...filter, category: "SOPORTE" })}>SOPORTE</Pill>
          </div>

          {loading ? (
            <p>Cargando mensajes…</p>
          ) : messages.length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>Sin mensajes para los filtros activos.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {messages.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m)}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: selected?.id === m.id ? "var(--bg-secondary)" : "var(--bg-primary)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <strong>{m.name}</strong>
                      {m.company && <span style={{ color: "var(--text-secondary)", marginLeft: 6 }}>· {m.company}</span>}
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{m.email}{m.phone ? ` · ${m.phone}` : ""}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      <Badge color={STATUS_COLOR[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                      <Badge color={m.category === "VENTAS" ? "#16a34a" : "#f59e0b"}>{m.category}</Badge>
                    </div>
                  </div>
                  {m.subject && <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{m.subject}</div>}
                  <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60ch" }}>
                    {m.message}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                    📅 {new Date(m.createdAt).toLocaleString("es-MX")}
                    {m.source && ` · 📍 ${m.source}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>📊 Top fuentes</h3>
            {sources.length === 0 ? (
              <p style={{ color: "var(--text-secondary)" }}>Sin datos.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sources.map(([src, count]) => (
                  <div key={src} style={{ display: "flex", justifyContent: "space-between", padding: 6, background: "var(--bg-secondary)", borderRadius: 6 }}>
                    <span style={{ fontSize: 12 }}>{src}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div style={{ ...cardStyle, marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>Detalle</h3>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>{selected.name}</strong>
                {selected.company && <div style={{ color: "var(--text-secondary)" }}>{selected.company}</div>}
                <div style={{ color: "var(--text-secondary)" }}>{selected.email}</div>
                {selected.phone && <div style={{ color: "var(--text-secondary)" }}>{selected.phone}</div>}
              </div>
              {selected.subject && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{selected.subject}</div>}
              <div style={{ fontSize: 13, padding: 8, background: "var(--bg-secondary)", borderRadius: 6, whiteSpace: "pre-wrap" }}>
                {selected.message}
              </div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                <strong style={{ fontSize: 12 }}>Cambiar estado:</strong>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(STATUS_LABEL).map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      disabled={selected.status === k}
                      onClick={() => updateStatus(selected.id, k)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: selected.status === k ? STATUS_COLOR[k] : "transparent",
                        color: selected.status === k ? "#fff" : "var(--text-primary)",
                        cursor: "pointer",
                        fontSize: 11,
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {selected.category === "VENTAS" && (
                <p style={{ fontSize: 11, color: "#16a34a", marginTop: 12 }}>
                  ✓ Esta solicitud de VENTAS fue convertida automáticamente en un Lead del CRM.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-secondary)", borderRadius: 10, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 10px",
        background: active ? "var(--primary)" : "var(--bg-secondary)",
        color: active ? "#fff" : "var(--text-primary)",
        border: "none",
        borderRadius: 999,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: "inline-block", padding: "2px 8px", background: `${color}22`, color, borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{children}</span>;
}

const cardStyle: React.CSSProperties = {
  padding: 16,
  background: "var(--bg-primary)",
  border: "1px solid var(--border)",
  borderRadius: 12,
};
