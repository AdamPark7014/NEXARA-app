import { hasAnyPermission, hasPermission, PERMISSIONS, type UserPermissions } from "@/lib/permissions";

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

export const getRoleLabel = (user: PanelUser | null | undefined) => {
  if (!user) return "Vendedor";
  if (user.isSuperAdmin) return "Superadmin";

  const roleRaw = String(user.role || "").trim();
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
  if (assignedAvatar) return assignedAvatar;

  const seed = encodeURIComponent((user?.nombre || "NEXARA").trim());
  return `https://ui-avatars.com/api/?name=${seed}&background=0D8ABC&color=fff&size=96`;
};
