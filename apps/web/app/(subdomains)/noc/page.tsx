"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Summary = {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  avgUptime: number;
  criticalCount: number;
  offlineDevices: Array<{ id: string; name: string; clientName: string; branch: string; lastSeen: string }>;
  alertDevices: Array<{ id: string; name: string; clientName: string; branch: string; status: string; uptimePct30d: number }>;
  generatedAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  ONLINE: "#16a34a",
  OFFLINE: "#dc2626",
  DEGRADED: "#f59e0b",
  ALERT: "#ef4444",
};

const TYPE_ICONS: Record<string, string> = {
  CCTV: "📹",
  POS: "🛒",
  PRINTER: "🖨️",
  ROUTER: "📶",
  SERVER: "🖥️",
  IOT_SENSOR: "📟",
  ACCESS_CONTROL: "🔐",
};

export default function NocHome() {
  const { user } = useUser();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    try {
      const res = await fetch(buildApiUrl("noc/summary"), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setSummary(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [autoRefresh, refresh]);

  if (loading) return <div style={{ padding: 24 }}>Cargando NOC…</div>;
  if (!summary) return null;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>📡 NOC · Monitoreo en vivo</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            {summary.total} dispositivos · Uptime promedio <strong style={{ color: "#16a34a" }}>{summary.avgUptime}%</strong> · Última actualización {new Date(summary.generatedAt).toLocaleTimeString("es-MX")}
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh 15s
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
        <BigKpi label="ONLINE" value={summary.byStatus.ONLINE || 0} total={summary.total} color="#16a34a" icon="✅" />
        <BigKpi label="OFFLINE" value={summary.byStatus.OFFLINE || 0} total={summary.total} color="#dc2626" icon="🔴" />
        <BigKpi label="DEGRADED" value={summary.byStatus.DEGRADED || 0} total={summary.total} color="#f59e0b" icon="⚠️" />
        <BigKpi label="ALERT" value={summary.byStatus.ALERT || 0} total={summary.total} color="#ef4444" icon="🚨" />
        <BigKpi label="Críticos" value={summary.criticalCount} total={summary.total} color="#7f1d1d" icon="🔥" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 16 }}>
        <Panel title="🔴 Offline">
          {summary.offlineDevices.length === 0 ? <Empty>Todo conectado 🎉</Empty> : summary.offlineDevices.map((d) => (
            <Row key={d.id} name={d.name} subtitle={`${d.branch} · ${d.clientName}`} right={new Date(d.lastSeen).toLocaleString("es-MX")} color="#dc2626" />
          ))}
        </Panel>
        <Panel title="🚨 Alertas activas">
          {summary.alertDevices.length === 0 ? <Empty>Sin alertas activas</Empty> : summary.alertDevices.map((d) => (
            <Row key={d.id} name={d.name} subtitle={`${d.branch} · ${d.clientName}`} right={`${d.uptimePct30d}% uptime`} color={STATUS_COLOR[d.status]} />
          ))}
        </Panel>
        <Panel title="📊 Por tipo">
          {Object.entries(summary.byType).sort((a, b) => b[1] - a[1]).map(([t, count]) => (
            <Row key={t} name={`${TYPE_ICONS[t] || "•"} ${t}`} subtitle={`${count} dispositivo(s)`} right={`${Math.round((count / summary.total) * 100)}%`} color="#0891b2" />
          ))}
        </Panel>
      </div>

      <div style={{ marginTop: 16, padding: 14, background: "var(--bg-secondary)", borderRadius: 10, textAlign: "center" }}>
        <Link href="/noc/devices" style={{ marginRight: 16, color: "#0891b2", fontWeight: 700 }}>📋 Ver todos los dispositivos</Link>
        <Link href="/noc/alerts" style={{ color: "#0891b2", fontWeight: 700 }}>🚨 Ver todas las alertas</Link>
      </div>
    </div>
  );
}

function BigKpi({ label, value, total, color, icon }: { label: string; value: number; total: number; color: string; icon: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderTop: `4px solid ${color}`, borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", textTransform: "uppercase" }}>{icon} {label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{pct}% del total</div>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10 }}>
      <strong>{title}</strong>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}
function Row({ name, subtitle, right, color }: { name: string; subtitle: string; right: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed var(--border)", gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: color, marginRight: 6 }} />
          {name}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{subtitle}</div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{right}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic", padding: 8 }}>{children}</div>;
}
