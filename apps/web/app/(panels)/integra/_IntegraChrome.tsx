"use client";

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
  const [companyLabel, setCompanyLabel] = useState<string>("");
  const [tick, setTick] = useState(0);

  const refreshCaps = useCallback(async () => {
    try {
      const c = await integraApi<IntegraCapabilities>("integra/capabilities");
      setCaps(c);
      setCachedCapabilities(c);
    } catch {
      /* sin sesión / sin sitio */
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
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          marginBottom: 12,
          borderBottom: "1px solid var(--border, #e2e8f0)",
          background: "color-mix(in srgb, var(--accent, #1d4ed8) 6%, transparent)",
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
            Contexto · {companyLabel}
          </span>
          <IntegraSiteSwitcher
            onChange={() => {
              setTick((t) => t + 1);
              void refreshCaps();
            }}
          />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {activeMods.slice(0, 8).map((m) => (
            <span
              key={m.href}
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--surface, #fff)",
                border: "1px solid var(--border, #e2e8f0)",
                color: "var(--text-tertiary)",
              }}
            >
              {m.title}
            </span>
          ))}
          {!caps && (
            <span style={{ color: "var(--text-tertiary)" }}>Cargando módulos…</span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
