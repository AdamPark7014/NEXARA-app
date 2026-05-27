"use client";

import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";

type Svc = { name: string; url: string; status: "OK" | "Degraded" | "Down"; latency: number; uptime: number };

const SERVICES: Svc[] = [
  { name: "API NestJS", url: "api.nexara.com.mx", status: "OK", latency: 42, uptime: 99.97 },
  { name: "Web Next.js", url: "nexara.com.mx", status: "OK", latency: 88, uptime: 99.99 },
  { name: "PostgreSQL", url: "db.internal", status: "OK", latency: 6, uptime: 99.95 },
  { name: "Redis cache", url: "redis.internal", status: "OK", latency: 2, uptime: 99.99 },
  { name: "S3 storage (evidencias)", url: "s3.amazonaws.com", status: "OK", latency: 110, uptime: 99.98 },
  { name: "SAT PAC", url: "pac.provider", status: "Degraded", latency: 1820, uptime: 98.20 },
];

export default function LabHealthPage() {
  return (
    <>
      <PageHeader
        eyebrow="LAB · Sandbox"
        title="Health API"
        subtitle="Estado en vivo de cada servicio que compone NEXARA. Pings cada 30s."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Servicios OK" value={SERVICES.filter(s => s.status === "OK").length} hint={`de ${SERVICES.length}`} variant="positive" icon="✓" />
        <KpiCard label="Degraded" value={SERVICES.filter(s => s.status === "Degraded").length} variant="warning" icon="⚠️" />
        <KpiCard label="Down" value={SERVICES.filter(s => s.status === "Down").length} variant="danger" icon="✗" />
        <KpiCard label="Latencia promedio" value={`${Math.round(SERVICES.reduce((a, s) => a + s.latency, 0) / SERVICES.length)}ms`} variant="default" icon="⚡" />
      </div>

      <Section title="Servicios" subtitle="Estado en vivo">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SERVICES.map((s, i) => (
            <article
              key={i}
              style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 16, alignItems: "center",
                padding: 14, background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: 12,
              }}
            >
              <span
                style={{
                  width: 12, height: 12, borderRadius: 999,
                  background: s.status === "OK" ? "var(--success)" : s.status === "Degraded" ? "var(--warning)" : "var(--danger)",
                  boxShadow: `0 0 12px ${s.status === "OK" ? "var(--success)" : s.status === "Degraded" ? "var(--warning)" : "var(--danger)"}`,
                }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
                <code style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{s.url}</code>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, color: s.latency > 1000 ? "var(--warning)" : "var(--text-primary)" }}>
                  {s.latency}ms
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{s.uptime}% uptime</div>
              </div>
              <Tag variant={s.status === "OK" ? "positive" : s.status === "Degraded" ? "warning" : "danger"}>
                {s.status}
              </Tag>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
