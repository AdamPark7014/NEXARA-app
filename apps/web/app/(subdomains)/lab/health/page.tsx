"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

type Probe = { name: string; status: "ok" | "warn" | "err" | "checking"; latencyMs?: number; detail?: string };

const PROBES = [
  { name: "API /health", path: "health" },
  { name: "API /users (auth)", path: "users", auth: true },
  { name: "NOC /summary", path: "noc/summary", auth: true },
  { name: "Calendar", path: "calendar?from=2026-01-01&to=2026-12-31", auth: true },
  { name: "SLA Stats", path: "sla/stats?from=2026-01-01T00:00:00&to=2026-12-31T23:59:59", auth: true },
  { name: "Executive", path: "executive/c-level", auth: true },
];

export default function SystemHealthPage() {
  const { user } = useUser();
  const [results, setResults] = useState<Probe[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setResults(PROBES.map((p) => ({ name: p.name, status: "checking" })));
    const next: Probe[] = [];
    for (const p of PROBES) {
      const t0 = performance.now();
      try {
        const res = await fetch(buildApiUrl(p.path), {
          headers: p.auth && user?.token ? { Authorization: `Bearer ${user.token}` } : undefined,
        });
        const ms = +(performance.now() - t0).toFixed(0);
        next.push({
          name: p.name,
          status: res.ok ? (ms > 1500 ? "warn" : "ok") : "err",
          latencyMs: ms,
          detail: `HTTP ${res.status}`,
        });
      } catch (err) {
        next.push({ name: p.name, status: "err", detail: String(err) });
      }
      setResults([...next, ...PROBES.slice(next.length).map((p) => ({ name: p.name, status: "checking" as const }))]);
    }
    setRunning(false);
  }, [user?.token]);

  useEffect(() => { run(); }, [run]);

  const colors: Record<Probe["status"], string> = { ok: "#16a34a", warn: "#f59e0b", err: "#dc2626", checking: "#6b7280" };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>📊 System Health</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>Probes en vivo contra endpoints clave del ERP.</p>
        </div>
        <button type="button" onClick={run} disabled={running} style={{ padding: "8px 16px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: running ? "wait" : "pointer" }}>
          {running ? "Probando…" : "🔄 Re-probar"}
        </button>
      </div>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        {results.map((r) => (
          <div key={r.name} style={{ padding: 12, background: "var(--bg-primary)", border: "1px solid var(--border)", borderLeft: `4px solid ${colors[r.status]}`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: 13 }}>{r.name}</strong>
              {r.detail && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{r.detail}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ color: colors[r.status], fontWeight: 700, fontSize: 13 }}>{r.status.toUpperCase()}</span>
              {r.latencyMs != null && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{r.latencyMs} ms</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
