"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Stats = {
  total: number;
  stillOpen: number;
  responseSla: { onTime: number; late: number; compliancePct: number; avgHours: number };
  resolutionSla: { onTime: number; late: number; compliancePct: number; avgHours: number };
};

export default function SupportSlaPage() {
  const { user } = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [from] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [to] = useState(new Date().toISOString().slice(0, 10));

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const url = `sla/stats?from=${from}T00:00:00&to=${to}T23:59:59`;
      const res = await fetch(buildApiUrl(url), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setStats(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token, from, to]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>📊 SLA Helpdesk · {from} → {to}</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>Cumplimiento del equipo de soporte interno.</p>

      {loading ? <p>Cargando…</p> : stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
          <Kpi label="Total tickets" value={stats.total} color="#6b7280" />
          <Kpi label="Compliance respuesta" value={`${stats.responseSla.compliancePct}%`} color={stats.responseSla.compliancePct >= 90 ? "#16a34a" : "#f59e0b"} />
          <Kpi label="Compliance resolución" value={`${stats.resolutionSla.compliancePct}%`} color={stats.resolutionSla.compliancePct >= 90 ? "#16a34a" : "#f59e0b"} />
          <Kpi label="Tiempo medio respuesta" value={`${stats.responseSla.avgHours} h`} color="#0ea5e9" />
          <Kpi label="Tiempo medio resolución" value={`${stats.resolutionSla.avgHours} h`} color="#8b5cf6" />
          <Kpi label="Aún abiertos" value={stats.stillOpen} color={stats.stillOpen > 0 ? "#f59e0b" : "#16a34a"} />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ padding: 14, background: "var(--bg-primary)", border: "1px solid var(--border)", borderTop: `3px solid ${color}`, borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
