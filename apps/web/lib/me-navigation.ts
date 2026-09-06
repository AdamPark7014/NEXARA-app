/**
 * Cliente del endpoint canónico de navegación RBAC.
 * Fuente: GET /api/me/navigation (url-matrix + roleKey).
 */
export type MeNavigation = {
  roleKey: string | null;
  orgRoleKey: string | null;
  panels: string[];
  paths: string[];
  moduleKeys: string[];
};

export async function fetchMeNavigation(
  fetcher: (path: string) => Promise<Response> = (path) => fetch(path, { credentials: "include" }),
): Promise<MeNavigation | null> {
  try {
    const res = await fetcher("/api/me/navigation");
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
