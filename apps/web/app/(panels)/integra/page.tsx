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
import { setActiveCompanyId } from "@/lib/tenant";
import {
  btnGhost,
  btnPrimary,
  integraApi,
  INTEGRA_MODULE_CARDS,
  type IntegraCapabilities,
  setActiveIntegraSiteId,
} from "./_lib";
import { IntegraSiteSwitcher } from "./_SiteSwitcher";

type Dash = {
  connected: boolean;
  configured: boolean;
  host?: string | null;
  source?: string | null;
  cameras: number;
  doors: number;
  people: number;
  devices: number;
  vehicles?: number;
  regions?: number;
  lastSync?: { status: string; finishedAt?: string; startedAt?: string } | null;
  capabilities?: IntegraCapabilities;
};

type Portfolio = {
  mode: "platform" | "tenant";
  companyCount: number;
  siteCount: number;
  companies: Array<{
    companyId: number;
    name: string;
    slug: string | null;
    totals: {
      cameras: number;
      doors: number;
      people: number;
      devices: number;
      vehicles: number;
      regions: number;
    };
    capabilities: IntegraCapabilities;
    sites: Array<{
      id: number;
      name: string;
      label?: string | null;
      host: string;
      lastSyncAt?: string | null;
      _count: {
        cameras: number;
        doors: number;
        people: number;
        devices: number;
        vehicles: number;
      };
    }>;
  }>;
};

const EMPTY_CAPS: IntegraCapabilities = {
  video: true,
  access: true,
  people: true,
  events: true,
  vehicles: true,
  anpr: true,
  visitors: true,
  alarms: true,
  settings: true,
};

export default function IntegraHome() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [d, p] = await Promise.all([
        integraApi<Dash>("integra/dashboard"),
        integraApi<Portfolio>("integra/portfolio").catch(() => null),
      ]);
      setDash(d);
      setPortfolio(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [tick]);

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

  const openClient = (companyId: number, siteId?: number) => {
    setActiveCompanyId(companyId);
    if (siteId) setActiveIntegraSiteId(siteId);
    setTick((t) => t + 1);
  };

  const caps = dash?.capabilities || EMPTY_CAPS;
  const modules = INTEGRA_MODULE_CARDS.filter(
    (m) => m.capability === "always" || caps[m.capability],
  );
  const hidden = INTEGRA_MODULE_CARDS.length - modules.length;

  return (
    <DashPage>
      <DashHero
        eyebrow="Seguridad física · multi-cliente"
        title="NEXARA Integra"
        subtitle="HikCentral Artemis particionado por empresa y sitio. Cada cliente solo ve su inventario."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <IntegraSiteSwitcher onChange={() => setTick((t) => t + 1)} />
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
          { label: "Vehículos", value: String(dash?.vehicles ?? 0) },
          { label: "Regiones", value: String(dash?.regions ?? 0) },
          {
            label: "Sync",
            value: dash?.lastSync?.status || "—",
            tone: dash?.lastSync?.status === "OK" ? "positive" : undefined,
          },
        ]}
      />

      {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}

      {portfolio && portfolio.mode === "platform" && (
        <DashPanel
          title="Portfolio clientes"
          subtitle={`${portfolio.companyCount} empresas · ${portfolio.siteCount} sitios Artemis`}
        >
          {portfolio.companies.map((c) => (
            <div key={c.companyId} style={{ marginBottom: 12 }}>
              <ListRow
                title={c.name}
                sub={`cams ${c.totals.cameras} · puertas ${c.totals.doors} · personas ${c.totals.people} · vehículos ${c.totals.vehicles}`}
                trail={
                  <button type="button" style={btnPrimary} onClick={() => openClient(c.companyId)}>
                    Entrar
                  </button>
                }
              />
              <div style={{ paddingLeft: 12, marginTop: 4 }}>
                {c.sites.map((s) => (
                  <ListRow
                    key={s.id}
                    title={s.label || s.name}
                    sub={`${s.host} · sync ${s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString("es-MX") : "nunca"}`}
                    trail={
                      <button
                        type="button"
                        style={btnGhost}
                        onClick={() => openClient(c.companyId, s.id)}
                      >
                        Sitio
                      </button>
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          {portfolio.companies.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              Sin sitios. Crea uno en Sitios o configura INTEGRA_HIK_*.
            </p>
          )}
        </DashPanel>
      )}

      <DashGrid>
        <DashCol span={12}>
          <DashPanel
            title="Módulos del sitio activo"
            subtitle={
              hidden > 0
                ? `Host ${dash?.host || "—"} · ${hidden} ocultos (sin dispositivos de ese tipo)`
                : `Host ${dash?.host || "—"} · fuente ${dash?.source || "—"}`
            }
          >
            {modules.map((m) => (
              <ListRow
                key={m.href}
                title={m.title}
                sub={m.sub}
                href={m.href}
                trail={<DashPill tone="positive">activo</DashPill>}
              />
            ))}
            {modules.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                Sin módulos — sincroniza el sitio o configura Artemis.
              </p>
            )}
          </DashPanel>
        </DashCol>
      </DashGrid>

      <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-tertiary)" }}>
        Tenancy: header <code>X-Company-Id</code> + sitio activo. Clientes no-admin solo ven su
        empresa. Capacidades derivadas del espejo Prisma (cámaras→video, puertas→ACS, etc.).
      </p>
    </DashPage>
  );
}
