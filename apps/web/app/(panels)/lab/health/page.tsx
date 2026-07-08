"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getLabSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

interface TerminusResult {
  status: "ok" | "error" | "shutting_down";
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string }>;
  details?: Record<string, { status: string }>;
}

async function timedFetch(url: string): Promise<{ ok: boolean; ms: number; body?: TerminusResult }> {
  const start = performance.now();
  try {
    const res = await fetch(url, { cache: "no-store" });
    const ms = Math.round(performance.now() - start);
    const body = await res.json().catch(() => undefined);
    return { ok: res.ok, ms, body };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  }
}

export default function LabHealthPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getLabSectionConfig(user, "health"), [user]);
  const [checks, setChecks] = useState<Array<{ name: string; ok: boolean; ms: number; detail?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [health, ready, live] = await Promise.all([
      timedFetch(buildApiUrl("health")),
      timedFetch(buildApiUrl("health/ready")),
      timedFetch(buildApiUrl("health/live")),
    ]);

    const details = health.body?.details ?? {};
    const rows = [
      { name: "API NestJS (liveness)", ok: live.ok, ms: live.ms },
      { name: "Base de datos PostgreSQL", ok: details.database?.status === "up" || ready.ok, ms: ready.ms },
      { name: "Memoria heap", ok: details.memory_heap?.status !== "down", ms: health.ms },
      { name: "Almacenamiento en disco", ok: details.storage?.status !== "down", ms: health.ms },
    ];
    setChecks(rows);
    setLastChecked(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const okCount = checks.filter((c) => c.ok).length;
  const avgLatency = checks.length ? Math.round(checks.reduce((s, c) => s + c.ms, 0) / checks.length) : 0;

  return (
    <>
      <PageHeader
        eyebrow="LAB · Sandbox"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={<Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar ahora</Button>}
      />

      {loading && checks.length === 0 && <EmptyState icon="⏳" title="Consultando…" description="Haciendo ping a los servicios." />}

      {checks.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
            <KpiCard label="Servicios OK" value={okCount} hint={`de ${checks.length}`} variant={okCount === checks.length ? "positive" : "warning"} icon="✓" />
            <KpiCard label="Con problemas" value={checks.length - okCount} variant={checks.length - okCount > 0 ? "danger" : "positive"} icon="⚠️" />
            <KpiCard label="Latencia promedio" value={`${avgLatency}ms`} icon="⚡" />
            <KpiCard label="Última verificación" value={lastChecked ? lastChecked.toLocaleTimeString("es-MX") : "—"} icon="🕐" />
          </div>

          <Section title="Servicios" subtitle="Ping en vivo contra /health del backend">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {checks.map((s) => {
                const maxMs = Math.max(...checks.map((c) => c.ms), 1);
                const latencyPct = Math.min(100, (s.ms / maxMs) * 100);
                const latencyColor = s.ms > 1000 ? "var(--danger)" : s.ms > 400 ? "var(--warning)" : "var(--success)";
                return (
                  <article key={s.name} style={{ padding: 14, background: "var(--surface)", border: `1px solid ${s.ok ? "var(--border)" : "color-mix(in srgb, var(--danger) 40%, var(--border))"}`, borderRadius: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 16, alignItems: "center", marginBottom: 8 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 999, background: s.ok ? "var(--success)" : "var(--danger)", boxShadow: `0 0 10px ${s.ok ? "var(--success)" : "var(--danger)"}`, flexShrink: 0 }} />
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
                      <div style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: latencyColor }}>{s.ms}ms</div>
                      <Tag variant={s.ok ? "positive" : "danger"}>{s.ok ? "OK" : "Down"}</Tag>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                      <div style={{ height: 4, borderRadius: 2, background: "var(--surface-2)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${latencyPct}%`, background: latencyColor, borderRadius: 2, transition: "width .4s" }} />
                      </div>
                      <span style={{ fontSize: 10, color: "var(--text-tertiary)", minWidth: 70, textAlign: "right" }}>
                        {s.ms <= 200 ? "Excelente" : s.ms <= 500 ? "Aceptable" : s.ms <= 1000 ? "Lento" : "Crítico"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </>
  );
}
