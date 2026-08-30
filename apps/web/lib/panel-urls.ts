import { SUBDOMAIN_CONFIG } from "@/lib/subdomain-config";

export type PanelSlug =
  | "console"
  | "operacion"
  | "ventas"
  | "contabilidad"
  | "web"
  | "tickets"
  | "support"
  | "noc"
  | "people"
  | "lab";

/**
 * Subdominios canónicos públicos para cada slug interno.
 * Estos son los nombres "bonitos" que verá el usuario final en producción y
 * en dev local (p.ej. core.localhost:3000).
 *
 * Aliases legacy (consola, ventas, operacion, contabilidad, web, tickets, help,
 * monitor, rh, hr, dev) son soportados por el middleware pero redirigen 308 a
 * estos canónicos.
 */
const SUBDOMAIN_PUBLIC_KEYS: Record<PanelSlug, string> = {
  console: "core",
  operacion: "ops",
  ventas: "sales",
  contabilidad: "finance",
  web: "studio",
  tickets: "portal",
  support: "support",
  noc: "noc",
  people: "people",
  lab: "lab",
};

/** Rutas operativas que viven en el panel operacion (no en consola/admin). */
export const OPERATIONAL_PATH_SEGMENTS = new Set([
  "activities",
  "my-activities",
  "evidences",
  "my-evidences",
  "service-sheets",
  "projects",
  "client-tickets",
  "vehicles",
  "my-vehicles",
  "gps",
  "tools",
  "viatics",
  "my-viatics",
  "assets",
  "maintenance",
  "work-projects",
]);

export function normalizePanelPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function isOperationalPanelPath(pathname: string, slugPrefix?: string) {
  const parts = pathname.split("/").filter(Boolean);
  const index = slugPrefix && parts[0]?.toLowerCase() === slugPrefix ? 1 : 0;
  const segment = parts[index]?.toLowerCase();
  return Boolean(segment && OPERATIONAL_PATH_SEGMENTS.has(segment));
}

/**
 * Resuelve URL absoluta de un panel (subdominio en prod, prefijo /slug en localhost plano).
 */
export function getPanelUrl(panel: PanelSlug, path = "/") {
  const normalizedPath = normalizePanelPath(path);
  const config = SUBDOMAIN_CONFIG[panel];
  const publicKey = SUBDOMAIN_PUBLIC_KEYS[panel];

  if (typeof window === "undefined") {
    return `/${panel}${normalizedPath === "/" ? "" : normalizedPath}`;
  }

  const { protocol, hostname, port } = window.location;
  const hostLower = hostname.toLowerCase();
  const isLocal =
    hostLower.includes("localhost") ||
    hostLower === "127.0.0.1" ||
    hostLower.endsWith(".local");

  if (isLocal) {
    const hasSubdomain = hostLower.split(".").length > 1 && !hostLower.startsWith("127.");
    if (hasSubdomain) {
      const baseHost = hostLower.includes("localhost") ? "localhost" : hostLower.split(".").slice(-2).join(".");
      const portSuffix = port ? `:${port}` : "";
      return `${protocol}//${publicKey}.${baseHost}${portSuffix}${normalizedPath}`;
    }
    return `/${panel}${normalizedPath === "/" ? "" : normalizedPath}`;
  }

  const domain = config?.publicDomain || `${publicKey}.nexara.com.mx`;
  return `${protocol}//${domain}${normalizedPath}`;
}

export function getOperacionUrl(path = "/") {
  return getPanelUrl("operacion", path);
}

export function getVentasUrl(path = "/") {
  return getPanelUrl("ventas", path);
}

export function getConsoleUrl(path = "/") {
  return getPanelUrl("console", path);
}

/** URL del portal cliente (tickets). */
export function getTicketsUrl(path = "/") {
  return getPanelUrl("tickets", path);
}

/**
 * URL de Integra (no está en PanelSlug histórico; vive en subdomain-config).
 */
export function getIntegraUrl(path = "/") {
  const normalizedPath = normalizePanelPath(path);
  if (typeof window === "undefined") {
    return `/integra${normalizedPath === "/" ? "" : normalizedPath}`;
  }
  const { protocol, hostname, port } = window.location;
  const hostLower = hostname.toLowerCase();
  const isLocal =
    hostLower.includes("localhost") ||
    hostLower === "127.0.0.1" ||
    hostLower.endsWith(".local");
  if (isLocal) {
    const hasSubdomain = hostLower.split(".").length > 1 && !hostLower.startsWith("127.");
    if (hasSubdomain) {
      const baseHost = hostLower.includes("localhost") ? "localhost" : hostLower.split(".").slice(-2).join(".");
      const portSuffix = port ? `:${port}` : "";
      return `${protocol}//integra.${baseHost}${portSuffix}${normalizedPath}`;
    }
    return `/integra${normalizedPath === "/" ? "" : normalizedPath}`;
  }
  const domain = SUBDOMAIN_CONFIG.integra?.publicDomain || "integra.nexara.com.mx";
  return `${protocol}//${domain}${normalizedPath}`;
}
