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

/** Tope de `limit` en `PaginationQueryDto`: pedir más devuelve 400. */
const USUARIOS_POR_PAGINA = 100;

/** Cincuenta páginas. Cinco mil usuarios es techo de cordura, no de negocio. */
const PAGINAS_MAX = 50;

const filasDeRespuesta = (data: unknown): ApiUserRow[] => {
  if (Array.isArray(data)) return data as ApiUserRow[];
  if (data && Array.isArray((data as { data: ApiUserRow[] }).data)) {
    return (data as { data: ApiUserRow[] }).data;
  }
  return [];
};

const totalDeRespuesta = (data: unknown): number | undefined =>
  Array.isArray(data) ? undefined : (data as { meta?: { total?: number } } | null)?.meta?.total;

/**
 * Listado de usuarios visibles para el caller.
 *
 * Recorre páginas hasta completar la lista. Antes pedía en una sola llamada lo
 * que le dijeran, y eso salía mal por los dos lados: tres pantallas pedían
 * `limit: 200` contra un DTO que topa en 100 —400 y catálogo vacío, sin que
 * nadie lo viera— y la que llamaba sin parámetros se quedaba con los 20 del
 * valor por omisión de la API, creyendo que eran todos.
 *
 * Pasar `page` sigue trayendo esa página y solo esa: quien pagina, manda.
 */
export const listUsers = async (
  token: string,
  params?: { limit?: number; page?: number },
): Promise<ApiUserRow[]> => {
  const porPagina = Math.min(params?.limit ?? USUARIOS_POR_PAGINA, USUARIOS_POR_PAGINA);

  const pedir = async (pagina: number) => {
    const search = new URLSearchParams();
    search.set("limit", String(porPagina));
    search.set("page", String(pagina));
    return apiFetch(`users?${search.toString()}`, token, { method: "GET" });
  };

  if (params?.page) return filasDeRespuesta(await pedir(params.page));

  const acumuladas: ApiUserRow[] = [];
  for (let pagina = 1; pagina <= PAGINAS_MAX; pagina += 1) {
    const data = await pedir(pagina);
    const filas = filasDeRespuesta(data);
    acumuladas.push(...filas);
    const total = totalDeRespuesta(data);
    if (params?.limit && acumuladas.length >= params.limit) break;
    if (filas.length < porPagina) break;
    if (total != null && acumuladas.length >= total) break;
  }
  return params?.limit ? acumuladas.slice(0, params.limit) : acumuladas;
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
