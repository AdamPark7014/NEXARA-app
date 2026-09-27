/**
 * Utilidades compartidas para formularios ERP — fetch, listas y mensajes de error.
 */
import { buildApiUrl } from "@/lib/api-base";
import { withTenantHeaders } from "@/lib/tenant";

const INTERNAL_ROUTE_ERROR = /\bCannot (GET|POST|PUT|PATCH|DELETE) \//;

export function formatApiError(err: unknown, fallback = "Error desconocido"): string {
  const raw = (err instanceof Error ? err.message : typeof err === "string" ? err : "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; error?: unknown };
    const msg = Array.isArray(parsed.message)
      ? parsed.message.filter((m): m is string => typeof m === "string").join(", ")
      : typeof parsed.message === "string"
        ? parsed.message
        : typeof parsed.error === "string"
          ? parsed.error
          : "";
    return msg.trim() && !INTERNAL_ROUTE_ERROR.test(msg) ? msg.trim() : fallback;
  } catch {
    /* plain text */
  }
  // HTML de un proxy caído, JSON truncado, un volcado de pila o la ruta interna del API: nada de eso se enseña.
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
    throw new Error(text || `HTTP ${res.status}`);
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