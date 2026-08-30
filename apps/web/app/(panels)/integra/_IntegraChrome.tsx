"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getActiveCompanyId, subscribeActiveCompany } from "@/lib/tenant";
import { useUser } from "@/components/UserContext";
import {
  integraApi,
  type IntegraCapabilities,
  INTEGRA_MODULE_CARDS,
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

export function IntegraChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useUser();
  const [caps, setCaps] = useState<IntegraCapabilities | null>(null);
  const [companyLabel, setCompanyLabel] = useState("Empresa");
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
    const id = getActiveCompanyId();
    setCompanyLabel(id ? `Empresa #${id}` : "Empresa primaria");
  }, [tick]);

  useEffect(() => {
    if (!caps || !pathname) return;
    const clean = pathname.replace(/\/$/, "") || "/integra";
    const moduleId = PATH_TO_MODULE[clean];
    if (!moduleId || moduleId === "integra-home") return;
    if (!moduleAllowedByCaps(moduleId, caps)) {
      router.replace("/integra");
    }
  }, [caps, pathname, router]);

  const activeMods = INTEGRA_MODULE_CARDS.filter(
    (m) => m.capability === "always" || (caps ? caps[m.capability] : true),
  );

  const syncNow = async () => {
    setSyncing(true);
    try {
      await integraApi("integra/sync", { method: "POST" });
      await refreshHealth();
      setTick((t) => t + 1);
    } catch {
      /* toast vía página */
    } finally {
      setSyncing(false);
    }
  };

  const healthTone =
    health?.connected === true ? "ok" : health?.configured ? "warn" : "off";

  const pathClean = (pathname || "/integra").replace(/\/$/, "") || "/integra";
  const homeActive = pathClean === "/integra";

  return (
    <div className={styles.shell}>
      <div className={styles.hud}>
        <div className={styles.hudLeft}>
          <Link href="/integra" className={styles.hudBrand}>
            Integra
          </Link>
          <span
            className={styles.hudHealth}
            data-tone={healthTone}
            title={
              health?.connected
                ? `En línea · ${health.provider || "ARTEMIS"}`
                : health?.configured
                  ? "Sitio configurado, sin enlace"
                  : "Sin sitio"
            }
          />
          <span className={styles.hudCompany}>{companyLabel}</span>
          <IntegraSiteSwitcher
            onChange={() => {
              setTick((t) => t + 1);
              void refreshCaps();
              void refreshHealth();
            }}
          />
        </div>
        <nav className={styles.hudMods} aria-label="Módulos">
          <Link
            href="/integra"
            className={styles.hudChip}
            data-active={homeActive ? "1" : undefined}
          >
            Ops
          </Link>
          {activeMods.map((m) => {
            const active =
              pathname === m.href ||
              (m.href !== "/integra" && pathname?.startsWith(m.href));
            return (
              <Link
                key={m.href}
                href={m.href}
                className={styles.hudChip}
                data-active={active ? "1" : undefined}
              >
                {m.title}
              </Link>
            );
          })}
          {caps?.settings !== false && (
            <button
              type="button"
              className={styles.hudChip}
              disabled={syncing}
              onClick={() => void syncNow()}
            >
              {syncing ? "Sync…" : "Sync"}
            </button>
          )}
          {!caps && <span className={styles.hudChip}>Cargando…</span>}
          {user?.nombre && (
            <span className={styles.hudUser} title={user.email || undefined}>
              {(user.nombre || user.email || "U").split(" ")[0]}
            </span>
          )}
          <button type="button" className={styles.hudChip} onClick={() => logout()}>
            Salir
          </button>
        </nav>
      </div>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
