"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { setActiveCompanyId } from "@/lib/tenant";
import {
  IgBadge,
  IgBtn,
  IgError,
  IgPage,
  IgPanel,
  IgTable,
  IgToolbar,
} from "./_Console";
import {
  DOOR_CONTROL_OPTIONS,
  DoorControlType,
  integraApi,
  INTEGRA_MODULE_CARDS,
  setActiveIntegraSiteId,
  type IntegraCapabilities,
} from "./_lib";
import { setCachedCapabilities } from "./_caps";
import styles from "./integra.module.css";

type Dash = {
  connected: boolean;
  configured: boolean;
  host?: string | null;
  source?: string | null;
  provider?: string;
  cameras: number;
  doors: number;
  doorsOnline?: number;
  doorsOffline?: number;
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
    totals: {
      cameras: number;
      doors: number;
      people: number;
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
      _count: { cameras: number; doors: number; people: number; vehicles: number };
    }>;
  }>;
};

type Door = {
  id: string;
  name: string;
  location?: string;
  online?: boolean;
  status?: string;
};

type Ev = {
  id: string;
  doorName?: string;
  personName?: string;
  eventType?: string;
  timestamp?: string;
};

type AuditRow = {
  id: number;
  action: string;
  createdAt: string;
  userEmail?: string | null;
  entityId?: number;
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

export default function IntegraHome() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [doors, setDoors] = useState<Door[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [controlType, setControlType] = useState<DoorControlType>("2");
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [busyDoor, setBusyDoor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [d, p, doorRes, evRes, auRes] = await Promise.all([
        integraApi<Dash>("integra/dashboard"),
        integraApi<Portfolio>("integra/portfolio").catch(() => null),
        integraApi<{ items: Door[] }>("integra/doors").catch(() => ({ items: [] })),
        integraApi<{ items: Ev[] }>("integra/events?limit=30").catch(() => ({ items: [] })),
        integraApi<{ items: AuditRow[] }>("integra/audit?limit=25").catch(() => ({ items: [] })),
      ]);
      setDash(d);
      setPortfolio(p);
      setDoors(doorRes.items);
      setEvents(evRes.items);
      setAudit(auRes.items);
      if (d.capabilities) setCachedCapabilities(d.capabilities);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [tick]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 45000);
    return () => clearInterval(t);
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

  const controlDoor = async (id: string) => {
    setBusyDoor(id);
    try {
      await integraApi(`integra/doors/${encodeURIComponent(id)}/control`, {
        method: "POST",
        body: JSON.stringify({ controlType }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error puerta");
    } finally {
      setBusyDoor(null);
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

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("es-MX", { hour12: false }) : "—";

  return (
    <IgPage>
      <IgToolbar
        title="Consola operativa"
        meta={
          <>
            {dash?.provider || "ARTEMIS"} · {dash?.host || "—"} · {dash?.source || "—"} · sync{" "}
            {dash?.lastSync?.status || "—"}
          </>
        }
        actions={
          <>
            <IgBtn onClick={() => void refresh()}>Refresh</IgBtn>
            {caps?.settings !== false && (
              <IgBtn variant="primary" disabled={syncing} onClick={() => void syncNow()}>
                {syncing ? "Sync…" : "Sincronizar"}
              </IgBtn>
            )}
          </>
        }
      />

      <IgError>{error}</IgError>

      <div className={styles.stats} role="group" aria-label="KPIs">
        <div className={styles.stat}>
          <span className={styles.statLabel}>Link</span>
          <span
            className={`${styles.statValue} ${
              dash?.connected ? styles.statOk : dash?.configured ? styles.statWarn : styles.statDanger
            }`}
          >
            {!dash ? "…" : dash.connected ? "OK" : dash.configured ? "DOWN" : "—"}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Cámaras</span>
          <span className={styles.statValue}>{dash?.cameras ?? 0}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Puertas</span>
          <span className={styles.statValue}>
            {dash?.doorsOnline ?? "—"}/{dash?.doors ?? 0}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Off</span>
          <span className={`${styles.statValue} ${styles.statWarn}`}>{dash?.doorsOffline ?? 0}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Personas</span>
          <span className={styles.statValue}>{dash?.people ?? 0}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Flota</span>
          <span className={styles.statValue}>{dash?.vehicles ?? 0}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Devices</span>
          <span className={styles.statValue}>{dash?.devices ?? 0}</span>
        </div>
      </div>

      <nav className={styles.modRail} aria-label="Módulos">
        {modules.map((m) => (
          <Link key={m.href} href={m.href} className={styles.modChip}>
            <span className={styles.modChipMark}>{MODULE_MARK[m.href] || "·"}</span>
            {m.title}
          </Link>
        ))}
      </nav>

      <div className={styles.opsGrid}>
        <IgPanel
          title="Matriz de puertas"
          count={`${doors.length}`}
          flush
          actions={
            <select
              value={controlType}
              onChange={(e) => setControlType(e.target.value as DoorControlType)}
              style={{ fontSize: 11, padding: "2px 6px" }}
              aria-label="doControl"
            >
              {DOOR_CONTROL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          }
        >
          <div className={styles.doorMatrix} style={{ padding: 8 }}>
            {doors.map((d) => (
              <button
                key={d.id}
                type="button"
                className={styles.doorCell}
                data-online={d.online === false ? "0" : "1"}
                disabled={busyDoor === d.id}
                onClick={() => void controlDoor(d.id)}
                title={`${d.name} · ${d.status || ""} · click = doControl`}
              >
                <span className={styles.doorCellName}>{d.name}</span>
                <span className={styles.doorCellMeta}>
                  {d.location || d.id}
                </span>
                <IgBadge tone={d.online === false ? "warn" : "ok"}>
                  {busyDoor === d.id ? "…" : d.status || (d.online === false ? "off" : "online")}
                </IgBadge>
              </button>
            ))}
            {doors.length === 0 && <p className={styles.igEmpty}>Sin puertas — sincroniza el sitio</p>}
          </div>
        </IgPanel>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <IgPanel title="Eventos ACS · recientes" count={events.length} flush>
            <IgTable
              columns={[
                { key: "t", label: "Hora", width: "28%", mono: true },
                { key: "p", label: "Persona" },
                { key: "d", label: "Puerta" },
                { key: "e", label: "Tipo" },
              ]}
              rows={events.map((e) => ({
                key: e.id || `${e.timestamp}-${e.personName}`,
                cells: {
                  t: fmt(e.timestamp),
                  p: e.personName || "—",
                  d: e.doorName || "—",
                  e: e.eventType || "—",
                },
              }))}
              empty="Sin eventos 24 h"
            />
          </IgPanel>

          <IgPanel title="Bitácora Integra" count={audit.length} flush>
            <IgTable
              columns={[
                { key: "t", label: "Hora", width: "30%", mono: true },
                { key: "a", label: "Acción" },
                { key: "u", label: "Usuario" },
              ]}
              rows={audit.map((a) => ({
                key: String(a.id),
                cells: {
                  t: fmt(a.createdAt),
                  a: a.action.replace(/^integra\./, ""),
                  u: a.userEmail || "—",
                },
              }))}
              empty="Sin mutaciones auditadas"
            />
          </IgPanel>
        </div>
      </div>

      {portfolio && (
        <IgPanel
          title={portfolio.mode === "platform" ? "Clientes / sitios" : "Tus sitios"}
          count={`${portfolio.companyCount} emp · ${portfolio.siteCount} sitios`}
          flush
        >
          <IgTable
            columns={[
              { key: "c", label: "Empresa" },
              { key: "inv", label: "Inventario", mono: true },
              { key: "s", label: "Sitio" },
              { key: "h", label: "Host", mono: true },
              { key: "x", label: "", width: "90px" },
            ]}
            rows={portfolio.companies.flatMap((c) =>
              (c.sites.length ? c.sites : [{ id: 0, name: "—", host: "—", lastSyncAt: null, _count: { cameras: 0, doors: 0, people: 0, vehicles: 0 } }]).map(
                (s) => ({
                  key: `${c.companyId}-${s.id}`,
                  cells: {
                    c: c.name,
                    inv: `${c.totals.cameras}c/${c.totals.doors}p/${c.totals.people}per`,
                    s: s.label || s.name,
                    h: s.host,
                    x:
                      s.id > 0 ? (
                        <IgBtn onClick={() => openClient(c.companyId, s.id)}>Sitio</IgBtn>
                      ) : portfolio.mode === "platform" ? (
                        <IgBtn variant="primary" onClick={() => openClient(c.companyId)}>
                          Entrar
                        </IgBtn>
                      ) : (
                        "—"
                      ),
                  },
                }),
              ),
            )}
            empty="Sin sitios configurados"
          />
        </IgPanel>
      )}
    </IgPage>
  );
}
