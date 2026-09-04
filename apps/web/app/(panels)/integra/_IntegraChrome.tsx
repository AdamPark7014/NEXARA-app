"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { subscribeActiveCompany } from "@/lib/tenant";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac/roles";
import Button from "@/components/ui/Button";
import {
  integraApi,
  type IntegraCapabilities,
} from "./_lib";
import { IntegraSiteSwitcher } from "./_SiteSwitcher";
import {
  getCachedCapabilities,
  moduleAllowedByCaps,
  setCachedCapabilities,
  setCachedProvider,
  getCachedProvider,
  subscribeCapabilities,
} from "./_caps";
import styles from "./integra.module.css";

const PATH_TO_MODULE: Record<string, string> = {
  "/integra": "integra-home",
  "/integra/video": "integra-video",
  "/integra/access": "integra-access",
  "/integra/people": "integra-people",
  "/integra/events": "integra-events",
  "/integra/vehicles": "integra-vehicles",
  "/integra/alarms": "integra-alarms",
  "/integra/visitors": "integra-visitors",
  "/integra/anpr": "integra-anpr",
  "/integra/settings": "integra-settings",
  "/integra/audit": "integra-audit",
  "/integra/map": "integra-map",
};

type HealthBrief = {
  connected?: boolean;
  configured?: boolean;
  provider?: string;
  host?: string | null;
};

type DashBrief = {
  cameras?: number;
  doors?: number;
  doorsOnline?: number;
  people?: number;
};

/** Barra de contexto del sitio — la nav vive en AppShell (como CRM/ERP). */
export function IntegraChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const isClient = resolveV2RoleKey(user) === ROLES.CLIENTE;
  const [caps, setCaps] = useState<IntegraCapabilities | null>(null);
  const [health, setHealth] = useState<HealthBrief | null>(null);
  const [dash, setDash] = useState<DashBrief | null>(null);
  const [mediaDown, setMediaDown] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tick, setTick] = useState(0);

  const refreshCaps = useCallback(async () => {
    try {
      const c = await integraApi<IntegraCapabilities>("integra/capabilities");
      setCaps(c);
      setCachedCapabilities(c);
    } catch {
      /* sin sesión */
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const [h, d] = await Promise.all([
        integraApi<HealthBrief>("integra/health"),
        integraApi<DashBrief>("integra/dashboard").catch(() => null),
      ]);
      setHealth(h);
      if (h?.provider) setCachedProvider(h.provider);
      if (d) setDash(d);
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    setCaps(getCachedCapabilities());
    void refreshCaps();
    void refreshHealth();
    const unsub = subscribeActiveCompany(() => {
      setTick((t) => t + 1);
      void refreshCaps();
      void refreshHealth();
    });
    const unsubCaps = subscribeCapabilities((c) => setCaps(c));
    
    const probeMedia = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const g = json?.info?.go2rtc || json?.error?.go2rtc || json?.details?.go2rtc;
        // Sin indicador no se alarma: un health que no reporta video no es un
        // video caído.
        if (!g || typeof g !== "object") {
          setMediaDown(false);
          return;
        }
        // El health devuelve `status: 200` —el código HTTP— pero antes se
        // comparaba contra los textos "up"/"ok". Como "200" no es ninguno, el
        // aviso "Video offline" quedaba encendido de forma permanente mientras
        // el video se veía perfectamente. Una alarma que siempre miente enseña
        // a ignorar las alarmas, así que se aceptan las dos formas.
        const raw = g.status ?? g.status?.status;
        const asNumber = Number(raw);
        const healthy = Number.isFinite(asNumber)
          ? asNumber >= 200 && asNumber < 300
          : ["up", "ok", "healthy"].includes(String(raw ?? "").toLowerCase());
        setMediaDown(raw != null && !healthy);
      } catch {
        /* no tocar el estado anterior */
      }
    };
    void probeMedia();
    const mediaIv = setInterval(() => void probeMedia(), 60000);

    const iv = setInterval(() => void refreshHealth(), 30000);
    return () => {
      unsub();
      unsubCaps();
      clearInterval(iv);
      clearInterval(mediaIv);
    };
  }, [refreshCaps, refreshHealth, tick]);

  useEffect(() => {
    if (!caps || !pathname) return;
    const clean = pathname.replace(/\/$/, "") || "/integra";
    const moduleId = PATH_TO_MODULE[clean];
    if (!moduleId || moduleId === "integra-home") return;
    const provider = health?.provider || getCachedProvider();
    if (provider === "HCT" && ["integra-people", "integra-visitors", "integra-vehicles", "integra-anpr"].includes(moduleId)) {
      router.replace("/integra");
      return;
    }
    if (isClient && !moduleAllowedByCaps(moduleId, caps)) {
      router.replace("/integra");
    }
  }, [caps, pathname, router, isClient, health?.provider]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await integraApi("integra/sync", { method: "POST" });
      await refreshHealth();
      await refreshCaps();
      setTick((t) => t + 1);
    } catch {
      /* página muestra error */
    } finally {
      setSyncing(false);
    }
  };

  const healthTone =
    health?.connected === true ? "ok" : health?.configured ? "warn" : "off";
  const healthLabel = health?.connected
    ? "Sitio conectado"
    : health?.configured
      ? "Sin enlace"
      : isClient
        ? "Pendiente"
        : "Sin sitio";

  const showKpis = Boolean(
    dash && ((dash.cameras ?? 0) > 0 || (dash.doors ?? 0) > 0 || (dash.people ?? 0) > 0),
  );

  return (
    <div className={styles.shell} data-client={isClient ? "1" : undefined}>
      <div className={styles.contextBar}>
        <div className={styles.contextLeft}>
          <span className={styles.healthPill} data-tone={healthTone}>
            <span className={styles.hudHealth} data-tone={healthTone} />
            {healthLabel}
          </span>
          {mediaDown && (
            <span className={styles.healthPill} data-tone="warn" title="Servicio de video (go2rtc)">
              Video offline
            </span>
          )}
          <IntegraSiteSwitcher
            onChange={() => {
              setTick((t) => t + 1);
              void refreshCaps();
              void refreshHealth();
            }}
          />
          {showKpis && (
            <div className={styles.contextKpis} aria-label="Resumen del sitio">
              <span className={styles.kpiChip}>
                <strong>{dash?.cameras ?? 0}</strong> cam
              </span>
              <span className={styles.kpiChip}>
                <strong>
                  {dash?.doorsOnline != null
                    ? `${dash.doorsOnline}/${dash.doors ?? 0}`
                    : dash?.doors ?? 0}
                </strong>{" "}
                pta
              </span>
              <span className={styles.kpiChip}>
                <strong>{dash?.people ?? 0}</strong> pers
              </span>
            </div>
          )}
        </div>
        <div className={styles.contextRight}>
          {(dash?.cameras ?? 0) > 0 && (
            <div className={styles.contextQuick}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/integra/video")}
              >
                Video wall
              </Button>
            </div>
          )}
          {!isClient && caps?.settings !== false && (
            <Button
              variant="secondary"
              size="sm"
              loading={syncing}
              disabled={syncing}
              onClick={() => void syncNow()}
            >
              {syncing ? "Sincronizando…" : "Sincronizar"}
            </Button>
          )}
        </div>
      </div>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
