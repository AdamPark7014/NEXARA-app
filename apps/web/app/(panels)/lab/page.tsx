"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  StatStrip,
  DashPanel,
  ListRow,
  DashPill,
} from "@/components/dashboard/DashKit";
import { useUser } from "@/components/UserContext";
import { getLabSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";

const TOOLS = [
  {
    href: "/lab/ai",
    title: "AI sandbox",
    desc: "Probar prompts, embeddings y agentes contra el motor IA de NEXARA antes de exponerlos a producción.",
    accent: "#a855f7",
    chips: ["GPT-4", "Embeddings", "Agentes"],
  },
  {
    href: "/lab/health",
    title: "API health",
    desc: "Estado en vivo de cada servicio (API, DB, Redis, PAC, webhooks SAT) con latencia y uptime histórico.",
    accent: "#10b981",
    chips: ["API", "DB", "Redis", "PAC SAT"],
  },
  {
    href: "/erp/audit",
    title: "Audit log",
    desc: "Timeline inmutable de cambios sensibles en todo NEXARA — filtrable por panel, severidad y actor.",
    accent: "#0ea5e9",
    chips: ["Trazabilidad", "Cumplimiento"],
  },
];

export default function LabHome() {
  const { user } = useUser();
  const cfg = useMemo(() => getLabSectionConfig(user, "home"), [user]);

  const [apiMs, setApiMs] = useState<number | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  const ping = useCallback(async () => {
    const start = performance.now();
    try {
      const res = await fetch(buildApiUrl("health/live"), { cache: "no-store" });
      const ms = Math.round(performance.now() - start);
      setApiMs(ms);
      setApiOk(res.ok);
    } catch {
      setApiOk(false);
      setApiMs(null);
    }
  }, []);

  useEffect(() => {
    void ping();
    const interval = setInterval(() => void ping(), 30000);
    return () => clearInterval(interval);
  }, [ping]);

  return (
    <DashPage>
      <DashHero
        eyebrow="LAB · Sandbox técnico"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <DashPill tone="accent">Solo developers + CEO</DashPill>
            <DashPill tone={apiOk === false ? "danger" : "positive"}>
              {apiOk === false ? "API down" : apiOk === true ? `API OK · ${apiMs}ms` : "API checking…"}
            </DashPill>
            <DashPill tone="neutral">v2.4.1-rc</DashPill>
          </>
        }
      />

      <StatStrip
        stats={[
          {
            label: "API latencia",
            value: apiMs !== null ? `${apiMs} ms` : "—",
            sub: apiOk === null ? "Midiendo…" : apiOk ? "NestJS liveness" : "Sin respuesta",
            tone: apiOk === null ? "default" : apiOk ? (apiMs !== null && apiMs <= 400 ? "positive" : "warning") : "danger",
            big: true,
          },
          {
            label: "Estado API",
            value: apiOk === null ? "—" : apiOk ? "OK" : "Down",
            sub: apiOk === null ? "Verificando…" : apiOk ? "Liveness OK" : "API no responde",
            tone: apiOk === null ? "default" : apiOk ? "positive" : "danger",
          },
          { label: "Webhooks SAT", value: "100%", sub: "Ver /lab/health para detalles", tone: "positive" },
          { label: "Feature flags", value: "14", sub: "3 en canary · 1 rollout pausado", tone: "accent" },
        ]}
      />

      <DashGrid>
        {TOOLS.map((t) => (
          <DashCol key={t.href} span={4}>
            <DashPanel title={t.title} subtitle={t.desc} action="Abrir" actionHref={t.href}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {t.chips.map((c) => (
                  <span
                    key={c}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "3px 9px",
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
            </DashPanel>
          </DashCol>
        ))}

        <DashCol span={12}>
          <DashPanel title="Accesos técnicos" subtitle="Diagnóstico y trazabilidad" flush>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 4 }}>
              <ListRow href="/lab/health" title="Monitoreo de servicios" sub="API · DB · Redis · PAC" trail="→" />
              <ListRow href="/lab/ai" title="Playground de IA" sub="Prompts y agentes" trail="→" />
              <ListRow href="/lab/chat" title="Chat del equipo" sub="Canal técnico" trail="→" />
              <ListRow href="/erp/audit" title="Audit log" sub="Cambios sensibles" trail="→" />
            </div>
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
