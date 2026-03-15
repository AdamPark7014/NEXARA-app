import { PERMISSIONS, hasAnyPermission, hasPermission, type UserPermissions } from "@/lib/permissions";

export type PanelKey = "console" | "ventas" | "contabilidad" | "web" | "tickets";

export type MobilePanelOption = {
  key: PanelKey;
  icon: string;
  name: string;
  description: string;
  entryPath: string;
};

export const PANEL_COOKIE_NAME = "nexara_mobile_panel";

const PANEL_ORDER: MobilePanelOption[] = [
  {
    key: "console",
    icon: "🧩",
    name: "Consola",
    description: "Operacion central, usuarios y control jerarquico.",
    entryPath: "/dashboard",
  },
  {
    key: "ventas",
    icon: "📈",
    name: "Ventas",
    description: "Pipeline comercial, leads y oportunidades.",
    entryPath: "/dashboard",
  },
  {
    key: "contabilidad",
    icon: "💼",
    name: "Contabilidad",
    description: "Pagos, viaticos, horas y control financiero.",
    entryPath: "/dashboard",
  },
  {
    key: "web",
    icon: "🌐",
    name: "Web",
    description: "Gestion de contenido, clientes y proyectos web.",
    entryPath: "/dashboard",
  },
  {
    key: "tickets",
    icon: "🎫",
    name: "Tickets",
    description: "Seguimiento de solicitudes, sucursales e inventarios.",
    entryPath: "/tickets",
  },
];

const CLIENT_OR_BRANCH_ROLE_PATTERN = /(cliente|client|sucursal|branch)/i;
const CLIENT_OR_BRANCH_PERMISSION_PREFIXES = ["client-portal.", "branch-portal.", "client-auth.", "branch-auth.", "client-tickets."];

const isClientOrBranchAccount = (user: (UserPermissions & { role?: string }) | null | undefined) => {
  if (!user) return false;

  const roleText = (user.role || "").toLowerCase();
  const byRole = CLIENT_OR_BRANCH_ROLE_PATTERN.test(roleText);

  const permissions = user.permissions || [];
  const byPermissionPrefix = permissions.some((permission) =>
    CLIENT_OR_BRANCH_PERMISSION_PREFIXES.some((prefix) => permission.startsWith(prefix)),
  );

  return byRole || byPermissionPrefix;
};

const hasTicketsAccess = (user: UserPermissions & { role?: string } | null | undefined) => {
  if (!user) return false;
  return isClientOrBranchAccount(user);
};

export const getAccessiblePanels = (
  user: (UserPermissions & { role?: string }) | null | undefined,
): MobilePanelOption[] => {
  if (!user) return [];

  // Cuentas cliente/sucursal: acceso exclusivo al panel de tickets.
  if (isClientOrBranchAccount(user)) {
    return PANEL_ORDER.filter((panel) => panel.key === "tickets");
  }

  // Superadmin/admin internos: NO deben exponer tickets.
  if (user.isSuperAdmin) {
    return PANEL_ORDER.filter((panel) => panel.key !== "tickets");
  }

  const accessMap: Record<PanelKey, boolean> = {
    console: hasAnyPermission(user, [
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.USERS_MANAGE,
    ]),
    ventas: hasAnyPermission(user, [
      PERMISSIONS.PANEL_VENTAS,
      PERMISSIONS.SALES_VIEW,
      PERMISSIONS.SALES_MANAGE,
      PERMISSIONS.SALES_REPORTS_VIEW,
    ]),
    contabilidad: hasAnyPermission(user, [
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.CONTABILIDAD_MANAGE,
    ]),
    web: hasPermission(user, PERMISSIONS.PANEL_WEB),
    tickets: false,
  };

  return PANEL_ORDER.filter((panel) => accessMap[panel.key]);
};

export const setActivePanel = (panel: PanelKey) => {
  if (typeof document === "undefined") return;
  document.cookie = `${PANEL_COOKIE_NAME}=${panel}; path=/; max-age=2592000; SameSite=Lax`;
};

export const clearActivePanel = () => {
  if (typeof document === "undefined") return;
  document.cookie = `${PANEL_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
};
