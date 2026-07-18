/**
 * Utilidades compartidas para formularios ERP — fetch, listas y mensajes de error.
 */
import { buildApiUrl } from "@/lib/api-base";

export function formatApiError(err: unknown, fallback = "Error desconocido"): string {
  if (err instanceof Error) {
    const raw = err.message.trim();
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as { message?: string | string[] };
      if (Array.isArray(parsed.message)) return parsed.message.join(", ");
      if (typeof parsed.message === "string") return parsed.message;
    } catch {
      /* plain text */
    }
    return raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
  }
  return fallback;
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
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
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
