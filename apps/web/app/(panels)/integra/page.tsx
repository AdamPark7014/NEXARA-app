"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { setActiveCompanyId } from "@/lib/tenant";
import {
  integraApi,
  INTEGRA_MODULE_CARDS,
  type IntegraCapabilities,
  setActiveIntegraSiteId,
} from "./_lib";
import { setCachedCapabilities } from "./_caps";
import styles from "./integra.module.css";

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

const MODULE_MARK: Record<string, string> = {
  "/integra/video": "VID",
  "/integra/access": "ACS",
  "/integra/people": "PER",
  "/integra/events": "EVT",
  "/integra/alarms": "ALM",
  "/integra/visitors": "VIS",
  "/integra/vehicles": "VEH",
  "/integra/anpr": "ANPR",
  "/integra/settings": "CFG",
};

const CAP_LABELS: Array<[keyof IntegraCapabilities, string]> = [
  ["video", "Video"],
  ["access", "ACS"],
  ["people", "Personas"],
  ["events", "Eventos"],
  ["vehicles", "Flota"],
  ["anpr", "ANPR"],
  ["visitors", "Visitas"],
  ["alarms", "Alarmas"],
];

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
      if (d.capabilities) setCachedCapabilities(d.capabilities);
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

  const caps = dash?.capabilities;
  const modules = INTEGRA_MODULE_CARDS.filter(
    (m) => m.capability === "always" || (caps ? caps[m.capability] : true),
  );

  const artemisTone = !dash
    ? undefined
    : dash.connected
      ? styles.statOk
      : dash.configured
        ? styles.statWarn
        : styles.statDanger;

  return (
    <div className={styles.inner}>
      <header className={styles.hero}>
        <div className={styles.heroRow}>
          <div>
            <span className={styles.eyebrow}>
              <span className={styles.eyebrowDot} aria-hidden />
              {portfolio?.mode === "platform"
                ? "Plataforma · todos los clientes"
                : "Portal · tu inventario Artemis"}
            </span>
            <h1 className={styles.title}>NEXARA Integra</h1>
            <p className={styles.sub}>
              Seguridad física sobre HikCentral Artemis: video, ACS, personas, visitas y ANPR
              particionados por empresa y sitio.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.btnGhost} onClick={() => void refresh()}>
              Actualizar
            </button>
            {caps?.settings !== false && (
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={syncing}
                onClick={() => void syncNow()}
              >
                {syncing ? "Sincronizando…" : "Sincronizar"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className={styles.stats} role="group" aria-label="Estado del sitio">
        <div className={styles.stat}>
          <span className={styles.statLabel}>Artemis</span>
          <span className={`${styles.statValue} ${artemisTone || ""}`}>
            {!dash ? "…" : dash.connected ? "OK" : dash.configured ? "Down" : "—"}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Cámaras</span>
          <span className={styles.statValue}>{dash?.cameras ?? 0}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Puertas</span>
          <span className={styles.statValue}>{dash?.doors ?? 0}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Personas</span>
          <span className={styles.statValue}>{dash?.people ?? 0}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Vehículos</span>
          <span className={styles.statValue}>{dash?.vehicles ?? 0}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Regiones</span>
          <span className={styles.statValue}>{dash?.regions ?? 0}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Sync</span>
          <span
            className={`${styles.statValue} ${
              dash?.lastSync?.status === "OK" ? styles.statOk : ""
            }`}
          >
            {dash?.lastSync?.status || "—"}
          </span>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {portfolio && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>
              {portfolio.mode === "platform" ? "Clientes" : "Tus sitios"}
            </h2>
            <p className={styles.sectionSub}>
              {portfolio.companyCount} empresas · {portfolio.siteCount} sitios Artemis
            </p>
          </div>
          <div className={styles.portfolioList}>
            {portfolio.companies.map((c) => (
              <article key={c.companyId} className={styles.companyCard}>
                <div className={styles.companyTop}>
                  <div>
                    <h3 className={styles.companyName}>{c.name}</h3>
                    <p className={styles.companyMeta}>
                      {c.totals.cameras} cam · {c.totals.doors} puertas · {c.totals.people}{" "}
                      personas · {c.totals.vehicles} veh · {c.totals.regions} regiones
                    </p>
                  </div>
                  {portfolio.mode === "platform" ? (
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={() => openClient(c.companyId)}
                    >
                      Entrar
                    </button>
                  ) : (
                    <span className={styles.moduleFoot}>Activo</span>
                  )}
                </div>
                <div className={styles.capRow}>
                  {CAP_LABELS.map(([k, label]) => (
                    <span
                      key={k}
                      className={c.capabilities[k] ? styles.capOn : styles.capOff}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div className={styles.siteList}>
                  {c.sites.map((s) => (
                    <div key={s.id} className={styles.siteRow}>
                      <div>
                        <div className={styles.siteName}>{s.label || s.name}</div>
                        <div className={styles.siteHost}>
                          {s.host} · {s._count.cameras}c/{s._count.doors}p · sync{" "}
                          {s.lastSyncAt
                            ? new Date(s.lastSyncAt).toLocaleString("es-MX")
                            : "nunca"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => openClient(c.companyId, s.id)}
                      >
                        Sitio
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {portfolio.companies.length === 0 && (
              <p className={styles.empty}>
                {portfolio.mode === "platform"
                  ? "Sin sitios. Crea uno en Configuración → Sitios para cada cliente."
                  : "Tu empresa aún no tiene sitio Artemis. Contacta a NEXARA."}
              </p>
            )}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Módulos del sitio</h2>
          <p className={styles.sectionSub}>
            Host {dash?.host || "—"} · fuente {dash?.source || "—"} · visibles según inventario
          </p>
        </div>
        {modules.length === 0 ? (
          <p className={styles.empty}>
            Sin módulos — sincroniza el sitio o configura Artemis.
          </p>
        ) : (
          <div className={styles.moduleGrid}>
            {modules.map((m) => (
              <Link key={m.href} href={m.href} className={styles.moduleTile}>
                <span className={styles.moduleMark}>{MODULE_MARK[m.href] || "·"}</span>
                <h3 className={styles.moduleTitle}>{m.title}</h3>
                <p className={styles.moduleSub}>{m.sub}</p>
                <span className={styles.moduleFoot}>Abrir</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <p className={styles.footNote}>
        Tenancy: header <code>X-Company-Id</code> + sitio activo. Capacidades derivadas del espejo
        Prisma alineado a Artemis (resource / acs / video / visitor / pms).
      </p>
    </div>
  );
}
