"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { subscribeActiveCompany } from "@/lib/tenant";
import { useUser } from "@/components/UserContext";
import CompanySwitcher from "@/components/CompanySwitcher";
import { NEXARA_LOGO_MARK } from "@/lib/brand";
import { type PanelId } from "@/lib/access-matrix";
import {
  getUserAllowedPanels,
  getUserPanelSwitchPath,
  getUserRoleLabel,
} from "@/lib/user-access";
import { buildCrossPanelUrl } from "@/lib/cross-panel-handoff";
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
  const [health, setHealth] = useState<HealthBrief | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tick, setTick] = useState(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  const allowedPanels = useMemo(
    () => (user ? getUserAllowedPanels(user) : []),
    [user],
  );

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
    if (!moduleAllowedByCaps(moduleId, caps)) {
      router.replace("/integra");
    }
  }, [caps, pathname, router]);

  useEffect(() => {
    if (!switcherOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!switcherRef.current?.contains(e.target as Node)) setSwitcherOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [switcherOpen]);

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
  const userJson = user ? JSON.stringify(user) : null;

  return (
    <div className={styles.shell} style={{ ["--panel-accent" as string]: "#0e7490" }}>
      <div className={styles.hud}>
        <div className={styles.hudLeft}>
          <Link href="/integra" className={styles.hudBrandBlock}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.hudMark} src={NEXARA_LOGO_MARK} alt="" />
            <span className={styles.hudBrandText}>
              <span className={styles.hudBrand}>Integra</span>
              <span className={styles.hudBrandSub}>Nexara</span>
            </span>
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
          <CompanySwitcher compact />
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

          {allowedPanels.length > 1 && (
            <div ref={switcherRef} style={{ position: "relative" }}>
              <button
                type="button"
                className={styles.hudChip}
                onClick={() => setSwitcherOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={switcherOpen}
              >
                Paneles ▾
              </button>
              {switcherOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    minWidth: 220,
                    zIndex: 40,
                    background: "var(--surface, #fff)",
                    border: "1px solid var(--nx-panel-hairline, #e2e8f0)",
                    borderRadius: 12,
                    boxShadow: "0 12px 32px rgba(8,24,38,0.14)",
                    padding: 6,
                  }}
                >
                  <div
                    style={{
                      padding: "6px 10px 4px",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    Mis paneles
                  </div>
                  {allowedPanels.map((p) => {
                    const href = buildCrossPanelUrl(
                      p.id,
                      getUserPanelSwitchPath(user, p.id),
                      userJson,
                    );
                    const current = p.id === ("integra" as PanelId);
                    return (
                      <a
                        key={p.id}
                        href={href}
                        role="menuitem"
                        onClick={() => setSwitcherOpen(false)}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          padding: "8px 10px",
                          borderRadius: 8,
                          textDecoration: "none",
                          color: "var(--text-primary)",
                          background: current
                            ? "color-mix(in srgb, var(--panel-accent, #0e7490) 12%, transparent)"
                            : "transparent",
                          fontSize: 13,
                          fontWeight: current ? 700 : 550,
                        }}
                      >
                        <span aria-hidden>{p.icon || "◆"}</span>
                        <span>{p.name?.replace(/^NEXARA\s+/i, "") || p.id}</span>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {user && (
            <span className={styles.hudUser} title={getUserRoleLabel(user)}>
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
