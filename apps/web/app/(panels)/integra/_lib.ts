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
  canControlDoors?: boolean;
};

export type IntegraModuleCard = {
  href: string;
  title: string;
  sub: string;
  capability: keyof IntegraCapabilities | "always";
};

export const INTEGRA_MODULE_CARDS: IntegraModuleCard[] = [
  { href: "/integra/video", title: "Video", sub: "Live · wall · snapshot", capability: "video" },
  { href: "/integra/access", title: "Accesos", sub: "Puertas · devices ACS · privilegios", capability: "access" },
  { href: "/integra/people", title: "Personas", sub: "Directorio · organizaciones", capability: "people" },
  { href: "/integra/events", title: "Eventos ACS", sub: "Timeline 24 h · fotos proxy", capability: "events" },
  { href: "/integra/alarms", title: "Alarmas", sub: "Abiertas · histórico · tickets", capability: "alarms" },
  { href: "/integra/visitors", title: "Visitas", sub: "Citas · QR", capability: "visitors" },
  { href: "/integra/vehicles", title: "Vehículos", sub: "CRUD flota", capability: "vehicles" },
  { href: "/integra/anpr", title: "ANPR / PMS", sub: "Cruces de placa", capability: "anpr" },
  { href: "/integra/settings", title: "Sitios", sub: "Conexión · sync", capability: "settings" },
];

export const btnPrimary: React.CSSProperties = {
  border: "1px solid color-mix(in srgb, #155e75 70%, transparent)",
  background:
    "linear-gradient(180deg, color-mix(in srgb, #0e7490 88%, white) 0%, #0e7490 55%, #155e75 100%)",
  color: "#fff",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 12,
  fontWeight: 650,
  cursor: "pointer",
};

export const btnGhost: React.CSSProperties = {
  border: "1px solid color-mix(in srgb, #0b1524 12%, transparent)",
  background: "var(--surface, #fff)",
  color: "#243247",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 650,
  cursor: "pointer",
};

export const inputStyle: React.CSSProperties = {
  border: "1px solid color-mix(in srgb, #0b1524 14%, transparent)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  width: "100%",
  maxWidth: 280,
  background: "var(--surface, #fff)",
  color: "var(--text-primary, #0b1524)",
};

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  maxWidth: 320,
};

export const filterRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  marginBottom: 12,
};

/** datetime-local value from Date (local TZ). */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO string from datetime-local input. */
export function fromDatetimeLocalValue(s: string): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function defaultRangeHours(hours = 24): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  return { start: toDatetimeLocalValue(start), end: toDatetimeLocalValue(end) };
}

/** doControl Artemis (Developer Guide). */
export const DOOR_CONTROL_OPTIONS = [
  { value: "2", label: "Abrir (momentáneo)" },
  { value: "1", label: "Cerrar" },
  { value: "0", label: "Quedar abierta" },
  { value: "3", label: "Quedar cerrada" },
] as const;

export type DoorControlType = (typeof DOOR_CONTROL_OPTIONS)[number]["value"];
