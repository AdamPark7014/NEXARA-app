import {
  getOrgRoleLabel,
  isFieldRole,
  isSalesRole,
  ORG_ROLE_KEYS,
  resolveOrgRoleKey,
  type OrgRoleKey,
} from "@/lib/org-roles";
import { hasAnyPermission, hasPermission, PERMISSIONS, type UserPermissions } from "@/lib/permissions";

const CONTABILIDAD_ACCESS_PERMISSIONS = [
  PERMISSIONS.CONTABILIDAD_VIEW,
  PERMISSIONS.CONTABILIDAD_MANAGE,
  PERMISSIONS.ACCOUNTING_VIEW,
  PERMISSIONS.ACCOUNTING_MANAGE,
  PERMISSIONS.ACCOUNTING_POST,
  PERMISSIONS.INVOICING_VIEW,
  PERMISSIONS.INVOICING_MANAGE,
  PERMISSIONS.BANKING_VIEW,
  PERMISSIONS.BANKING_MANAGE,
];

const SALES_FLAVORED_PERMISSIONS = [
  PERMISSIONS.PANEL_VENTAS,
  PERMISSIONS.SALES_VIEW,
  PERMISSIONS.SALES_MANAGE,
  PERMISSIONS.SALES_REPORTS_VIEW,
];
import { getApiAssetOrigin } from "@/lib/api-base";

type PanelUser = UserPermissions & {
  nombre?: string | null;
  email?: string | null;
  role?: string | null;
  isPlatformOwner?: boolean;
  avatarUrl?: string | null;
};

export const resolveUserOrgRoleKey = (user: PanelUser | null | undefined): OrgRoleKey | null => {
  if (!user) return null;
  return resolveOrgRoleKey(user.role, user.orgRoleKey);
};

export const isPlatformAdmin = (user: PanelUser | null | undefined) => {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const key = resolveUserOrgRoleKey(user);
  if (key === ORG_ROLE_KEYS.CEO || key === ORG_ROLE_KEYS.DIRECTOR_ADMIN) return true;
  return hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
};

export const isOperationsDirector = (user: PanelUser | null | undefined) => {
  const key = resolveUserOrgRoleKey(user);
  return key === ORG_ROLE_KEYS.DIRECTOR_OPS || (user?.isSuperAdmin ?? false);
};

export const isCommercialDirector = (user: PanelUser | null | undefined) => {
  const key = resolveUserOrgRoleKey(user);
  return key === ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL || (user?.isSuperAdmin ?? false);
};

export const isSalesManagerUser = (user: PanelUser | null | undefined) => {
  if (!user) return false;
  if (isPlatformAdmin(user)) return true;
  const key = resolveUserOrgRoleKey(user);
  return key === ORG_ROLE_KEYS.SALES_MANAGER || key === ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL;
};

export const isFieldUser = (user: PanelUser | null | undefined) => {
  if (!user || user.isSuperAdmin) return false;
  if (isPlatformAdmin(user)) return false;
  const key = resolveUserOrgRoleKey(user);
  if (key && isFieldRole(key)) return true;
  return /ingenier/i.test(String(user.role || ""));
};

export const isSalesUser = (user: PanelUser | null | undefined) => {
  if (!user) return false;
  const key = resolveUserOrgRoleKey(user);
  if (key && isSalesRole(key)) return true;
  return hasAnyPermission(user, SALES_FLAVORED_PERMISSIONS);
};

export const canAccessContabilidadPanel = (user: PanelUser | null | undefined) => {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const key = resolveUserOrgRoleKey(user);
  if (key === ORG_ROLE_KEYS.ACCOUNTANT || key === ORG_ROLE_KEYS.DIRECTOR_ADMIN) return true;
  if (hasPermission(user, PERMISSIONS.CONSOLE_ADMIN)) return true;
  return hasAnyPermission(user, CONTABILIDAD_ACCESS_PERMISSIONS);
};

const sanitizeRoleLabel = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withoutLegacySuffix = raw.split("·")[0]?.trim() || raw;
  return withoutLegacySuffix.replace(/\s+/g, " ").trim();
};

export const getRoleLabel = (user: PanelUser | null | undefined) => {
  if (!user) return "Invitado";

  const orgLabel = getOrgRoleLabel(user.role, user.orgRoleKey, user.isSuperAdmin, {
    email: user.email,
    isPlatformOwner: user.isPlatformOwner,
  });
  if (orgLabel) return orgLabel;

  const roleRaw = sanitizeRoleLabel(user.role);
  const role = roleRaw.toLowerCase();

  if (role.includes("vended")) return "Ejecutivo de Ventas";
  if (/panel/i.test(roleRaw) && /venta/i.test(roleRaw)) return "Ejecutivo de Ventas";
  if (role.includes("ingenier")) return "Ingeniero de Campo";
  if (roleRaw) {
    return roleRaw
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  if (hasAnyPermission(user, CONTABILIDAD_ACCESS_PERMISSIONS)) return "Contador";
  if (hasAnyPermission(user, SALES_FLAVORED_PERMISSIONS)) return "Ejecutivo de Ventas";
  return "Colaborador";
};

export const getAvatarSrc = (user: PanelUser | null | undefined) => {
  if (user?.isSuperAdmin) return "/logo-nexara-lockup.png";

  const assignedAvatar = (user?.avatarUrl || "").trim();
  if (assignedAvatar) {
    const apiOrigin = getApiAssetOrigin();
    if (/^(data:|blob:|\/\/)/i.test(assignedAvatar)) return assignedAvatar;
    if (/^https?:\/\//i.test(assignedAvatar)) {
      try {
        const parsed = new URL(assignedAvatar);
        if (parsed.pathname.startsWith("/uploads/")) {
          return `${apiOrigin}${parsed.pathname}${parsed.search}`;
        }
      } catch {
        // Keep original URL if parsing fails.
      }
      return assignedAvatar;
    }

    const normalizedPath = assignedAvatar.startsWith("/") ? assignedAvatar : `/${assignedAvatar}`;
    return `${apiOrigin}${normalizedPath}`;
  }

  const seed = encodeURIComponent((user?.nombre || "NEXARA").trim());
  return `https://ui-avatars.com/api/?name=${seed}&background=0D8ABC&color=fff&size=96`;
};
