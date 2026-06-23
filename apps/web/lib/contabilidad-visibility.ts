import type { User } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

type RoleFlags = {
  accesoConsoleAdmin?: boolean;
};

export type ContabilidadVisibilityTarget = {
  id?: number | null;
  userId?: number | null;
  isSuperAdmin?: boolean;
  permissions?: string[];
  roleName?: string | null;
  roleFlags?: RoleFlags | null;
};

const hasPermission = (permissions: string[] | undefined, permission: string) => {
  return Array.isArray(permissions) && permissions.includes(permission);
};

const isAdminTarget = (target: ContabilidadVisibilityTarget) => {
  if (target.isSuperAdmin) return true;
  if (target.roleFlags?.accesoConsoleAdmin) return true;
  if (hasPermission(target.permissions, PERMISSIONS.CONTABILIDAD_MANAGE)) return true;
  if (hasPermission(target.permissions, PERMISSIONS.CONSOLE_ADMIN)) return true;

  const roleName = (target.roleName || "").toLowerCase();
  return roleName.includes("admin");
};

const getTargetId = (target: ContabilidadVisibilityTarget) => {
  if (typeof target.id === "number") return target.id;
  if (typeof target.userId === "number") return target.userId;
  return null;
};

export const canViewContabilidadTarget = (
  currentUser: User | null | undefined,
  target: ContabilidadVisibilityTarget,
) => {
  if (!currentUser) return false;

  const targetId = getTargetId(target);
  if (targetId === currentUser.id) {
    return false;
  }

  if (currentUser.isSuperAdmin) {
    return true;
  }

  return !isAdminTarget(target);
};
