import { PERMISSIONS, hasAnyPermission, hasPermission, type UserPermissions } from "@/lib/permissions";
import { ORG_ROLE_KEYS, resolveOrgRoleKey, type OrgRoleKey } from "@/lib/org-roles";
import { getAllowedPanels, PANEL_META, LEGACY_PANEL_MAP, type PanelId, type PanelMeta } from "@/lib/access-matrix";

export type PanelKey =
  | "console"
  | "operacion"
  | "ventas"
  | "contabilidad"
  | "web"
  | "tickets"
  | "support"
  | "noc"
  | "people"
  | "lab";

/**
 * Mapeo de PanelKey (legacy) → PanelId (canónico) de los 5 paneles
 * consolidados. Sirve para que el switcher viejo siga funcionando
 * mientras migramos por completo a `access-matrix.ts`.
 */
export const LEGACY_PANEL_TO_NEW: Record<PanelKey, PanelId | "tickets"> = {
  console: "erp",
  contabilidad: "erp",
  people: "erp",
  operacion: "ops",
  noc: "ops",
  support: "ops",
  ventas: "crm",
  web: "studio",
  lab: "lab",
  tickets: "tickets", // portal cliente externo, fuera del modelo consolidado
};

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
    icon: "⚙️",
    name: "Administración",
    description: "RRHH, finanzas, inventario, configuración y BI.",
    entryPath: "/console/dashboard",
  },
  {
    key: "operacion",
    icon: "🚀",
    name: "Operación",
    description: "Helpdesk, instalaciones, activos y servicio en campo.",
    entryPath: "/operacion/dashboard",
  },
  {
    key: "ventas",
    icon: "📈",
    name: "Ventas",
    description: "Pipeline comercial, leads y oportunidades.",
    entryPath: "/ventas/dashboard",
  },
  {
    key: "contabilidad",
    icon: "💼",
    name: "Contabilidad",
    description: "Pagos, viáticos, horas y control financiero.",
    entryPath: "/contabilidad/dashboard",
  },
  {
    key: "web",
    icon: "🌐",
    name: "Web",
    description: "Gestión de contenido, clientes y proyectos web.",
    entryPath: "/web/dashboard",
  },
  {
    key: "tickets",
    icon: "🎫",
    name: "Portal Clientes",
    description: "Seguimiento de solicitudes, sucursales e inventarios para clientes.",
    entryPath: "/tickets",
  },
  {
    key: "support",
    icon: "🆘",
    name: "Helpdesk Interno",
    description: "Tickets de IT, accesos y RH para el propio equipo Nexara.",
    entryPath: "/support",
  },
  {
    key: "noc",
    icon: "📡",
    name: "NOC · Monitoreo",
    description: "Uptime de cámaras, POS, IoT y alertas críticas 24/7.",
    entryPath: "/noc",
  },
  {
    key: "people",
    icon: "👥",
    name: "People · RRHH",
    description: "Mi asistencia, vacaciones, organigrama y KPIs de RH.",
    entryPath: "/people",
  },
  {
    key: "lab",
    icon: "🧪",
    name: "Lab",
    description: "Playground interno: API, AI sandbox, feature flags.",
    entryPath: "/lab",
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
  user: (UserPermissions & { role?: string; orgRoleKey?: string | null }) | null | undefined,
): MobilePanelOption[] => {
  if (!user) return [];

  // Cuentas cliente/sucursal: acceso exclusivo al panel de tickets.
  if (isClientOrBranchAccount(user)) {
    return PANEL_ORDER.filter((panel) => panel.key === "tickets");
  }

  const orgKey = resolveOrgRoleKey(user.role, user.orgRoleKey);

  // Superadmin / CEO: todos los paneles internos.
  if (user.isSuperAdmin || orgKey === ORG_ROLE_KEYS.CEO) {
    return PANEL_ORDER.filter((panel) => panel.key !== "tickets");
  }

  const accessMap: Record<PanelKey, boolean> = {
    console: hasAnyPermission(user, [
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.HR_VIEW,
      PERMISSIONS.HR_MANAGE,
    ]) || orgKey === ORG_ROLE_KEYS.DIRECTOR_ADMIN || orgKey === ORG_ROLE_KEYS.HR_SPECIALIST
      || orgKey === ORG_ROLE_KEYS.ADMIN_STAFF || orgKey === ORG_ROLE_KEYS.WAREHOUSE_MANAGER
      || orgKey === ORG_ROLE_KEYS.PROCUREMENT_OFFICER
      // Arquitecto ve plantilla del equipo y actividades en ERP
      || orgKey === ORG_ROLE_KEYS.ARQUITECTO,
    operacion: hasAnyPermission(user, [
      PERMISSIONS.CONSOLE_ACCESS,
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.ACTIVITIES_MANAGE,
      PERMISSIONS.ACTIVITIES_VIEW,
      PERMISSIONS.EVIDENCES_REVIEW,
      PERMISSIONS.EVIDENCES_CREATE,
      PERMISSIONS.MAINTENANCE_VIEW,
      PERMISSIONS.ASSETS_VIEW,
    ]) || orgKey === ORG_ROLE_KEYS.DIRECTOR_OPS || orgKey === ORG_ROLE_KEYS.PROJECT_MANAGER
      || orgKey === ORG_ROLE_KEYS.SENIOR_ENGINEER || orgKey === ORG_ROLE_KEYS.FIELD_ENGINEER
      || orgKey === ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR || orgKey === ORG_ROLE_KEYS.SUPPORT_AGENT
      || orgKey === ORG_ROLE_KEYS.WAREHOUSE_MANAGER
      // ── Roles NEXARA ──────────────────────────────────────────────
      || orgKey === ORG_ROLE_KEYS.ARQUITECTO || orgKey === ORG_ROLE_KEYS.COORD_OPERACIONES,
    ventas: hasAnyPermission(user, [
      PERMISSIONS.PANEL_VENTAS,
      PERMISSIONS.SALES_VIEW,
      PERMISSIONS.SALES_MANAGE,
      PERMISSIONS.SALES_REPORTS_VIEW,
      PERMISSIONS.COTIZACIONES_ACCESS,
    ]) || orgKey === ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL || orgKey === ORG_ROLE_KEYS.SALES_MANAGER
      || orgKey === ORG_ROLE_KEYS.SALES_REP || orgKey === ORG_ROLE_KEYS.DESIGNER,
    contabilidad: hasAnyPermission(user, [
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.CONTABILIDAD_MANAGE,
    ]) || orgKey === ORG_ROLE_KEYS.ACCOUNTANT || orgKey === ORG_ROLE_KEYS.DIRECTOR_ADMIN,
    web: hasPermission(user, PERMISSIONS.PANEL_WEB) || orgKey === ORG_ROLE_KEYS.DESIGNER,
    tickets: false,
    // Paneles satélite: support y people son de acceso amplio (cualquier empleado).
    support: hasPermission(user, PERMISSIONS.PANEL_SUPPORT) || true,
    people: hasPermission(user, PERMISSIONS.PANEL_PEOPLE) || true,
    // NOC: NOC team + dirección operaciones + senior eng + support agents
    noc: hasAnyPermission(user, [PERMISSIONS.PANEL_NOC, PERMISSIONS.NOC_VIEW, PERMISSIONS.CONSOLE_ADMIN])
      || orgKey === ORG_ROLE_KEYS.DIRECTOR_OPS || orgKey === ORG_ROLE_KEYS.NOC_LEAD
      || orgKey === ORG_ROLE_KEYS.NOC_OPERATOR || orgKey === ORG_ROLE_KEYS.SUPPORT_AGENT
      || orgKey === ORG_ROLE_KEYS.SENIOR_ENGINEER,
    // Lab: solo super-admin / dev team.
    lab: hasAnyPermission(user, [PERMISSIONS.PANEL_LAB, PERMISSIONS.LAB_ACCESS]),
  };

  const panels = PANEL_ORDER.filter((panel) => accessMap[panel.key]);

  // Intersección con access-matrix: solo dejamos paneles legacy cuyo panel
  // consolidado equivalente (LEGACY_PANEL_MAP) está permitido por la matriz
  // canónica para este rol. Esto evita que el switcher legacy muestre paneles
  // a los que el rol ya no tiene acceso real en `(panels)/`.
  // `tickets` (portal cliente externo) se respeta tal cual lo decidió la
  // lógica de `accessMap` arriba — no pertenece al modelo de 5 paneles.
  if (orgKey) {
    const allowedNew = new Set(getAllowedPanels(orgKey, Boolean(user.isSuperAdmin)).map((p) => p.id));
    return panels.filter((panel) => {
      if (panel.key === "tickets") return true;
      const consolidatedId = LEGACY_PANEL_MAP[panel.key];
      return consolidatedId ? allowedNew.has(consolidatedId) : true;
    });
  }

  return panels;
};

export const setActivePanel = (panel: PanelKey) => {
  if (typeof document === "undefined") return;
  document.cookie = `${PANEL_COOKIE_NAME}=${panel}; path=/; max-age=2592000; SameSite=Lax`;
};

export const clearActivePanel = () => {
  if (typeof document === "undefined") return;
  document.cookie = `${PANEL_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
};

// ─────────────────────────────────────────────────────────────────────────
// NUEVO MODELO (5 paneles consolidados) — recomendado para código fresco
// ─────────────────────────────────────────────────────────────────────────

/**
 * Devuelve los paneles consolidados (ERP, CRM, OPS, STUDIO, LAB) accesibles
 * para el usuario actual. Esta es la API canónica que usa el AppShell nuevo.
 *
 * Si necesitas el modelo viejo (10 PanelKey) para compatibilidad con el
 * `PanelSwitcher` legacy, usa `getAccessiblePanels` arriba.
 */
export const getAccessiblePanelsV2 = (
  user: (UserPermissions & { role?: string; orgRoleKey?: string | null }) | null | undefined,
): PanelMeta[] => {
  if (!user) return [];
  const isSuperAdmin = Boolean(user.isSuperAdmin);
  const roleKey = resolveOrgRoleKey(user.role, user.orgRoleKey);
  return getAllowedPanels(roleKey, isSuperAdmin);
};

/**
 * Resuelve el `PanelMeta` (icono, nombre, color, entryPath) a partir de un
 * `PanelKey` legacy. Útil para mostrar metadatos modernos en código que aún
 * trabaja con los slugs viejos.
 */
export const resolvePanelMetaFromLegacyKey = (key: PanelKey): PanelMeta | null => {
  const newId = LEGACY_PANEL_TO_NEW[key];
  if (newId === "tickets" || !newId) return null;
  return PANEL_META[newId];
};
