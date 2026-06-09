/**
 * NEXARA · RBAC v2 (FRONTEND) — Matriz de páginas por rol.
 * --------------------------------------------------------
 * Whitelist de páginas (no endpoints) por rol. Cualquier ruta NO listada está
 * bloqueada. Las APIs (`/api/**`) las controla el backend `UrlAccessGuard`.
 *
 * Convención de paths (canónica, alineada con `apps/web/app/(panels)/*` y
 * con el subdominio bonito):
 *   /erp/...     → core.nexara.com.mx        (ERP: CEO, directores, admin, RH, contabilidad)
 *   /crm/...     → sales.nexara.com.mx       (CRM: vendedores, coord. ventas)
 *   /ops/...     → ops.nexara.com.mx         (Ingenieros de campo, soporte, NOC)
 *   /studio/...  → studio.nexara.com.mx      (Diseñadores, marketing)
 *   /lab/...     → lab.nexara.com.mx         (Sandbox técnico, super_admin)
 *   /tickets/... → portal.nexara.com.mx      (Cliente externo)
 *
 * Aliases legacy (`/core`, `/sales`) se normalizan automáticamente vía
 * `normalizePathToCanonical()` para no romper bookmarks viejos.
 */
import { ROLES, type RoleKey } from './roles';

export type PageRule = string; // path con comodines: /erp/**, /crm/quotes/*, /erp/users/:id

/**
 * Mapeo de prefijos legacy → canónico. Mantiene compatibilidad con la
 * documentación previa (`/core/...`, `/sales/...`, `/portal/...`) sin tener
 * que reescribir cada referencia.
 */
const LEGACY_PANEL_PREFIX_MAP: Record<string, string> = {
  '/core': '/erp',
  '/sales': '/crm',
  '/portal': '/tickets',
};

/** Normaliza un pathname al prefijo de panel canónico (`/erp`, `/crm`, etc.). */
export function normalizePathToCanonical(pathname: string): string {
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  for (const [legacy, canonical] of Object.entries(LEGACY_PANEL_PREFIX_MAP)) {
    if (clean === legacy) return canonical;
    if (clean.startsWith(`${legacy}/`)) return `${canonical}${clean.slice(legacy.length)}`;
  }
  return clean;
}

/**
 * Páginas permitidas por rol (whitelist). Los paths usan los slugs reales que
 * existen en `apps/web/app/(panels)/*`. Si no aparece, está bloqueado.
 */
export const PAGE_MATRIX: Record<RoleKey, PageRule[]> = {
  // ─── SUPER_ADMIN — bypass total ───────────────────────────────────────
  [ROLES.SUPER_ADMIN]: ['/**'],

  // ─── CEO — ve TODO en lectura ─────────────────────────────────────────
  [ROLES.CEO]: [
    '/erp/**',
    '/crm/**',
    '/ops/**',
    '/studio/**',
  ],

  // ─── DIR. OPERACIONES — visión global, aprobaciones operativas ────────
  [ROLES.DIR_OPERACIONES]: [
    '/erp',
    '/erp/dashboard',
    '/erp/executive',
    '/erp/approvals',
    '/erp/architecture',
    '/erp/companies',
    '/erp/calendar',
    '/erp/documents',
    '/erp/finance/**',
    '/erp/procurement',
    '/erp/warehouse',
    '/erp/analytics/**',
    '/erp/exports',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/ops/**',
    '/crm/dashboard',
    '/crm/quotes/**',
    '/crm/projects/**',
    '/crm/tenders/**',
    '/crm/pipeline',
    '/crm/reports',
  ],

  // ─── DIR. ADMIN — finanzas, RH, gobierno ──────────────────────────────
  [ROLES.DIR_ADMIN]: [
    '/erp/**',
    '/crm/dashboard',
    '/crm/quotes/**',
    '/crm/reports',
  ],

  // ─── COORD ADMIN — segundo nivel administrativo ───────────────────────
  [ROLES.COORD_ADMIN]: [
    '/erp',
    '/erp/dashboard',
    '/erp/approvals',
    '/erp/companies',
    '/erp/calendar',
    '/erp/documents',
    '/erp/accounting',
    '/erp/banking',
    '/erp/invoicing',
    '/erp/finance/**',
    '/erp/procurement',
    '/erp/warehouse',
    '/erp/users',
    '/erp/exports',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/erp/news',
  ],

  // ─── ADMINISTRATIVO — operación día a día ─────────────────────────────
  [ROLES.ADMINISTRATIVO]: [
    '/erp',
    '/erp/dashboard',
    '/erp/approvals',
    '/erp/companies',
    '/erp/calendar',
    '/erp/documents',
    '/erp/finance/viatics',
    '/erp/finance/expenses',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/erp/news',
  ],

  // ─── COORD OPERACIONES — supervisa campo / project manager ────────────
  [ROLES.COORD_OPERACIONES]: [
    '/ops',
    '/ops/dashboard',
    '/ops/activities',
    '/ops/evidences',
    '/ops/projects',
    '/ops/vehicles',
    '/ops/maintenance/**',
    '/ops/support/**',
    '/ops/noc',
    '/ops/gps',
    '/ops/assets',
    '/ops/service-clients',
    '/ops/tools',
    '/ops/recruiting',
    '/erp/calendar',
    '/erp/dashboard',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/crm/quotes',
  ],

  // ─── ING. CAMPO — solo lo suyo ────────────────────────────────────────
  [ROLES.ING_CAMPO]: [
    '/ops',
    '/ops/dashboard',
    '/ops/my-activities',
    '/ops/my-evidences',
    '/ops/my-viatics',
    '/ops/my-vehicles',
    '/ops/tools',
    '/erp/notifications-center',
    '/erp/my-profile',
  ],

  // ─── ING. SOPORTE — tickets, NOC, mantenimiento ───────────────────────
  [ROLES.ING_SOPORTE]: [
    '/ops',
    '/ops/dashboard',
    '/ops/support/**',
    '/ops/noc',
    '/ops/maintenance/**',
    '/ops/assets',
    '/ops/service-clients',
    '/ops/activities',
    '/erp/notifications-center',
    '/erp/my-profile',
  ],

  // ─── COORD VENTAS — gerente comercial ─────────────────────────────────
  [ROLES.COORD_VENTAS]: [
    '/crm/**',
    '/erp/dashboard',
    '/erp/notifications-center',
    '/erp/my-profile',
  ],

  // ─── VENDEDOR — su pipeline ──────────────────────────────────────────
  [ROLES.VENDEDOR]: [
    '/crm',
    '/crm/dashboard',
    '/crm/leads',
    '/crm/clients',
    '/crm/opportunities',
    '/crm/quotes',
    '/crm/templates',
    '/crm/agenda',
    '/crm/products',
    '/crm/targets',
    '/crm/pipeline',
    '/erp/notifications-center',
    '/erp/my-profile',
  ],

  // ─── LÍDER DISEÑO — Studio completo ───────────────────────────────────
  [ROLES.LIDER_DISENO]: [
    '/studio/**',
    '/erp/dashboard',
    '/erp/notifications-center',
    '/erp/my-profile',
  ],

  // ─── DISEÑADOR — Studio core ──────────────────────────────────────────
  [ROLES.DISENADOR]: [
    '/studio',
    '/studio/dashboard',
    '/studio/pages',
    '/studio/news',
    '/studio/social',
    '/studio/cases',
    '/studio/contacts',
    '/studio/leads',
    '/erp/notifications-center',
    '/erp/my-profile',
  ],

  // ─── RH ───────────────────────────────────────────────────────────────
  [ROLES.RH]: [
    '/erp',
    '/erp/dashboard',
    '/erp/hr/**',
    '/erp/finance/employee-payments',
    '/erp/calendar',
    '/erp/documents',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/ops/recruiting',
  ],

  // ─── CONTABILIDAD ─────────────────────────────────────────────────────
  [ROLES.CONTABILIDAD]: [
    '/erp',
    '/erp/dashboard',
    '/erp/accounting',
    '/erp/banking',
    '/erp/invoicing',
    '/erp/finance/**',
    '/erp/exports',
    '/erp/calendar',
    '/erp/documents',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/crm/quotes',
  ],

  // ─── CLIENTE EXTERNO — portal ─────────────────────────────────────────
  [ROLES.CLIENTE]: [
    '/tickets',
    '/tickets/**',
  ],
};

function compilePattern(path: string): RegExp {
  const escaped = path
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*\*/g, '(/.*)?')
    .replace(/\/\*/g, '/[^/]+')
    .replace(/:[a-zA-Z_]+/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

const cache = new Map<string, RegExp>();
function rx(p: string): RegExp {
  let r = cache.get(p);
  if (!r) { r = compilePattern(p); cache.set(p, r); }
  return r;
}

/** Verifica si un rol puede ABRIR una página concreta (acepta paths legacy). */
export function canOpenPage(role: RoleKey, pathname: string): boolean {
  if (role === ROLES.SUPER_ADMIN) return true;
  const clean = normalizePathToCanonical(pathname);
  const rules = PAGE_MATRIX[role] ?? [];
  return rules.some(p => rx(p).test(clean));
}

/** Lista plana de prefijos permitidos (para sidebar / introspección). */
export function allowedPrefixes(role: RoleKey): string[] {
  return PAGE_MATRIX[role] ?? [];
}
