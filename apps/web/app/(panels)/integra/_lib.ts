import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";

const SITE_KEY = "nexara_integra_site_id";

export function getActiveIntegraSiteId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SITE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setActiveIntegraSiteId(id: number | null) {
  if (typeof window === "undefined") return;
  if (id == null) window.localStorage.removeItem(SITE_KEY);
  else window.localStorage.setItem(SITE_KEY, String(id));
}

/** Añade ?siteId= del sitio activo si no viene en la path. */
export function withSiteQuery(path: string): string {
  const siteId = getActiveIntegraSiteId();
  if (!siteId) return path;
  if (/[?&]siteId=/.test(path)) return path;
  return path.includes("?") ? `${path}&siteId=${siteId}` : `${path}?siteId=${siteId}`;
}

export async function integraApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(
    withTenantHeaders({
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    }),
  );
  const res = await fetch(buildApiUrl(withSiteQuery(path)), {
    ...init,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body?.message === "string"
        ? body.message
        : body?.message?.message || body?.detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export type IntegraCapabilities = {
  video: boolean;
  access: boolean;
  people: boolean;
  events: boolean;
  vehicles: boolean;
  anpr: boolean;
  visitors: boolean;
  alarms: boolean;
  settings: boolean;
};

export type IntegraModuleCard = {
  href: string;
  title: string;
  sub: string;
  capability: keyof IntegraCapabilities | "always";
};

export const INTEGRA_MODULE_CARDS: IntegraModuleCard[] = [
  { href: "/integra/video", title: "Video", sub: "HLS go2rtc · HCT token · snapshot", capability: "video" },
  { href: "/integra/access", title: "Accesos", sub: "Puertas · devices ACS · privilegios", capability: "access" },
  { href: "/integra/people", title: "Personas", sub: "Directorio · orgs Artemis", capability: "people" },
  { href: "/integra/events", title: "Eventos ACS", sub: "Timeline 24 h · fotos proxy", capability: "events" },
  { href: "/integra/alarms", title: "Alarmas", sub: "eventService records", capability: "alarms" },
  { href: "/integra/visitors", title: "Visitas", sub: "Citas · QR", capability: "visitors" },
  { href: "/integra/vehicles", title: "Vehículos", sub: "CRUD flota", capability: "vehicles" },
  { href: "/integra/anpr", title: "ANPR / PMS", sub: "Cruces de placa", capability: "anpr" },
  { href: "/integra/settings", title: "Sitios", sub: "Artemis/HCT · sync", capability: "settings" },
];

export const btnPrimary: React.CSSProperties = {
  border: "1px solid #155e75",
  background: "#0e7490",
  color: "#fff",
  borderRadius: 0,
  padding: "9px 14px",
  fontSize: 12,
  fontWeight: 650,
  cursor: "pointer",
};

export const btnGhost: React.CSSProperties = {
  border: "1px solid color-mix(in srgb, #0b1524 12%, transparent)",
  background: "#fff",
  color: "#243247",
  borderRadius: 0,
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 650,
  cursor: "pointer",
};

export const inputStyle: React.CSSProperties = {
  border: "1px solid color-mix(in srgb, #0b1524 14%, transparent)",
  borderRadius: 0,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
  maxWidth: 280,
  background: "#fff",
  color: "#0b1524",
};
