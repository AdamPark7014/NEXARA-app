/**
 * Política de módulos por empresa (tenant).
 *
 * La matriz de roles (`url-matrix.ts`, `access-matrix.ts`) es global: cambiarla afecta a todas las
 * empresas. Esta política es el override por empresa: una empresa puede decir «este módulo solo lo
 * usa el rol X» sin tocar a las demás. Se guarda como un `SystemSetting` con `companyId`
 * (clave `rbac.module_roles`, JSON `{ "<módulo>": ["<rol>", …] }`). Sin fila = comportamiento de
 * siempre.
 *
 * Solo restringe (nunca amplía): un rol que la matriz global no deja entrar sigue sin entrar.
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */
import { ALL_ROLES, ROLES } from '../rbac/roles.v2.js';

export const MODULE_POLICY_SETTING_KEY = 'rbac.module_roles';
export const MODULE_POLICY_SETTING_CATEGORY = 'rbac';

/** Módulos que una empresa puede restringir por rol, con los ids que usa cada cliente. */
export const RESTRICTABLE_MODULES = {
  'employee-payments': {
    label: 'Pagos a personal',
    /** `ModuleId` de la web (access-matrix) y clave de «Más» de Core. */
    webModuleIds: ['employee-payments', 'erp-pagos-empleados'],
    /** Claves de `ModuleCatalog` de Android / iOS. */
    appKeys: ['employee-payments', 'erp-pagos-empleados'],
  },
} as const;

export type RestrictableModuleId = keyof typeof RESTRICTABLE_MODULES;

/** Roles permitidos por módulo. Un módulo ausente no está restringido. */
export type ModulePolicy = Partial<Record<RestrictableModuleId, string[]>>;

export const POLITICA_VACIA: ModulePolicy = Object.freeze({}) as ModulePolicy;

const MODULE_IDS = Object.keys(RESTRICTABLE_MODULES) as RestrictableModuleId[];

export type UsuarioDePolitica = {
  roleKey?: string | null;
  role?: string | null;
  isSuperAdmin?: boolean;
  superadmin?: boolean;
};

/** Igual que `RbacGuard`: el equipo de desarrollo (super admin) nunca queda fuera. */
export function esSuperAdmin(user: UsuarioDePolitica | null | undefined): boolean {
  return Boolean(
    user && (user.superadmin || user.isSuperAdmin || user.roleKey === ROLES.SUPER_ADMIN || user.role === ROLES.SUPER_ADMIN),
  );
}

/**
 * Valor guardado → política sana. Tolera `null`, JSON roto, módulos desconocidos y roles con
 * mayúsculas o espacios; nunca lanza.
 *
 * Un módulo con lista de roles que quedó vacía tras limpiar (p. ej. un rol mal escrito) se queda
 * restringido: solo el super admin entra. Es preferible a que un error de dedo deje el módulo abierto.
 */
export function parsearPolitica(raw: string | null | undefined): ModulePolicy {
  if (raw == null || String(raw).trim() === '') return {};
  let data: unknown;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

  const validos = new Set<string>(ALL_ROLES);
  const out: ModulePolicy = {};
  for (const id of MODULE_IDS) {
    const lista = (data as Record<string, unknown>)[id];
    if (!Array.isArray(lista)) continue;
    const roles = lista
      .filter((r): r is string => typeof r === 'string')
      .map((r) => r.trim().toLowerCase())
      .filter((r) => validos.has(r));
    out[id] = [...new Set(roles)];
  }
  return out;
}

/** Política → valor a guardar (solo módulos conocidos). */
export function serializarPolitica(politica: ModulePolicy): string {
  const limpia: Record<string, string[]> = {};
  for (const id of MODULE_IDS) {
    const roles = politica[id];
    if (Array.isArray(roles)) limpia[id] = [...new Set(roles.map((r) => r.trim().toLowerCase()))];
  }
  return JSON.stringify(limpia);
}

/** ¿Este usuario puede usar el módulo en esa empresa? Sin restricción = sí (lo decide la matriz global). */
export function puedeUsarModulo(
  politica: ModulePolicy,
  modulo: RestrictableModuleId,
  user: UsuarioDePolitica | null | undefined,
): boolean {
  const permitidos = politica[modulo];
  if (!permitidos) return true;
  if (esSuperAdmin(user)) return true;
  const rol = String(user?.roleKey ?? '').trim().toLowerCase();
  return rol !== '' && permitidos.includes(rol);
}

/** Módulos que la política le esconde a este usuario. */
export function modulosOcultosPara(
  politica: ModulePolicy,
  user: UsuarioDePolitica | null | undefined,
): RestrictableModuleId[] {
  return MODULE_IDS.filter((id) => !puedeUsarModulo(politica, id, user));
}

/** Ids de módulo (web y apps) que corresponden a los módulos ocultos. */
export function idsDeModulosOcultos(ocultos: RestrictableModuleId[]): { web: string[]; apps: string[] } {
  const web = new Set<string>();
  const apps = new Set<string>();
  for (const id of ocultos) {
    for (const w of RESTRICTABLE_MODULES[id].webModuleIds) web.add(w);
    for (const a of RESTRICTABLE_MODULES[id].appKeys) apps.add(a);
  }
  return { web: [...web], apps: [...apps] };
}

/** Quita de la navegación los módulos que la política esconde. No añade nunca. */
export function aplicarPoliticaANavegacion(
  nav: { webModuleIds: string[]; moduleKeys: string[] },
  ocultos: RestrictableModuleId[],
): { webModuleIds: string[]; moduleKeys: string[]; hiddenModuleIds: string[] } {
  const ids = idsDeModulosOcultos(ocultos);
  const webFuera = new Set(ids.web);
  const appFuera = new Set(ids.apps);
  return {
    webModuleIds: nav.webModuleIds.filter((m) => !webFuera.has(m)),
    moduleKeys: nav.moduleKeys.filter((m) => !appFuera.has(m)),
    hiddenModuleIds: [...new Set([...ids.web, ...ids.apps])].sort(),
  };
}
