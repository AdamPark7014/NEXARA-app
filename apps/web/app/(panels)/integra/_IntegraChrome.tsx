"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { subscribeActiveCompany } from "@/lib/tenant";
import { useUser } from "@/components/UserContext";
import { resolveV2RoleKey } from "@/lib/user-access";
import { ROLES } from "@/lib/rbac/roles";
import {
  integraApi,
  type IntegraCapabilities,
} from "./_lib";
import { IntegraSiteSwitcher } from "./_SiteSwitcher";
import {
  getCachedCapabilities,
  moduleAllowedByCaps,
  setCachedCapabilities,
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
};

type HealthBrief = {
  connected?: boolean;
  configured?: boolean;
  provider?: string;
};

/** Barra de contexto del sitio — la nav vive en AppShell (como CRM/ERP). */
export function IntegraChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const isClient = resolveV2RoleKey(user) === ROLES.CLIENTE;
  const [caps, setCaps] = useState<IntegraCapabilities | null>(null);
  const [health, setHealth] = useState<HealthBrief | null>(null);
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
      const h = await integraApi<HealthBrief>("integra/health");
      setHealth(h);
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
    const iv = setInterval(() => void refreshHealth(), 30000);
    return () => {
      unsub();
      unsubCaps();
      clearInterval(iv);
    };
  }, [refreshCaps, refreshHealth, tick]);

  useEffect(() => {
    if (!caps || !pathname) return;
    const clean = pathname.replace(/\/$/, "") || "/integra";
    const moduleId = PATH_TO_MODULE[clean];
    if (!moduleId || moduleId === "integra-home") return;
    // Solo redirige si el módulo está explícitamente apagado (override / sin permiso settings).
    // Sin inventario el menú sigue visible para que el staff explore.
    if (isClient && !moduleAllowedByCaps(moduleId, caps)) {
      router.replace("/integra");
    }
  }, [caps, pathname, router, isClient]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await integraApi("integra/sync", { method: "POST" });
      await refreshHealth();
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
    ? `En línea · ${health.provider === "HCT" ? "Hik-Connect" : "HikCentral"}`
    : health?.configured
      ? "Sitio sin enlace"
      : isClient
        ? "Pendiente de activación"
        : "Sin sitio";

  return (
    <div className={styles.shell} data-client={isClient ? "1" : undefined}>
      <div className={styles.contextBar}>
        <div className={styles.contextLeft}>
          <span
            className={styles.hudHealth}
            data-tone={healthTone}
            title={healthLabel}
          />
          <span className={styles.contextLabel}>{healthLabel}</span>
          <IntegraSiteSwitcher
            onChange={() => {
              setTick((t) => t + 1);
              void refreshCaps();
              void refreshHealth();
            }}
          />
        </div>
        <div className={styles.contextRight}>
          {!isClient && caps?.settings !== false && (
            <button
              type="button"
              className={styles.hudChip}
              disabled={syncing}
              onClick={() => void syncNow()}
            >
              {syncing ? "Sincronizando…" : "Sincronizar"}
            </button>
          )}
        </div>
      </div>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
