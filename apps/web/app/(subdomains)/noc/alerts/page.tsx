"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Alert = {
  id: string;
  severity: "critical" | "warning" | "info";
  deviceId: string;
  deviceName: string;
  title: string;
  message: string;
  triggeredAt: string;
};

const SEV_COLOR: Record<string, string> = {
  critical: "#dc2626",
  warning: "#f59e0b",
  info: "#0891b2",
};

export default function NocAlertsPage() {
  const { user } = useUser();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("noc/alerts"), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setAlerts(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const critical = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>🚨 Alertas NOC</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>{critical.length} críticas · {warnings.length} advertencias · refresca cada 30s</p>

      {loading ? <p>Cargando…</p> : alerts.length === 0 ? (
        <div style={{ marginTop: 24, padding: 32, background: "#dcfce7", borderRadius: 12, textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <h3 style={{ marginTop: 8 }}>Sin alertas activas</h3>
          <p style={{ color: "var(--text-secondary)" }}>Toda la infraestructura monitoreada opera dentro de parámetros normales.</p>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((a) => (
            <div key={a.id} style={{ padding: 12, background: "var(--bg-primary)", border: "1px solid var(--border)", borderLeft: `4px solid ${SEV_COLOR[a.severity]}`, borderRadius: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: SEV_COLOR[a.severity], fontWeight: 800, textTransform: "uppercase" }}>{a.severity}</span>
                  <strong style={{ display: "block", fontSize: 14 }}>{a.title} · {a.deviceName}</strong>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{a.message}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{new Date(a.triggeredAt).toLocaleString("es-MX")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
