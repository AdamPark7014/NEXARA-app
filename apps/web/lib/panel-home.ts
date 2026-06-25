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

import { resolveOrgRoleKey } from "@/lib/org-roles";
import { hasPermission, PERMISSIONS, type UserPermissions } from "@/lib/permissions";
import { getHomeUrl, getHomePanel, PANEL_META, type PanelId } from "@/lib/access-matrix";
import { encodeHandoff } from "@/lib/cross-panel-handoff";

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
  user: (UserPermissions & { role?: string | null; orgRoleKey?: string | null }) | null | undefined,
): PanelHome {
  if (!user) return { panel: "erp", path: "/login" };

  const isSuperAdmin = Boolean(user.isSuperAdmin);

  // Developer técnico con acceso explícito a Lab → aterriza en Lab
  if (isSuperAdmin && hasPermission(user, PERMISSIONS.LAB_ACCESS)) {
    return { panel: "lab", path: PANEL_META.lab.entryPath };
  }

  const roleKey = resolveOrgRoleKey(user.role, user.orgRoleKey);
  const panel = getHomePanel(roleKey, isSuperAdmin);
  const path = getHomeUrl(roleKey, isSuperAdmin);

  return { panel, path };
}

/**
 * Resuelve el URL absoluto (con subdominio) del panel HOME del usuario.
 * Usado para redirecciones cross-subdomain después del login.
 * 
 * Ej: designer → https://studio.nexara.com.mx/dashboard
 *     ceo      → https://core.nexara.com.mx/executive
 */
export function getUserHomeUrlAbsolute(
  user: (UserPermissions & { role?: string | null; orgRoleKey?: string | null }) | null | undefined,
): string {
  if (!user) return 'https://core.nexara.com.mx/login';

  const isSuperAdmin = Boolean(user.isSuperAdmin);
  const roleKey = resolveOrgRoleKey(user.role, user.orgRoleKey);
  const panel = getHomePanel(roleKey, isSuperAdmin);
  const path = getHomeUrl(roleKey, isSuperAdmin);

  // Mapeo panel → subdominio canónico
  const SUBDOMAIN_MAP: Record<string, string> = {
    erp: 'core',
    crm: 'sales',
    ops: 'ops',
    studio: 'studio',
    lab: 'lab',
  };

  const subdomain = SUBDOMAIN_MAP[panel] || 'core';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
  const host = typeof window !== 'undefined' ? window.location.hostname : 'nexara.com.mx';

  /**
   * Añade el handoff ?_nxt= cuando el destino es un subdominio diferente.
   * El middleware lee este param para dejar pasar la request aunque nx_session
   * aún no exista en ese subdominio, y UserContext lo consume para rehidratar
   * la sesión (mismo mecanismo que usa el PanelSwitcher).
   */
  const addHandoff = (base: string, currentSub: string): string => {
    if (currentSub === subdomain) return path; // mismo subdominio → ruta relativa
    try {
      const encoded = encodeHandoff(JSON.stringify(user));
      return encoded ? `${base}?_nxt=${encoded}` : base;
    } catch {
      return base;
    }
  };

  // En desarrollo (localhost): usar puerto si aplica
  if (host.includes('localhost')) {
    const port = typeof window !== 'undefined' ? window.location.port : '';
    const currentSub = host.split('.')[0];
    const base = `${protocol}//${subdomain}.localhost${port ? `:${port}` : ''}${path}`;
    return addHandoff(base, currentSub);
  }

  // Producción (nexara.com.mx)
  const currentSub = host.split('.')[0];
  const base = `${protocol}//${subdomain}.nexara.com.mx${path}`;
  return addHandoff(base, currentSub);
}

/**
 * URL absoluta del panel home. La usamos en redirects post-login.
 * Devuelve siempre paths del nuevo modelo (/erp/dashboard, /crm/dashboard…).
 */
export function getUserHomeUrl(
  user: (UserPermissions & { role?: string | null; orgRoleKey?: string | null }) | null | undefined,
): string {
  return getUserHome(user).path;
}

/**
 * Verifica si el usuario está en su panel HOME en este momento.
 * Útil para no mostrar el switcher cuando ya estás donde debes estar.
 */
export function isOnHomePanel(
  user: (UserPermissions & { role?: string | null; orgRoleKey?: string | null }) | null | undefined,
  currentPanel: PanelId,
): boolean {
  return getUserHome(user).panel === currentPanel;
}
