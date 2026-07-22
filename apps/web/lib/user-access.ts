/**
 * NEXARA · Acceso unificado por usuario
 * =====================================
 * Sidebar, guards de ruta, home post-login y panel switcher consumen
 * las mismas reglas — evita el bug "veo el menú pero la ruta parpadea".
 */
import {
  MODULES,
  PANEL_META,
  buildSidebar,
  canAccessUrl,
  getHomeUrl as getOrgHomeUrl,
  getModuleUrl,
  type ModuleEntry,
  type PanelId,
  type SidebarGroup,
} from '@/lib/access-matrix';
import { resolveOrgRoleKey, type OrgRoleKey } from '@/lib/org-roles';
import {
  adaptModulePresentation,
  canAccessCrmManagerPages,
  canAccessHrManagement,
  canAccessMaintenanceContracts,
  getActivitiesCanonicalPath,
  getAttendanceSectionConfig,
  getAttendanceViewMode,
  getCrmManagerSectionConfig,
  getCrmSalesSectionConfig,
  getErpExpensesSectionConfig,
  getErpViaticsAdminSectionConfig,
  getHrSectionConfig,
  shouldShowModuleInSidebar,
  type SectionViewMode,
} from '@/lib/section-views';
import {
  canOpenPage,
  PAGE_MATRIX,
} from '@/lib/rbac/page-matrix';
import {
  ROLES,
  ROLE_HOME_PANEL,
  ROLE_LABELS,
  type PanelKey,
  type RoleKey,
} from '@/lib/rbac/roles';
import {
  isTechnicalSuperAdmin,
  resolveIsPlatformOwner,
} from '@/lib/platform-accounts';
import {
  ORG_TO_V2,
  V2_TO_ORG,
  resolveV2RoleKey,
  type UserAccessInput as RoleMappingUserInput,
} from '@/lib/rbac/role-mapping';

export type UserAccessInput = RoleMappingUserInput & {
  email?: string | null;
  isPlatformOwner?: boolean;
};

const V2_PANEL_TO_ID: Record<PanelKey, PanelId> = {
  core: 'erp',
  sales: 'crm',
  ops: 'ops',
  studio: 'studio',
  portal: 'erp',
};

export { resolveV2RoleKey };

/** Org role para badges — dueño solo Christian; Adam usa su rol org real. */
export function resolveDisplayOrgRoleKey(user: UserAccessInput | null | undefined): OrgRoleKey | null {
  if (!user) return null;
  if (resolveIsPlatformOwner(user)) return 'ceo';
  if (isTechnicalSuperAdmin(user)) {
    return resolveOrgRoleKey(user.role, user.orgRoleKey);
  }

  const v2 = resolveV2RoleKey(user);
  if (v2) {
    const mapped = V2_TO_ORG[v2];
    if (mapped) return mapped;
  }

  return resolveOrgRoleKey(user.role, user.orgRoleKey);
}

/** ¿Puede abrir esta URL? Misma función para sidebar y guard de ruta. */
export function canUserAccessPath(user: UserAccessInput | null | undefined, pathname: string): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;

  const v2 = resolveV2RoleKey(user);
  if (v2) return canOpenPage(v2, pathname);

  const orgKey = resolveOrgRoleKey(user.role, user.orgRoleKey);
  return canAccessUrl(orgKey, pathname, false);
}

function canUserAccessModule(user: UserAccessInput, module: ModuleEntry): boolean {
  if (!canUserAccessPath(user, getModuleUrl(module.id))) return false;
  if (user.isSuperAdmin) return true;

  // v2 users: canUserAccessPath (PAGE_MATRIX) is the authoritative check.
  // Skipping allowedRoles avoids false negatives when org role sets
  // (e.g. OPS_LEADS) don't perfectly mirror the v2 role hierarchy
  // (e.g. coord_operaciones / arquitecto missing from OPS_LEADS).
  const v2 = resolveV2RoleKey(user);
  if (v2) return true;

  const orgRole = resolveDisplayOrgRoleKey(user);
  if (orgRole && !module.allowedRoles.includes(orgRole)) return false;

  return true;
}

/** URL canónica de un módulo (respeta path adaptado por rol en sidebar/paleta). */
export function getModuleEntryUrl(module: ModuleEntry): string {
  const p = module.path ?? '/';
  return `/${module.panel}${p === '/' ? '' : p.startsWith('/') ? p : `/${p}`}`;
}

/** Sidebar filtrado con las mismas reglas que el guard de ruta. */
export function buildUserSidebar(
  panel: PanelId,
  user: UserAccessInput | null | undefined,
): SidebarGroup[] {
  if (!user) return [];

  const v2 = resolveV2RoleKey(user);
  const orgKey = resolveOrgRoleKey(user.role, user.orgRoleKey);
  if (v2 || orgKey) {
    const items: ModuleEntry[] = [];
    const seenPaths = new Set<string>();

    for (const module of Object.values(MODULES)) {
      if (module.panel !== panel) continue;
      if (!canUserAccessModule(user, module)) continue;
      if (!shouldShowModuleInSidebar(user, module)) continue;

      const adapted = adaptModulePresentation(user, module);
      if (seenPaths.has(adapted.path)) continue;
      seenPaths.add(adapted.path);

      items.push(adapted);
    }

    const byGroup = new Map<string, ModuleEntry[]>();
    for (const item of items) {
      const list = byGroup.get(item.group) ?? [];
      list.push(item);
      byGroup.set(item.group, list);
    }

    return Array.from(byGroup.entries()).map(([title, list]) => ({
      id: title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      title,
      items: list,
    }));
  }

  return buildSidebar(panel, orgKey, false);
}

/** Módulos accesibles (paleta de comandos, búsqueda global). */
export function getUserAllowedModules(user: UserAccessInput | null | undefined): ModuleEntry[] {
  if (!user) return [];

  const seenPaths = new Set<string>();
  return Object.values(MODULES)
    .filter((m) => canUserAccessModule(user, m) && shouldShowModuleInSidebar(user, m))
    .map((m) => adaptModulePresentation(user, m))
    .filter((m) => {
      if (seenPaths.has(m.path)) return false;
      seenPaths.add(m.path);
      return true;
    });
}

/** ¿Tiene al menos una ruta usable dentro de este panel? */
export function canUserAccessPanel(
  user: UserAccessInput | null | undefined,
  panel: PanelId,
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;

  const v2 = resolveV2RoleKey(user);
  if (v2) {
    const prefix = `/${panel}`;
    const rules = PAGE_MATRIX[v2] ?? [];
    const hasPanelRules = rules.some(
      (rule) => rule === `${prefix}/**` || rule === prefix || rule.startsWith(`${prefix}/`),
    );
    if (!hasPanelRules) return false;
  }

  if (buildUserSidebar(panel, user).length > 0) return true;
  return getUserPanelEntryPath(user, panel) !== null;
}

/** Primera ruta accesible dentro de un panel (para breadcrumbs y redirects). */
export function getUserPanelEntryPath(
  user: UserAccessInput | null | undefined,
  panel: PanelId,
): string | null {
  if (!user) return null;
  if (user.isSuperAdmin) {
    const meta = PANEL_META[panel];
    return `/${panel}${meta.entryPath === '/' ? '' : meta.entryPath}`;
  }

  const sidebar = buildUserSidebar(panel, user);
  for (const group of sidebar) {
    for (const item of group.items) {
      const url = getModuleUrl(item.id);
      if (canUserAccessPath(user, url)) return url;
    }
  }

  const v2 = resolveV2RoleKey(user);
  if (v2) {
    const prefix = `/${panel}`;
    const rules = PAGE_MATRIX[v2] ?? [];
    const candidates = new Set<string>([
      `${prefix}/dashboard`,
      `${prefix}/my-profile`,
      prefix,
    ]);
    if (panel === 'ops') candidates.add(getActivitiesCanonicalPath(user));
    for (const rule of rules) {
      if (!rule.startsWith(prefix)) continue;
      candidates.add(rule.replace(/\/\*\*$/, '').replace(/\/\*$/, ''));
    }
    for (const candidate of candidates) {
      const path = candidate === prefix ? `${prefix}/dashboard` : candidate;
      if (canOpenPage(v2, path)) return path;
    }
  }

  const orgKey = resolveOrgRoleKey(user.role, user.orgRoleKey);
  if (orgKey) {
    const modules = buildSidebar(panel, orgKey, false);
    if (modules[0]?.items[0]) {
      return getModuleUrl(modules[0].items[0].id);
    }
  }

  return null;
}

/** Ruta de entrada segura al cambiar de panel (nunca mezcla paths de otro subdominio). */
export function getUserPanelSwitchPath(
  user: UserAccessInput | null | undefined,
  panel: PanelId,
): string {
  const entry = getUserPanelEntryPath(user, panel);
  if (entry) return entry;

  const fallbacks =
    panel === 'lab'
      ? ['/lab', '/lab/ai', '/lab/health']
      : [`/${panel}/dashboard`, `/${panel}/my-profile`, `/${panel}/notifications-center`];
  for (const candidate of fallbacks) {
    if (canUserAccessPath(user, candidate)) return candidate;
  }

  return getUserHomePath(user);
}

/** Paneles visibles en el switcher — solo si hay rutas reales en ese panel. */
export function getUserAllowedPanels(user: UserAccessInput | null | undefined) {
  if (!user) return [];
  if (user.isSuperAdmin) return Object.values(PANEL_META);

  return Object.values(PANEL_META).filter((p) => canUserAccessPanel(user, p.id));
}

/** Panel HOME canónico del usuario. */
export function getUserHomePanel(user: UserAccessInput | null | undefined): PanelId {
  if (!user) return 'erp';
  if (isTechnicalSuperAdmin(user)) return 'lab';
  if (user.isSuperAdmin || resolveIsPlatformOwner(user)) return 'erp';

  const v2 = resolveV2RoleKey(user);
  if (v2) {
    const panelKey = ROLE_HOME_PANEL[v2];
    return V2_PANEL_TO_ID[panelKey] ?? 'erp';
  }

  const orgKey = resolveOrgRoleKey(user.role, user.orgRoleKey);
  const url = getOrgHomeUrl(orgKey, false, resolveIsPlatformOwner(user), isTechnicalSuperAdmin(user));
  const match = url.match(/^\/(erp|crm|ops|studio|lab)/);
  return (match?.[1] as PanelId) ?? 'erp';
}

/** Ruta HOME post-login. */
export function getUserHomePath(user: UserAccessInput | null | undefined): string {
  if (!user) return '/login';
  if (isTechnicalSuperAdmin(user)) return '/lab';
  if (resolveIsPlatformOwner(user)) return '/erp/executive';
  if (user.isSuperAdmin) return '/erp/executive';

  const v2 = resolveV2RoleKey(user);
  if (v2) {
    const panel = getUserHomePanel(user);

    // Rutas especiales por rol
    if (v2 === ROLES.CEO) return '/erp/executive';
    if (v2 === ROLES.ING_CAMPO || v2 === ROLES.ING_SOPORTE || v2 === ROLES.COORD_OPERACIONES) return getActivitiesCanonicalPath(user);
    if (v2 === ROLES.VENDEDOR) return '/crm/dashboard';
    if (v2 === ROLES.LIDER_DISENO || v2 === ROLES.DISENADOR) return '/studio/dashboard';
    if (v2 === ROLES.CLIENTE) return '/tickets';

    // Fallback genérico: /panel/dashboard (evita que roles como 'administrativo'
    // aterricen en /erp/executive que solo corresponde al CEO).
    // meta.entryPath puede ser "/executive" solo para superAdmin/CEO, ya
    // cubiertos arriba.
    return `/${panel}/dashboard`;
  }

  const orgKey = resolveOrgRoleKey(user.role, user.orgRoleKey);
  return getOrgHomeUrl(orgKey, false, resolveIsPlatformOwner(user), isTechnicalSuperAdmin(user));
}

export function getUserRoleLabel(user: UserAccessInput | null | undefined): string {
  if (!user) return '';
  if (resolveIsPlatformOwner(user)) return 'CEO';
  if (isTechnicalSuperAdmin(user)) return 'Super Admin · Desarrollador';
  if (user.isSuperAdmin) return ROLE_LABELS[ROLES.SUPER_ADMIN];
  const v2 = resolveV2RoleKey(user);
  if (v2 && ROLE_LABELS[v2]) return ROLE_LABELS[v2];
  return user.role || 'Equipo NEXARA';
}

export type { SectionViewMode };
export {
  getActivitiesCanonicalPath,
  getAttendanceSectionConfig,
  getAttendanceViewMode,
  getCrmManagerSectionConfig,
  getCrmSalesSectionConfig,
  getErpExpensesSectionConfig,
  getErpViaticsAdminSectionConfig,
  getHrSectionConfig,
  canAccessCrmManagerPages,
  canAccessHrManagement,
  canAccessMaintenanceContracts,
};

export { ORG_TO_V2, V2_TO_ORG };
