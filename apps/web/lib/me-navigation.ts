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
  /** Claves Android ModuleCatalog */
  moduleKeys: string[];
  /** ModuleId web (access-matrix) — preferir para sidebar */
  webModuleIds: string[];
};

export async function fetchMeNavigation(
  fetcher?: () => Promise<Response>,
): Promise<MeNavigation | null> {
  try {
    const res = await (fetcher
      ? fetcher()
      : fetch(buildApiUrl("me/navigation"), { credentials: "include" }));
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<MeNavigation>;
    const moduleKeys = Array.isArray(data.moduleKeys) ? data.moduleKeys : [];
    const webModuleIds = Array.isArray(data.webModuleIds)
      ? data.webModuleIds
      : moduleKeys; // compat: builds antiguos sin webModuleIds
    return {
      roleKey: data.roleKey ?? null,
      orgRoleKey: data.orgRoleKey ?? null,
      panels: Array.isArray(data.panels) ? data.panels : [],
      paths: Array.isArray(data.paths) ? data.paths : [],
      moduleKeys,
      webModuleIds,
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

/**
 * Filtra módulos web por navegación servidor.
 * Preferencia: webModuleIds; fallback: paths de página; nunca clippea si nav vacía.
 */
export function filterModulesByNavigation<T extends { id: string; panel?: string; path?: string }>(
  modules: T[],
  navigation: MeNavigation | null | undefined,
): T[] {
  if (!navigation) return modules;
  const ids = navigation.webModuleIds?.length
    ? navigation.webModuleIds
    : navigation.moduleKeys;
  const pagePaths = (navigation.paths ?? []).filter((p) => !p.startsWith("/api/"));
  if ((!ids || ids.length === 0) && pagePaths.length === 0) return modules;

  // Comodín raíz = acceso total (super_admin). Sin esto, `/**` se reducía a
  // base vacía más abajo y el filtro dejaba al super admin con los 2-3 módulos
  // que `deriveModuleKeysFromPaths` siembra por defecto.
  if (pagePaths.some((rule) => rule === "/**" || rule === "/*" || rule === "/")) {
    return modules;
  }

  const idSet = new Set(ids ?? []);
  return modules.filter((m) => {
    if (idSet.has(m.id)) return true;
    if (!m.panel || m.path === undefined) return idSet.size === 0;
    const full = `/${m.panel}${m.path === "/" ? "" : m.path.startsWith("/") ? m.path : `/${m.path}`}`;
    return pagePaths.some((rule) => {
      const base = rule.replace(/\/\*\*$/, "").replace(/\/\*$/, "").replace(/\/$/, "");
      if (!base) return false;
      return full === base || full.startsWith(`${base}/`) || base.startsWith(full);
    });
  });
}
