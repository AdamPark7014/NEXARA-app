import { hasAnyPermission, hasPermission, PERMISSIONS, type UserPermissions } from "@/lib/permissions";
import {
  getOrgTier,
  ORG_ROLE_KEYS,
  ORG_TIER,
  resolveOrgRoleKey,
  type OrgRoleKey,
} from "@/lib/org-roles";
import { isPlatformAdmin } from "@/lib/panel-user";

export type OrgUser = UserPermissions & {
  role?: string | null;
  orgRoleKey?: string | null;
  isSuperAdmin?: boolean;
};

export function resolveUserOrgKey(user: OrgUser | null | undefined): OrgRoleKey | null {
  if (!user) return null;
  return resolveOrgRoleKey(user.role, user.orgRoleKey);
}

export function getUserOrgTier(user: OrgUser | null | undefined): number {
  if (!user) return ORG_TIER.EXTERNAL;
  return getOrgTier(resolveUserOrgKey(user), Boolean(user.isSuperAdmin));
}

/** Dueño, CEO o director (administrativo, operativo, comercial). */
export function isDirectorOrAbove(user: OrgUser | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return getUserOrgTier(user) >= ORG_TIER.DIRECTOR;
}

/** Gerente comercial u operativo. */
export function isManagerOrAbove(user: OrgUser | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (isPlatformAdmin(user)) return true;
  return getUserOrgTier(user) >= ORG_TIER.MANAGER;
}

export function isFieldStaff(user: OrgUser | null | undefined): boolean {
  const key = resolveUserOrgKey(user);
  return key === ORG_ROLE_KEYS.FIELD_ENGINEER || key === ORG_ROLE_KEYS.SENIOR_ENGINEER;
}

export function isSalesTeam(user: OrgUser | null | undefined): boolean {
  const key = resolveUserOrgKey(user);
  return (
    key === ORG_ROLE_KEYS.SALES_REP ||
    key === ORG_ROLE_KEYS.SALES_MANAGER ||
    key === ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL
  );
}

export function canViewTeamSalesData(user: OrgUser | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || isPlatformAdmin(user)) return true;
  const key = resolveUserOrgKey(user);
  if (key === ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL || key === ORG_ROLE_KEYS.SALES_MANAGER) return true;
  if (key === ORG_ROLE_KEYS.DIRECTOR_ADMIN || key === ORG_ROLE_KEYS.CEO) return true;
  return hasAnyPermission(user, [PERMISSIONS.SALES_REPORTS_VIEW, PERMISSIONS.SALES_MANAGE]);
}

/** Rutas /my-* solo para personal operativo/comercial, no para admins globales. */
export function canAccessPersonalRoute(user: OrgUser | null | undefined, href: string): boolean {
  if (!href.startsWith("/my-")) return true;
  if (!user) return false;
  if (user.isSuperAdmin || isPlatformAdmin(user)) return false;
  return hasAnyPermission(user, [
    PERMISSIONS.CONSOLE_ACCESS,
    PERMISSIONS.ACTIVITIES_VIEW,
    PERMISSIONS.EVIDENCES_VIEW,
    PERMISSIONS.VIATICS_VIEW,
    PERMISSIONS.VEHICLES_VIEW,
  ]);
}

export type MenuItemAccess = {
  href: string;
  permissions?: string[];
  anyPermissions?: string[];
};

/** Control de acceso unificado para items de sidebar — permisos + jerarquía org. */
export function canAccessMenuItem(user: OrgUser | null | undefined, item: MenuItemAccess): boolean {
  if (!user) return false;

  if (!canAccessPersonalRoute(user, item.href)) return false;

  if (user.isSuperAdmin) return true;

  if (item.permissions?.length && !item.permissions.every((p) => hasPermission(user, p))) {
    return false;
  }
  if (item.anyPermissions?.length && !hasAnyPermission(user, item.anyPermissions)) {
    return false;
  }

  return true;
}
