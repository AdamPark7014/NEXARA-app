import { listAllowedUrls } from '../common/rbac/url-matrix.js';
import { LEGACY_TO_V2, ROLES, type RoleKey } from '../common/rbac/roles.v2.js';

/**
 * Qué alcanza realmente un rol.
 *
 * El acceso de un rol está repartido en cuatro sitios —las banderas `acceso*`
 * de `Role`, su `orgRoleKey`, la matriz de URLs y la lista de permisos— y no
 * había ninguna forma de verlo junto. Quien crea un rol no puede saber qué
 * podrá hacer hasta que alguien lo usa y choca con un 403.
 *
 * Esto resuelve las tres preguntas que importan al configurar permisos:
 * ¿la matriz reconoce este rol?, ¿a qué módulos llega?, ¿con qué alcance?
 */

/** Módulo alcanzable y con qué nivel. */
export type ModuleAccess = {
  /** Segmento del módulo tal cual aparece en la API (`activities`, `accounting`…). */
  module: string;
  /** `read` | `write` | `approve` | `admin` — el mayor de las reglas que aplican. */
  scope: string;
  /** Métodos permitidos; `todos` cuando la regla no los restringe. */
  methods: string;
};

export type RoleAccessSummary = {
  /** Clave con la que la matriz decide, ya resuelta desde la plantilla. */
  resolvedRoleKey: string | null;
  /** False si la matriz no reconoce el rol: no tendría línea base de permisos. */
  recognizedByMatrix: boolean;
  /** True si salta todas las comprobaciones. */
  isSuperAdmin: boolean;
  /** Módulos de la API que alcanza, ordenados alfabéticamente. */
  modules: ModuleAccess[];
  /** Reglas que no son de `/api/**` (paneles del front). */
  panels: string[];
};

const SCOPE_ORDER: Record<string, number> = { read: 1, write: 2, approve: 3, admin: 4 };

/** Resuelve la clave de matriz desde el `orgRoleKey` de la plantilla. */
export function resolveMatrixKey(orgRoleKey?: string | null, roleKey?: string | null): RoleKey | null {
  const validKeys = Object.values(ROLES) as string[];
  if (roleKey && validKeys.includes(roleKey)) return roleKey as RoleKey;
  if (orgRoleKey && validKeys.includes(orgRoleKey)) return orgRoleKey as RoleKey;
  if (orgRoleKey && LEGACY_TO_V2[orgRoleKey]) return LEGACY_TO_V2[orgRoleKey];
  return null;
}

/** Extrae el nombre de módulo de una ruta `/api/<modulo>/...`. */
function moduleOf(path: string): string | null {
  const match = path.match(/^\/api\/([a-z0-9-]+)/i);
  return match ? match[1] : null;
}

export function buildRoleAccessSummary(input: {
  orgRoleKey?: string | null;
  roleKey?: string | null;
}): RoleAccessSummary {
  const resolved = resolveMatrixKey(input.orgRoleKey, input.roleKey);

  if (!resolved) {
    return {
      resolvedRoleKey: null,
      recognizedByMatrix: false,
      isSuperAdmin: false,
      modules: [],
      panels: [],
    };
  }

  if (resolved === ROLES.SUPER_ADMIN) {
    return {
      resolvedRoleKey: resolved,
      recognizedByMatrix: true,
      isSuperAdmin: true,
      modules: [],
      panels: [],
    };
  }

  const byModule = new Map<string, ModuleAccess>();
  const panels: string[] = [];

  for (const rule of listAllowedUrls(resolved)) {
    const module = moduleOf(rule.path);
    if (!module) {
      panels.push(rule.path);
      continue;
    }

    const methods = rule.methods?.length ? rule.methods.join(', ') : 'todos';
    const scope = String(rule.scope ?? 'read');
    const current = byModule.get(module);

    // Un módulo puede tener varias reglas: se muestra la de mayor alcance.
    if (!current || (SCOPE_ORDER[scope] ?? 0) > (SCOPE_ORDER[current.scope] ?? 0)) {
      byModule.set(module, { module, scope, methods });
    }
  }

  return {
    resolvedRoleKey: resolved,
    recognizedByMatrix: true,
    isSuperAdmin: false,
    modules: [...byModule.values()].sort((a, b) => a.module.localeCompare(b.module)),
    panels: [...new Set(panels)].sort(),
  };
}
