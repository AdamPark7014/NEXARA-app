"use client";

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
    href: "/lab/flags",
    title: "Feature flags",
    desc: "Flags de plataforma y canary — sin números inventados en el home.",
    accent: "#f59e0b",
    chips: ["Canary", "Rollout", "Lab"],
  },
  {
    href: "/erp/settings/webhooks",
    title: "Webhooks DLQ",
    desc: "Cola de entregas fallidas con replay — mismo control que Stripe Dashboard / Atlassian webhooks.",
    accent: "#f59e0b",
    chips: ["HMAC", "Replay", "DLQ"],
  },
  {
    href: "/erp/audit",
    title: "Audit & privacy",
    desc: "Timeline inmutable + borrado GDPR/LFPDPPP de sujetos (anonymize PII, retiene histórico fiscal).",
    accent: "#0ea5e9",
    chips: ["Trazabilidad", "Erase", "Cumplimiento"],
  },
  {
    href: "/erp/settings",
    title: "Control center",
    desc: "Billing, API keys, SCIM, empresas y packaging SaaS del tenant.",
    accent: "#6366f1",
    chips: ["Billing", "API keys", "SCIM"],
  },
];

export default function LabHome() {
  const { user } = useUser();
  const cfg = useMemo(() => getLabSectionConfig(user, "home"), [user]);
  const token = user?.token ?? "";

  const [apiMs, setApiMs] = useState<number | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [readyOk, setReadyOk] = useState<boolean | null>(null);
  const [flagCount, setFlagCount] = useState<number | null>(null);
  const [flagsEnabled, setFlagsEnabled] = useState<number | null>(null);

  const ping = useCallback(async () => {
    const start = performance.now();
    try {
      const [live, ready] = await Promise.all([
        fetch(buildApiUrl("health/live"), { cache: "no-store" }),
        fetch(buildApiUrl("health/ready"), { cache: "no-store" }),
      ]);
      setApiMs(Math.round(performance.now() - start));
      setApiOk(live.ok);
      setReadyOk(ready.ok);
    } catch {
      setApiOk(false);
      setReadyOk(false);
      setApiMs(null);
    }
  }, []);

  const loadFlags = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(buildApiUrl("lab/flags"), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        setFlagCount(null);
        setFlagsEnabled(null);
        return;
      }
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data?.data ?? []);
      setFlagCount(rows.length);
      setFlagsEnabled(rows.filter((f: { enabled?: boolean }) => f.enabled).length);
    } catch {
      setFlagCount(null);
      setFlagsEnabled(null);
    }
  }, [token]);

  useEffect(() => {
    void ping();
    void loadFlags();
    const interval = setInterval(() => {
      void ping();
      void loadFlags();
    }, 30000);
    return () => clearInterval(interval);
  }, [ping, loadFlags]);

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
            label: "Readiness",
            value: readyOk === null ? "—" : readyOk ? "OK" : "Down",
            sub: readyOk === null ? "Verificando…" : readyOk ? "health/ready" : "Dependencias fallan",
            tone: readyOk === null ? "default" : readyOk ? "positive" : "danger",
          },
          {
            label: "Feature flags",
            value: flagCount === null ? "—" : String(flagCount),
            sub:
              flagsEnabled === null
                ? "Ver /lab/flags"
                : `${flagsEnabled} activos · live`,
            tone: "accent",
          },
          {
            label: "Health detail",
            value: "→",
            sub: "Abrir /lab/health",
            tone: "default",
          },
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
              <ListRow href="/lab/flags" title="Feature flags" sub="Canary y rollouts" trail="→" />
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
