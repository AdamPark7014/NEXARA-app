/**
 * NEXARA · Users API (frontend client)
 * ------------------------------------
 * Consume `apps/api/src/users/users.controller.ts`.
 * Soporta paginación o lista plana (cuando no hay limit).
 */
import { buildApiUrl } from "@/lib/api-base";
import type { RoleKey } from "@/lib/rbac/roles";

export type ApiUserRow = {
  id: number;
  nombre: string;
  email: string;
  avatarUrl?: string | null;
  employeeNumber?: string | null;
  roleId?: number | null;
  roleKey?: RoleKey | null;
  departmentId?: number | null;
  isActive?: boolean | null;
  fechaCreacion?: string | null;
  role?: {
    id: number;
    nombre: string;
    nivelAutoridad?: number | null;
  } | null;
  department?: { id: number; nombre: string } | null;
  ultimoLoginAt?: string | null;
  ultimoLogin?: string | null;
};

export type UsersResponse =
  | ApiUserRow[]
  | { data: ApiUserRow[]; total?: number; page?: number; pageSize?: number };

const apiFetch = async (path: string, token: string, init: RequestInit = {}) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(buildApiUrl(path), { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    if (text) {
      try {
        const json = JSON.parse(text);
        message = Array.isArray(json?.message) ? json.message.join(", ") : (json?.message || text);
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

/** Listado de usuarios visibles para el caller. */
export const listUsers = async (token: string, params?: { limit?: number; page?: number }): Promise<ApiUserRow[]> => {
  const search = new URLSearchParams();
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.page) search.set("page", String(params.page));
  const path = `users${search.toString() ? `?${search.toString()}` : ""}`;
  const data = await apiFetch(path, token, { method: "GET" });
  if (Array.isArray(data)) return data as ApiUserRow[];
  if (data && Array.isArray((data as { data: ApiUserRow[] }).data)) return (data as { data: ApiUserRow[] }).data;
  return [];
};

/** Asigna el rol RBAC v2 (`roleKey`) a un usuario. */
export const updateUserRoleKey = async (
  token: string,
  userId: number,
  roleKey: RoleKey,
): Promise<ApiUserRow> => {
  return apiFetch(`users/${userId}`, token, {
    method: "PATCH",
    body: JSON.stringify({ roleKey }),
  });
};
