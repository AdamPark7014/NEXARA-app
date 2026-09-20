/**
 * Mapeo rol → panel HOME del usuario.
 *
 * Single source of truth: `apps/web/lib/access-matrix.ts` define qué panel
 * (ERP, CRM, OPS, STUDIO, LAB) corresponde a cada rol corporativo.
 *
 * Diseño UX:
 *  - Cada persona en NEXARA tiene UN panel principal donde pasa el 90% de su
 *    tiempo. Aterriza ahí después del login.
 *  - El menú lateral del panel HOME muestra solo lo que esa persona usa a
 *    diario; el resto de paneles accesibles se exponen vía el PanelSwitcher
 *    discreto del topbar.
 *  - Esto evita que (p.ej.) un ingeniero de campo vea menús de contabilidad
 *    o que Dirección Comercial vea evidencias de campo en su sidebar.
 */

import { hasPermission, PERMISSIONS, type UserPermissions } from "@/lib/permissions";
import { PANEL_META, type PanelId } from "@/lib/access-matrix";
import { CORE_SURFACE_ONLY, CORE_HOME_PATH, CORE_PANEL_ID, CONTABILIDAD_HOME_PATH } from "@/lib/core-surface";
import { buildCrossPanelUrl } from "@/lib/cross-panel-handoff";
import { getUserHomePanel, getUserHomePath } from "@/lib/user-access";
import { resolveV2RoleKey } from "@/lib/rbac/role-mapping";
import { ROLES } from "@/lib/rbac/roles";

export type PanelHome = {
  /** Panel canónico (erp, crm, ops, studio, lab). */
  panel: PanelId;
  /** Ruta absoluta para usar en redirects internos: /erp/dashboard, /crm/dashboard, etc. */
  path: string;
};

/**
 * Resuelve el panel HOME del usuario actual.
 * Si no logramos identificar su rol, cae a ERP/dashboard.
 */
export function getUserHome(
  user: (UserPermissions & { role?: string | null; orgRoleKey?: string | null; roleKey?: string | null }) | null | undefined,
): PanelHome {
  if (!user) return { panel: "erp", path: "/login" };

  if (CORE_SURFACE_ONLY) {
    const v2 = resolveV2RoleKey(user);
    if (v2 === ROLES.CONTABILIDAD) {
      return { panel: CORE_PANEL_ID, path: CONTABILIDAD_HOME_PATH };
    }
    return { panel: CORE_PANEL_ID, path: CORE_HOME_PATH };
  }

  const isSuperAdmin = Boolean(user.isSuperAdmin);

  if (isSuperAdmin && hasPermission(user, PERMISSIONS.LAB_ACCESS)) {
    return { panel: "lab", path: "/lab" };
  }

  return {
    panel: getUserHomePanel(user),
    path: getUserHomePath(user),
  };
}

/**
 * Resuelve el URL absoluto (con subdominio) del panel HOME del usuario.
 * Usado para redirecciones cross-subdomain después del login.
 * 
 * Ej: designer → https://studio.nexara.com.mx/dashboard
 *     ceo      → https://core.nexara.com.mx/executive
 */
export function getUserHomeUrlAbsolute(
  user: (UserPermissions & { role?: string | null; orgRoleKey?: string | null; roleKey?: string | null }) | null | undefined,
): string {
  if (!user) return 'https://core.nexara.com.mx/login';

  const panel = getUserHomePanel(user);
  const path = getUserHomePath(user);
  const userJson = JSON.stringify(user);

  if (typeof window === 'undefined') {
    return `https://${panel === 'erp' ? 'core' : panel === 'crm' ? 'sales' : panel}.nexara.com.mx${path}`;
  }

  return buildCrossPanelUrl(panel, path, userJson);
}

/**
 * URL absoluta del panel home. La usamos en redirects post-login.
 * Devuelve siempre paths del nuevo modelo (/erp/dashboard, /crm/dashboard…).
 */
export function getUserHomeUrl(
  user: (UserPermissions & { role?: string | null; orgRoleKey?: string | null; roleKey?: string | null }) | null | undefined,
): string {
  return getUserHome(user).path;
}

export function isOnHomePanel(
  user: (UserPermissions & { role?: string | null; orgRoleKey?: string | null; roleKey?: string | null }) | null | undefined,
  currentPanel: PanelId,
): boolean {
  return getUserHome(user).panel === currentPanel;
}
