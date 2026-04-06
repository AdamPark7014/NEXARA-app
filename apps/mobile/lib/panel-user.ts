import { hasAnyPermission, hasPermission, PERMISSIONS, type UserPermissions } from "@/lib/permissions";
import { getApiAssetOrigin } from "@/lib/api-base";

type PanelUser = UserPermissions & {
  nombre?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
};

export const isPlatformAdmin = (user: PanelUser | null | undefined) => {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return hasPermission(user, PERMISSIONS.CONSOLE_ADMIN);
};

export const isSalesManagerUser = (user: PanelUser | null | undefined) => {
  if (!user) return false;
  return isPlatformAdmin(user);
};

const sanitizeRoleLabel = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Legacy role names were persisted as "Rol · prefijoCorreo".
  const withoutLegacySuffix = raw.split('·')[0]?.trim() || raw;

  return withoutLegacySuffix
    .replace(/\s+/g, ' ')
    .trim();
};

export const getRoleLabel = (user: PanelUser | null | undefined) => {
  if (!user) return "Vendedor";
  if (user.isSuperAdmin) return "Superadmin";

  const roleRaw = sanitizeRoleLabel(user.role);
  const role = roleRaw.toLowerCase();

  // Vendedor se mantiene fijo por regla de negocio.
  if (role.includes("vended")) return "Vendedor";

  if (roleRaw) {
    return roleRaw
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  if (isPlatformAdmin(user)) return "Admin";
  return "Vendedor";
};

export const getAvatarSrc = (user: PanelUser | null | undefined) => {
  if (user?.isSuperAdmin) return "/logo-nexara.png";

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
