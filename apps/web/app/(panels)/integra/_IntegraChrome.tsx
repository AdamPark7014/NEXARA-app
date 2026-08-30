"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getActiveCompanyId, subscribeActiveCompany } from "@/lib/tenant";
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

export function IntegraChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [caps, setCaps] = useState<IntegraCapabilities | null>(null);
  const [companyLabel, setCompanyLabel] = useState("Empresa primaria");
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

  useEffect(() => {
    setCaps(getCachedCapabilities());
    void refreshCaps();
    const unsub = subscribeActiveCompany(() => {
      setTick((t) => t + 1);
      void refreshCaps();
    });
    const unsubCaps = subscribeCapabilities((c) => setCaps(c));
    return () => {
      unsub();
      unsubCaps();
    };
  }, [refreshCaps, tick]);

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

  return (
    <div className={styles.shell}>
      <div className={styles.hud}>
        <div className={styles.hudLeft}>
          <span className={styles.hudBrand}>Integra</span>
          <span className={styles.hudCompany}>{companyLabel}</span>
          <IntegraSiteSwitcher
            onChange={() => {
              setTick((t) => t + 1);
              void refreshCaps();
            }}
          />
        </div>
        <nav className={styles.hudMods} aria-label="Módulos activos">
          {activeMods.map((m) => (
            <Link key={m.href} href={m.href} className={styles.hudChip}>
              {m.title}
            </Link>
          ))}
          {!caps && <span className={styles.hudChip}>Cargando…</span>}
        </nav>
      </div>
      <div className={styles.inner}>{children}</div>
    </div>
  );
}
