import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";
import { getActiveIntegraSiteId } from "@/app/(panels)/integra/_lib";

export type PresenceOccRow = {
  personId: string;
  personName: string | null;
  lastAt: string;
  lastDoor: string | null;
  lastPhoto: string | null;
  verifyMode: string | null;
  passes?: number;
  erpUser?: {
    id: number;
    nombre: string;
    email: string;
    employeeNumber: string | null;
    role?: { nombre: string } | null;
    department?: { nombre: string } | null;
  } | null;
};

export type PresenceOccupancy = {
  day: string;
  total: number;
  items: PresenceOccRow[];
  note?: string;
};

export type PersonPresenceDetail = {
  personId: string;
  personName: string | null;
  personCode: string | null;
  onSite: boolean;
  lastAt: string | null;
  lastDoor: string | null;
  lastPhoto: string | null;
  verifyMode: string | null;
  erpUser: {
    id: number;
    nombre: string;
    email: string;
    employeeNumber: string | null;
    role: string | null;
    department: string | null;
  } | null;
  doorsToday: Array<{
    id: number;
    at: string;
    door: string;
    doorNo: number | null;
    verifyMode: string | null;
    photoPath: string | null;
    outcome: string | null;
    label: string | null;
  }>;
  openActivities: Array<{
    id: number;
    anNumber: string;
    titulo: string;
    estatus: string;
    fechaEntregaEsperada: string | null;
    clientName: string | null;
  }>;
  crm: {
    leads: Array<{ id: number; name: string | null; company: string | null; status: string }>;
    opportunities: Array<{
      id: number;
      title: string;
      stage: string;
      value: number;
      clientName: string | null;
    }>;
  } | null;
  note?: string;
};

function withOptionalSite(path: string, siteId?: number | null): string {
  const sid = siteId ?? getActiveIntegraSiteId();
  if (!sid) return path;
  if (/[?&]siteId=/.test(path)) return path;
  return path.includes("?") ? `${path}&siteId=${sid}` : `${path}?siteId=${sid}`;
}

async function presenceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(
    withTenantHeaders({
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    }),
  );
  const res = await fetch(buildApiUrl(withOptionalSite(path)), {
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

export function fetchOccupancy(siteId?: number | null): Promise<PresenceOccupancy> {
  return presenceFetch<PresenceOccupancy>("integra/occupancy");
}

export function fetchPersonPresence(
  personId: string,
  siteId?: number | null,
): Promise<PersonPresenceDetail> {
  return presenceFetch<PersonPresenceDetail>(
    `integra/presence/${encodeURIComponent(personId)}`,
  );
}

export function relAgeEs(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h} h`;
}

export function hhmmEs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
