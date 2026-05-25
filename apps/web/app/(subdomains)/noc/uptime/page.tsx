"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Device = { id: string; name: string; type: string; clientName: string; uptimePct30d: number };

export default function NocUptimePage() {
  const { user } = useUser();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl("noc/devices"), { headers: { Authorization: `Bearer ${user.token}` } });
      if (res.ok) setDevices(await res.json());
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const byClient = useMemo(() => {
    const map = new Map<string, Device[]>();
    devices.forEach((d) => {
      if (!map.has(d.clientName)) map.set(d.clientName, []);
      map.get(d.clientName)!.push(d);
    });
    return Array.from(map.entries())
      .map(([client, list]) => ({
        client,
        avg: +(list.reduce((s, d) => s + d.uptimePct30d, 0) / list.length).toFixed(2),
        count: list.length,
      }))
      .sort((a, b) => a.avg - b.avg);
  }, [devices]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>📈 Uptime últimos 30 días</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>Ranking por cliente — primero los que necesitan más atención.</p>

      {loading ? <p>Cargando…</p> : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {byClient.map((c) => {
            const color = c.avg >= 99 ? "#16a34a" : c.avg >= 95 ? "#f59e0b" : "#dc2626";
            return (
              <div key={c.client} style={{ padding: 12, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{c.client}</strong>
                  <span style={{ fontSize: 16, fontWeight: 800, color }}>{c.avg}%</span>
                </div>
                <div style={{ marginTop: 8, height: 8, background: "var(--bg-secondary)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${c.avg}%`, height: "100%", background: color }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>{c.count} dispositivo(s)</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
