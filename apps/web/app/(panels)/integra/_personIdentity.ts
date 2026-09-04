/**
 * Enlace canónico ERP ↔ ACS: User.employeeNumber ↔ personId / personCode.
 * API: POST/DELETE integra/people/:id/link + listPeople.erpUser.
 * Helpers de UI para emparejar en cliente mientras llega el payload.
 */
import type { ApiUserRow } from "@/lib/users-api";

export type AltaMode = "unified" | "link" | "acs";

export function normId(value?: string | null): string | null {
  if (value == null) return null;
  const t = String(value).trim().toLowerCase();
  return t || null;
}

export function erpKeys(u: Pick<ApiUserRow, "employeeNumber">): string[] {
  const k = normId(u.employeeNumber);
  return k ? [k] : [];
}

export function personKeys(p: { id: string; code?: string }): string[] {
  const keys = [normId(p.id), normId(p.code)].filter(Boolean) as string[];
  return [...new Set(keys)];
}

export function buildErpByKey(users: ApiUserRow[]): Map<string, ApiUserRow> {
  const map = new Map<string, ApiUserRow>();
  for (const u of users) {
    for (const k of erpKeys(u)) {
      if (!map.has(k)) map.set(k, u);
    }
  }
  return map;
}

export function findErpForPerson(
  p: { id: string; code?: string },
  byKey: Map<string, ApiUserRow>,
): ApiUserRow | null {
  for (const k of personKeys(p)) {
    const hit = byKey.get(k);
    if (hit) return hit;
  }
  return null;
}

export function generateTempPassword() {
  return `Nexara-${Math.random().toString(36).slice(2, 8)}!`;
}

export function asList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: T[] }).data)) {
    return (payload as { data: T[] }).data;
  }
  return [];
}
