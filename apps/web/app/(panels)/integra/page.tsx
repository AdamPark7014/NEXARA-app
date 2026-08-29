"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashPage,
  DashHero,
  DashGrid,
  DashCol,
  DashPanel,
  ListRow,
  DashPill,
  StatStrip,
} from "@/components/dashboard/DashKit";
import { buildApiUrl } from "@/lib/api-base";

type Health = {
  connected: boolean;
  configured: boolean;
  host?: string | null;
};

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body?.message === "string"
        ? body.message
        : body?.message?.message || body?.detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export default function IntegraHome() {
  const [health, setHealth] = useState<Health | null>(null);
  const [cams, setCams] = useState(0);
  const [doors, setDoors] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const h = await apiJson<Health>("integra/health");
      setHealth(h);
      if (h.connected) {
        const [c, d] = await Promise.all([
          apiJson<{ total: number }>("integra/cameras"),
          apiJson<{ total: number }>("integra/doors"),
        ]);
        setCams(c.total);
        setDoors(d.total);
      } else {
        setCams(0);
        setDoors(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <DashPage>
      <DashHero
        eyebrow="Seguridad física"
        title="NEXARA Integra"
        subtitle="CCTV y accesos sobre HikCentral Professional Artemis."
        actions={
          <button type="button" onClick={() => void refresh()} style={btnGhost}>
            Actualizar
          </button>
        }
      />

      <StatStrip
        stats={[
          {
            label: "Artemis",
            value: !health
              ? "…"
              : health.connected
                ? "OK"
                : health.configured
                  ? "Down"
                  : "Sin config",
            tone: health?.connected ? "positive" : "warning",
          },
          { label: "Cámaras", value: String(cams) },
          { label: "Puertas", value: String(doors) },
          { label: "Host", value: health?.host || "—" },
        ]}
      />

      {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}

      <DashGrid>
        <DashCol span={12}>
          <DashPanel title="Módulos" subtitle="API /api/integra · ADR-0017">
            {[
              { href: "/integra/video", title: "Video", sub: "Cámaras y URL RTSP live", tone: "positive" as const },
              { href: "/integra/access", title: "Control de acceso", sub: "Puertas y privilegios", tone: "positive" as const },
              { href: "/integra/people", title: "Personas", sub: "Orgs y personas Artemis", tone: "positive" as const },
              { href: "/integra/events", title: "Eventos", sub: "ACS últimas 24 h", tone: "positive" as const },
              { href: "/integra/vehicles", title: "Vehículos", sub: "Listado ANPR / flota", tone: "positive" as const },
              {
                href: "/erp/facilities/access",
                title: "Oficinas NEXARA",
                sub: "ACS interno (Core) — no este panel",
                tone: "neutral" as const,
              },
            ].map((m) => (
              <ListRow
                key={m.href}
                title={m.title}
                sub={m.sub}
                href={m.href}
                trail={<DashPill tone={m.tone}>{m.tone === "neutral" ? "oficinas" : "listo"}</DashPill>}
              />
            ))}
          </DashPanel>
        </DashCol>
      </DashGrid>

      {!health?.configured && (
        <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-tertiary)" }}>
          Configura <code>INTEGRA_HIK_HOST</code>, <code>INTEGRA_HIK_APP_KEY</code> y{" "}
          <code>INTEGRA_HIK_APP_SECRET</code>. Ver <code>docs/INTEGRA-OPS.md</code>.
        </p>
      )}
    </DashPage>
  );
}

const btnGhost: React.CSSProperties = {
  border: "1px solid var(--border, #e2e8f0)",
  background: "transparent",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};
