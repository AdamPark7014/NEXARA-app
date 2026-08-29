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
import { btnGhost, btnPrimary, integraApi } from "./_lib";

type Dash = {
  connected: boolean;
  configured: boolean;
  host?: string | null;
  source?: string | null;
  cameras: number;
  doors: number;
  people: number;
  devices: number;
  lastSync?: { status: string; finishedAt?: string; startedAt?: string } | null;
};

export default function IntegraHome() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setDash(await integraApi<Dash>("integra/dashboard"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await integraApi("integra/sync", { method: "POST" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync falló");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <DashPage>
      <DashHero
        eyebrow="Seguridad física"
        title="NEXARA Integra"
        subtitle="Consola HikCentral-class · espejo Prisma · HLS · bitácora."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void refresh()} style={btnGhost}>
              Actualizar
            </button>
            <button type="button" onClick={() => void syncNow()} style={btnPrimary} disabled={syncing}>
              {syncing ? "Sincronizando…" : "Sincronizar ahora"}
            </button>
          </div>
        }
      />

      <StatStrip
        stats={[
          {
            label: "Artemis",
            value: !dash
              ? "…"
              : dash.connected
                ? "OK"
                : dash.configured
                  ? "Down"
                  : "Sin config",
            tone: dash?.connected ? "positive" : "warning",
          },
          { label: "Cámaras", value: String(dash?.cameras ?? 0) },
          { label: "Puertas", value: String(dash?.doors ?? 0) },
          { label: "Personas", value: String(dash?.people ?? 0) },
          { label: "Devices", value: String(dash?.devices ?? 0) },
          {
            label: "Sync",
            value: dash?.lastSync?.status || "—",
            tone: dash?.lastSync?.status === "OK" ? "positive" : undefined,
          },
        ]}
      />

      {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}

      <DashGrid>
        <DashCol span={12}>
          <DashPanel
            title="Módulos"
            subtitle={`Host ${dash?.host || "—"} · fuente ${dash?.source || "—"}`}
          >
            {[
              { href: "/integra/video", title: "Video", sub: "HLS live + playback + snapshot" },
              { href: "/integra/access", title: "Control de acceso", sub: "Puertas, devices ACS, privilegios" },
              { href: "/integra/people", title: "Personas", sub: "Directorio + orgs" },
              { href: "/integra/events", title: "Eventos", sub: "ACS + fotos proxy" },
              { href: "/integra/alarms", title: "Alarmas", sub: "eventService" },
              { href: "/integra/visitors", title: "Visitas", sub: "Registro + QR" },
              { href: "/integra/vehicles", title: "Vehículos", sub: "CRUD flota" },
              { href: "/integra/anpr", title: "ANPR", sub: "Cruces PMS" },
              { href: "/integra/settings", title: "Sitios", sub: "Multi-sitio + sync" },
            ].map((m) => (
              <ListRow
                key={m.href}
                title={m.title}
                sub={m.sub}
                href={m.href}
                trail={<DashPill tone="positive">listo</DashPill>}
              />
            ))}
          </DashPanel>
        </DashCol>
      </DashGrid>
    </DashPage>
  );
}
