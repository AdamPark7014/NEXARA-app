"use client";

/**
 * Multi-tenant base: manejo de la empresa activa en el frontend.
 *
 * El usuario puede pertenecer a una o más empresas (CompanyProfile). La activa
 * se guarda en localStorage y se envía al backend como header `X-Company-Id`
 * para que las consultas filtren por ella (cuando los modelos lo soporten).
 */

const STORAGE_KEY = "nexara_active_company_id";

export type ActiveCompany = {
  id: number;
  slug?: string | null;
  tradeName?: string | null;
  legalName: string;
  logoUrl?: string | null;
  isPrimary?: boolean;
};

const listeners = new Set<(id: number | null) => void>();

export function getActiveCompanyId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function setActiveCompanyId(id: number | null) {
  if (typeof window === "undefined") return;
  if (id == null) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, String(id));
  listeners.forEach((cb) => cb(id));
}

export function subscribeActiveCompany(cb: (id: number | null) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Devuelve los headers que toda llamada al API debería incluir. */
export function withTenantHeaders(headers: HeadersInit = {}): HeadersInit {
  const id = getActiveCompanyId();
  if (id == null) return headers;
  const next = new Headers(headers);
  next.set("X-Company-Id", String(id));
  return next;
}
