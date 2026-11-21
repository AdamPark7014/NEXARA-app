/**
 * Utilidades compartidas para formularios ERP — fetch, listas y mensajes de error.
 */
import { buildApiUrl } from "@/lib/api-base";
import { manejarErrorJornada } from "@/lib/jornada-candado";
import { MENSAJE_SIN_CONEXION, esTextoDeRedCaida } from "@/lib/red-caida";
import { withTenantHeaders } from "@/lib/tenant";

// La ruta interna o el «Tu rol (x) no puede acceder a GET /api/…» nunca se le enseñan a nadie (11-11).
const INTERNAL_ROUTE_ERROR = /\bCannot (GET|POST|PUT|PATCH|DELETE) \/|no puede acceder a (GET|POST|PUT|PATCH|DELETE) \//;

// Un 500 sin mensaje propio llega con el texto genérico del marco, en inglés.
const SERVIDOR_GENERICO = /^internal server error$/i;
export const MENSAJE_SERVIDOR_CON_PROBLEMA = "El servidor tuvo un problema. Vuelve a intentarlo en un momento.";
// Lo que deja `erpFetch` cuando el servidor falla sin cuerpo: «HTTP 502».
const SOLO_CODIGO_DE_SERVIDOR = /^HTTP 5\d\d$/;

/**
 * Une el texto de un error con la frase que le sigue. El error puede traer ya su
 * punto («…vuelve a intentarlo.») y pegarle otro dejaba «intentarlo.. Se muestra…».
 */
export function errorSeguidoDe(error: string, frase: string): string {
  const base = error.trim();
  return /[.!?…]$/.test(base) ? `${base} ${frase}` : `${base}. ${frase}`;
}

export function formatApiError(err: unknown, fallback = "Error desconocido"): string {
  const raw = (err instanceof Error ? err.message : typeof err === "string" ? err : "").trim();
  if (!raw) return fallback;
  // «Failed to fetch», «Load failed»: el texto del navegador cuando no hubo red.
  if (esTextoDeRedCaida(raw)) return MENSAJE_SIN_CONEXION;
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; error?: unknown };
    const msg = Array.isArray(parsed.message)
      ? parsed.message.filter((m): m is string => typeof m === "string").join(", ")
      : typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.error === "string"
          ? parsed.error
          : "";
    if (SERVIDOR_GENERICO.test(msg.trim())) return MENSAJE_SERVIDOR_CON_PROBLEMA;
    return msg.trim() && !INTERNAL_ROUTE_ERROR.test(msg) ? msg.trim() : fallback;
  } catch {
    /* plain text */
  }
  // HTML de un proxy caído, JSON truncado, un volcado de pila o la ruta interna del API: nada de eso se enseña.
  if (SERVIDOR_GENERICO.test(raw) || SOLO_CODIGO_DE_SERVIDOR.test(raw)) return MENSAJE_SERVIDOR_CON_PROBLEMA;
  if (/^\s*[{[<]/.test(raw) || /\n\s+at\s/.test(raw) || INTERNAL_ROUTE_ERROR.test(raw)) return fallback;
  return raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
}

export function asList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: T[] }).data)) {
    return (payload as { data: T[] }).data;
  }
  return [];
}

export async function erpFetch<T = unknown>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };

  // Sin `X-Company-Id` el servidor resuelve la empresa desde la membresía del
  // usuario, así que no hay fuga de datos — pero el cambio de empresa deja de
  // surtir efecto en silencio: quien tiene dos empresas sigue viendo la primera.
  const withTenant = withTenantHeaders(headers);

  const res = await fetch(buildApiUrl(path), {
    ...init,
    // Cookie HttpOnly `nexara_token` (Bearer suele ser sentinel `session-cookie`).
    credentials: "include",
    headers: withTenant,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(text || `HTTP ${res.status}`);
    // Un solo sitio: 409 JORNADA_NO_ABIERTA abre la barrera de checada.
    manejarErrorJornada(err);
    throw err;
  }

  if (res.status === 204) return null as T;

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const erpInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--foreground)",
  fontSize: 13,
  boxSizing: "border-box",
};

export const erpModalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

export const erpModalBox: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: 14,
  width: "100%",
  maxWidth: 520,
  maxHeight: "min(88vh, 640px)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 20px 48px rgba(0,0,0,0.22)",
  border: "1px solid var(--border)",
  overflow: "hidden",
};

/** Tag variants for finance statuses (invoices, journal, viatics, payments). */
export function financeStatusVariant(
  status: string | null | undefined,
): "default" | "positive" | "warning" | "danger" | "accent" {
  const s = (status || "").toUpperCase();
  if (["PAID", "PAGADO", "POSTED", "CONTABILIZADA", "APROBADO", "APROBADA", "MATCHED", "SENT", "ACTIVE"].includes(s)) {
    return "positive";
  }
  if (["DRAFT", "BORRADOR", "PENDING", "PENDIENTE", "PARTIALLY_PAID", "STAMPING"].includes(s)) {
    return "warning";
  }
  if (["CANCELLED", "CANCELADA", "REJECTED", "RECHAZADO", "OVERDUE", "REVERSED"].includes(s)) {
    return "danger";
  }
  if (["PPD", "PUE"].includes(s)) return "accent";
  return "default";
}