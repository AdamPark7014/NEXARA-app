/**
 * Cliente del endpoint canónico de navegación RBAC.
 * Fuente: GET /api/me/navigation (url-matrix + roleKey).
 */
import { buildApiUrl } from "@/lib/api-base";

export type MeNavigation = {
  roleKey: string | null;
  orgRoleKey: string | null;
  panels: string[];
  paths: string[];
  moduleKeys: string[];
};

export async function fetchMeNavigation(
  fetcher?: () => Promise<Response>,
): Promise<MeNavigation | null> {
  try {
    const res = await (fetcher
      ? fetcher()
      : fetch(buildApiUrl("me/navigation"), { credentials: "include" }));
    if (!res.ok) return null;
    const data = (await res.json()) as MeNavigation;
    return {
      roleKey: data.roleKey ?? null,
      orgRoleKey: data.orgRoleKey ?? null,
      panels: Array.isArray(data.panels) ? data.panels : [],
      paths: Array.isArray(data.paths) ? data.paths : [],
      moduleKeys: Array.isArray(data.moduleKeys) ? data.moduleKeys : [],
    };
  } catch {
    return null;
  }
}

export async function fetchMeNavigationAuthed(token: string): Promise<MeNavigation | null> {
  return fetchMeNavigation(() =>
    fetch(buildApiUrl("me/navigation"), {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      cache: "no-store",
    }),
  );
}

/** Si moduleKeys viene del servidor, úsalo; si no, cae al filtro local. */
export function filterModulesByNavigation<T extends { id: string }>(
  modules: T[],
  navigation: MeNavigation | null | undefined,
): T[] {
  const keys = navigation?.moduleKeys;
  if (!keys || keys.length === 0) return modules;
  const set = new Set(keys);
  return modules.filter((m) => set.has(m.id));
}
