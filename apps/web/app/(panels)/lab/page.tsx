"use client";

import Link from "next/link";
import { useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader";
import KpiCard from "@/components/ui/KpiCard";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getLabSectionConfig } from "@/lib/section-views";

const TOOLS = [
  {
    href: "/lab/ai",
    icon: "🤖",
    title: "AI sandbox",
    desc: "Probar prompts, embeddings y agentes contra el motor IA de NEXARA antes de exponerlos a producción.",
    accent: "#a855f7",
    chips: ["GPT-4", "Embeddings", "Agentes"],
  },
  {
    href: "/lab/health",
    icon: "❤️",
    title: "API health",
    desc: "Estado en vivo de cada servicio (API, DB, Redis, PAC, webhooks SAT) con latencia y uptime histórico.",
    accent: "#10b981",
    chips: ["API", "DB", "Redis", "PAC SAT"],
  },
  {
    href: "/erp/audit",
    icon: "🔍",
    title: "Audit log",
    desc: "Timeline inmutable de cambios sensibles en todo NEXARA — filtrable por panel, severidad y actor.",
    accent: "#0ea5e9",
    chips: ["Trazabilidad", "Cumplimiento"],
  },
];

export default function LabHome() {
  const { user } = useUser();
  const cfg = useMemo(() => getLabSectionConfig(user, "home"), [user]);
  return (
    <>
      <PageHeader
        eyebrow="LAB · Sandbox técnico"
        title={cfg.title}
        subtitle={cfg.subtitle}
        variant="hero"
        meta={
          <>
            <Tag variant="accent" dot>Solo developers + CEO</Tag>
            <Tag variant="positive">API up 99.9%</Tag>
            <Tag variant="neutral">v2.4.1-rc</Tag>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCard label="API p95 latencia" value={<>142<span style={{ fontSize: "0.55em", marginLeft: 2, opacity: 0.7 }}>ms</span></>} hint="México · últimas 24h" icon="⚡" variant="positive" sparkline={[210, 180, 165, 152, 148, 144, 142]} />
        <KpiCard label="Errores 5xx" value="0.04%" hint="2.3k req/min · sin incidentes" icon="🛡️" variant="positive" />
        <KpiCard label="Webhooks SAT" value="100%" hint="412 CFDI timbrados hoy" icon="🧾" variant="positive" sparkline={[98, 99, 100, 100, 100, 100, 100]} />
        <KpiCard label="Feature flags" value="14" hint="3 en canary · 1 rollout pausado" icon="🚩" variant="accent" />
      </div>

      <Section
        eyebrow="Herramientas"
        title="Mesa de trabajo"
        subtitle="Atajos a las herramientas técnicas con acceso restringido"
        tone="accent"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="nx-lab-tool"
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 18,
                textDecoration: "none",
                color: "var(--text-primary)",
                background: "var(--surface)",
                border: "1px solid var(--nx-panel-hairline)",
                borderRadius: 14,
                boxShadow: "var(--nx-panel-elev-1)",
                overflow: "hidden",
                transition:
                  "transform 200ms var(--nx-ease-out), border-color 200ms var(--nx-ease-out), box-shadow 200ms var(--nx-ease-out)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `radial-gradient(circle at 100% 0%, color-mix(in srgb, ${t.accent} 14%, transparent) 0%, transparent 55%)`,
                  opacity: 0.7,
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `linear-gradient(135deg, ${t.accent} 0%, color-mix(in srgb, ${t.accent} 60%, white) 100%)`,
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    boxShadow: `0 1px 0 rgba(255,255,255,0.18) inset, 0 8px 18px color-mix(in srgb, ${t.accent} 30%, transparent)`,
                  }}
                >
                  {t.icon}
                </span>
                <span className="nx-lab-arrow" style={{ color: "var(--text-tertiary)", fontSize: 18, transition: "transform 200ms" }}>→</span>
              </div>
              <div style={{ position: "relative" }}>
                <h3
                  style={{
                    fontFamily: "var(--nx-font-display)",
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    margin: 0,
                    color: "var(--text-primary)",
                  }}
                >
                  {t.title}
                </h3>
                <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6, marginBottom: 0, lineHeight: 1.55 }}>
                  {t.desc}
                </p>
              </div>
              <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {t.chips.map((c) => (
                  <span
                    key={c}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: `color-mix(in srgb, ${t.accent} 12%, transparent)`,
                      color: t.accent,
                      border: `1px solid color-mix(in srgb, ${t.accent} 24%, var(--border))`,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <style jsx>{`
        :global(.nx-lab-tool:hover) {
          transform: translateY(-3px);
          border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
          box-shadow: var(--nx-panel-elev-hover);
        }
        :global(.nx-lab-tool:hover .nx-lab-arrow) {
          transform: translateX(4px);
          color: var(--primary) !important;
        }
      `}</style>
    </>
  );
}
