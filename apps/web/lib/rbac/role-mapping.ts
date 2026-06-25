/**
 * Mapeo bidireccional RBAC v2 ↔ roles organizacionales (18-role ERP model).
 * Usado por sidebar, guards, badges y hooks de capacidad.
 */
import { ORG_ROLE_KEYS, resolveOrgRoleKey, type OrgRoleKey } from '@/lib/org-roles';
import { ROLES, type RoleKey } from './roles';

export const V2_ROLE_KEYS = new Set<string>(Object.values(ROLES));

export type UserAccessInput = {
  role?: string | null;
  roleKey?: string | null;
  orgRoleKey?: string | null;
  isSuperAdmin?: boolean;
};

/** Resuelve el roleKey RBAC v2 efectivo del usuario. */
export function resolveV2RoleKey(user: UserAccessInput | null | undefined): RoleKey | null {
  if (!user) return null;
  if (user.isSuperAdmin) return ROLES.SUPER_ADMIN;

  const direct = user.roleKey;
  if (direct && V2_ROLE_KEYS.has(direct)) return direct as RoleKey;

  if (user.orgRoleKey) {
    if (V2_ROLE_KEYS.has(user.orgRoleKey)) return user.orgRoleKey as RoleKey;
    const fromOrg = v2RoleKeyFromOrg(user.orgRoleKey);
    if (fromOrg) return fromOrg;
  }

  const orgKey = resolveOrgRoleKey(user.role, user.orgRoleKey);
  if (orgKey) return v2RoleKeyFromOrg(orgKey);

  return null;
}

/** RBAC v2 → org role (para badges y hooks legacy). */
export const V2_TO_ORG: Record<RoleKey, OrgRoleKey | null> = {
  [ROLES.SUPER_ADMIN]: ORG_ROLE_KEYS.CEO,
  [ROLES.CEO]: ORG_ROLE_KEYS.CEO,
  [ROLES.ARQUITECTO]: ORG_ROLE_KEYS.ARQUITECTO,
  [ROLES.DIR_OPERACIONES]: ORG_ROLE_KEYS.DIRECTOR_OPS,
  [ROLES.DIR_ADMIN]: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
  [ROLES.COORD_ADMIN]: ORG_ROLE_KEYS.ADMIN_STAFF,
  [ROLES.ADMINISTRATIVO]: ORG_ROLE_KEYS.ADMIN_STAFF,
  [ROLES.COORD_OPERACIONES]: ORG_ROLE_KEYS.COORD_OPERACIONES,
  [ROLES.ING_CAMPO]: ORG_ROLE_KEYS.FIELD_ENGINEER,
  [ROLES.ING_SOPORTE]: ORG_ROLE_KEYS.SUPPORT_AGENT,
  [ROLES.COORD_VENTAS]: ORG_ROLE_KEYS.SALES_MANAGER,
  [ROLES.VENDEDOR]: ORG_ROLE_KEYS.SALES_REP,
  [ROLES.LIDER_DISENO]: ORG_ROLE_KEYS.DESIGNER,
  [ROLES.DISENADOR]: ORG_ROLE_KEYS.DESIGNER,
  [ROLES.RH]: ORG_ROLE_KEYS.HR_SPECIALIST,
  [ROLES.CONTABILIDAD]: ORG_ROLE_KEYS.ACCOUNTANT,
  [ROLES.CLIENTE]: null,
};

/** Org role → RBAC v2 (espejo de backend LEGACY_TO_V2). */
export const ORG_TO_V2: Record<string, RoleKey> = {
  [ORG_ROLE_KEYS.CEO]: ROLES.CEO,
  [ORG_ROLE_KEYS.ARQUITECTO]: ROLES.ARQUITECTO,
  [ORG_ROLE_KEYS.DIRECTOR_ADMIN]: ROLES.DIR_ADMIN,
  [ORG_ROLE_KEYS.DIRECTOR_OPS]: ROLES.DIR_OPERACIONES,
  [ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL]: ROLES.COORD_VENTAS,
  [ORG_ROLE_KEYS.SALES_MANAGER]: ROLES.COORD_VENTAS,
  [ORG_ROLE_KEYS.SALES_REP]: ROLES.VENDEDOR,
  [ORG_ROLE_KEYS.PROJECT_MANAGER]: ROLES.COORD_OPERACIONES,
  [ORG_ROLE_KEYS.COORD_OPERACIONES]: ROLES.COORD_OPERACIONES,
  [ORG_ROLE_KEYS.SENIOR_ENGINEER]: ROLES.ING_SOPORTE,
  [ORG_ROLE_KEYS.FIELD_ENGINEER]: ROLES.ING_CAMPO,
  [ORG_ROLE_KEYS.DESIGNER]: ROLES.DISENADOR,
  [ORG_ROLE_KEYS.ADMIN_STAFF]: ROLES.ADMINISTRATIVO,
  [ORG_ROLE_KEYS.ACCOUNTANT]: ROLES.CONTABILIDAD,
  [ORG_ROLE_KEYS.HR_SPECIALIST]: ROLES.RH,
  [ORG_ROLE_KEYS.WAREHOUSE_MANAGER]: ROLES.COORD_ADMIN,
  [ORG_ROLE_KEYS.PROCUREMENT_OFFICER]: ROLES.COORD_ADMIN,
  [ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR]: ROLES.COORD_OPERACIONES,
  [ORG_ROLE_KEYS.SUPPORT_AGENT]: ROLES.ING_SOPORTE,
  [ORG_ROLE_KEYS.NOC_LEAD]: ROLES.ING_SOPORTE,
  [ORG_ROLE_KEYS.NOC_OPERATOR]: ROLES.ING_SOPORTE,
};

/** Claves v2 que a veces se guardan en `Role.orgRoleKey` tras la migración. */
export function orgRoleKeyFromV2(v2Key: string): OrgRoleKey | null {
  if (v2Key in V2_TO_ORG) return V2_TO_ORG[v2Key as RoleKey];
  return null;
}

export function v2RoleKeyFromOrg(orgKey: string): RoleKey | null {
  return ORG_TO_V2[orgKey] ?? null;
}
