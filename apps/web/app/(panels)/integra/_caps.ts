import type { IntegraCapabilities } from "./_lib";

const CAPS_KEY = "nexara_integra_caps";
const CAPS_EVENT = "nexara-integra-caps";

export const MODULE_CAPABILITY: Record<string, keyof IntegraCapabilities | "always"> = {
  "integra-home": "always",
  "integra-video": "video",
  "integra-access": "access",
  "integra-people": "people",
  "integra-schedules": "access",
  "integra-espacios": "access",
  "integra-events": "events",
  // La asistencia sale de los eventos de acceso: si el sitio no los tiene,
  // no hay nada que enseñar.
  "integra-attendance": "events",
  "integra-vehicles": "vehicles",
  "integra-alarms": "alarms",
  "integra-visitors": "visitors",
  "integra-anpr": "anpr",
  "integra-settings": "settings",
  "integra-audit": "settings",
  "integra-map": "always",
  "integra-my-profile": "always",
  "integra-notifications": "always",
};

export function setCachedCapabilities(caps: IntegraCapabilities | null) {
  if (typeof window === "undefined") return;
  if (!caps) {
    window.sessionStorage.removeItem(CAPS_KEY);
  } else {
    window.sessionStorage.setItem(CAPS_KEY, JSON.stringify(caps));
  }
  window.dispatchEvent(new CustomEvent(CAPS_EVENT, { detail: caps }));
}

export function getCachedCapabilities(): IntegraCapabilities | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CAPS_KEY);
    return raw ? (JSON.parse(raw) as IntegraCapabilities) : null;
  } catch {
    return null;
  }
}

export function subscribeCapabilities(cb: (caps: IntegraCapabilities | null) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<IntegraCapabilities | null>).detail;
    cb(detail ?? getCachedCapabilities());
  };
  window.addEventListener(CAPS_EVENT, handler);
  return () => window.removeEventListener(CAPS_EVENT, handler);
}

export function moduleAllowedByCaps(
  moduleId: string,
  caps: IntegraCapabilities | null,
): boolean {
  if (!caps) return true;
  const key = MODULE_CAPABILITY[moduleId];
  if (!key || key === "always") return true;
  return Boolean(caps[key]);
}

/** ¿Hay inventario espejo? Si no, el staff ve el menú completo (como CRM). */
export function integraHasInventory(caps: IntegraCapabilities | null): boolean {
  if (!caps) return false;
  return Boolean(
    caps.video ||
      caps.access ||
      caps.people ||
      caps.events ||
      caps.vehicles ||
      caps.alarms ||
      caps.visitors ||
      caps.anpr,
  );
}

const PROVIDER_KEY = "nexara_integra_provider";
const PROVIDER_EVENT = "nexara-integra-provider";

/** Módulos Artemis-only (ADR-0019) — ocultos en sitios HCT. */
export const HCT_HIDDEN_MODULES = new Set([
  "integra-people",
  "integra-attendance",
  "integra-visitors",
  "integra-vehicles",
  "integra-anpr",
]);

export function setCachedProvider(provider: string | null) {
  if (typeof window === "undefined") return;
  if (!provider) window.sessionStorage.removeItem(PROVIDER_KEY);
  else window.sessionStorage.setItem(PROVIDER_KEY, provider);
  window.dispatchEvent(new CustomEvent(PROVIDER_EVENT, { detail: provider }));
}

export function getCachedProvider(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(PROVIDER_KEY);
}

export function subscribeProvider(cb: (p: string | null) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (e: Event) => {
    cb((e as CustomEvent<string | null>).detail ?? getCachedProvider());
  };
  window.addEventListener(PROVIDER_EVENT, handler);
  return () => window.removeEventListener(PROVIDER_EVENT, handler);
}

/**
 * Visibilidad en sidebar.
 * - Staff sin inventario: muestra todo el catálogo (menos settings si no aplica).
 * - Con inventario / cliente: respeta caps (incl. override de sitio).
 * - HCT: oculta módulos Artemis-only.
 */
export function moduleShownInIntegraSidebar(
  moduleId: string,
  caps: IntegraCapabilities | null,
  opts?: { isClient?: boolean; provider?: string | null },
): boolean {
  const provider = opts?.provider ?? getCachedProvider();
  if (provider === "HCT" && HCT_HIDDEN_MODULES.has(moduleId)) return false;
  if (!caps) return true;
  const key = MODULE_CAPABILITY[moduleId];
  if (!key || key === "always") return true;
  if (key === "settings") return Boolean(caps.settings);
  if (!opts?.isClient && !integraHasInventory(caps)) return true;
  return Boolean(caps[key]);
}
