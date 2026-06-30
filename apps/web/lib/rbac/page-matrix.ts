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
import { ROLES, SELF_ATTENDANCE_PATHS, type RoleKey } from './roles';
import { normalizeLegacyPath } from '@/lib/legacy-path-remap';

export type PageRule = string; // path con comodines: /erp/**, /crm/quotes/*, /erp/users/:id

/**
 * Mapeo legacy documentado en `lib/legacy-path-remap.ts`.
 */

/** Normaliza un pathname al prefijo de panel canónico (`/erp`, `/crm`, etc.). */
export function normalizePathToCanonical(pathname: string): string {
  return normalizeLegacyPath(pathname);
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
    '/lab/**',
  ],

  // ─── ARQUITECTO — OPS supervisor + ERP parcial ────────────────────────
  [ROLES.ARQUITECTO]: [
    '/ops/**',
    '/erp/dashboard',
    '/erp/calendar',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/crm/quotes/**',
    '/crm/projects/**',
    ...SELF_ATTENDANCE_PATHS,
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

  // ─── DIR. ADMIN — finanzas, RH, gobierno + lectura OPS para facturación ──
  [ROLES.DIR_ADMIN]: [
    '/erp/**',
    '/crm/dashboard',
    '/crm/quotes/**',
    '/crm/reports',
    '/crm/team',
    '/crm/targets',
    '/crm/templates',
    '/crm/tenders',
    // Acceso de lectura a OPS: reportes de campo → facturación y seguimiento cliente
    '/ops/activities',
    '/ops/activities/**',
    '/ops/projects',
    '/ops/projects/**',
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
    '/erp/warehouse/**',
    '/erp/users',
    '/erp/exports',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/erp/news',
    '/crm/dashboard',
    '/crm/leads/**',
    '/crm/clients/**',
    '/crm/opportunities/**',
    '/crm/quotes/**',
    '/crm/products',
    '/crm/products/**',
    '/crm/projects/**',
    '/crm/pipeline',
    '/ops/tools',
    '/ops/tools/**',
    // Acceso de lectura a OPS: reportes de campo → facturación y seguimiento cliente
    '/ops/activities',
    '/ops/activities/**',
    '/ops/projects',
    '/ops/projects/**',
    ...SELF_ATTENDANCE_PATHS,
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
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── COORD OPERACIONES — supervisa campo / project manager ────────────
  [ROLES.COORD_OPERACIONES]: [
    '/ops/**',
    '/erp/calendar',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/crm/quotes',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── ING. CAMPO — solo lo suyo ────────────────────────────────────────
  [ROLES.ING_CAMPO]: [
    '/ops/**',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/erp/calendar',
    '/erp/documents',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── ING. SOPORTE — campo + cuenta ERP operativa ───────────────────────
  [ROLES.ING_SOPORTE]: [
    '/ops/my-activities',
    '/ops/my-activities/**',
    '/ops/activities/**',
    '/ops/my-viatics',
    '/ops/my-viatics/**',
    '/ops/my-vehicles',
    '/ops/my-vehicles/**',
    '/ops/tools',
    '/ops/tools/**',
    '/ops/dashboard',
    '/ops/support',
    '/ops/support/**',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/erp/calendar',
    '/erp/kb',
    '/erp/kb/**',
    '/erp/documents',
    '/erp/documents/**',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── COORD VENTAS — gerente comercial ─────────────────────────────────
  [ROLES.COORD_VENTAS]: [
    '/crm/**',
    '/erp/dashboard',
    '/erp/notifications-center',
    '/erp/my-profile',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── VENDEDOR — su pipeline ──────────────────────────────────────────
  [ROLES.VENDEDOR]: [
    '/crm/**',
    '/erp/notifications-center',
    '/erp/my-profile',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── LÍDER DISEÑO — Studio + material comercial (CRM) + cuenta ERP ─────
  [ROLES.LIDER_DISENO]: [
    '/studio/**',
    '/crm/quotes/**',
    '/crm/products/**',
    '/crm/templates',
    '/crm/templates/**',
    '/erp/calendar',
    '/erp/notifications-center',
    '/erp/my-profile',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── DISEÑADOR — Studio + apoyo en cotizaciones ───────────────────────
  [ROLES.DISENADOR]: [
    '/studio/**',
    '/crm/quotes/**',
    '/crm/products/**',
    '/erp/calendar',
    '/erp/notifications-center',
    '/erp/my-profile',
    ...SELF_ATTENDANCE_PATHS,
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
    '/crm/projects/**',
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

const EXECUTIVE_OPS_SELF_DENY = /^\/ops\/my-(activities|viatics|vehicles|evidences)(\/|$)/;

/** Verifica si un rol puede ABRIR una página concreta (acepta paths legacy). */
export function canOpenPage(role: RoleKey, pathname: string): boolean {
  if (role === ROLES.SUPER_ADMIN) return true;
  const clean = normalizePathToCanonical(pathname);
  if (
    (role === ROLES.CEO || role === ROLES.DIR_ADMIN || role === ROLES.DIR_OPERACIONES || role === ROLES.ARQUITECTO)
    && EXECUTIVE_OPS_SELF_DENY.test(clean)
  ) {
    return false;
  }
  const rules = PAGE_MATRIX[role] ?? [];
  return rules.some(p => rx(p).test(clean));
}

/** Lista plana de prefijos permitidos (para sidebar / introspección). */
export function allowedPrefixes(role: RoleKey): string[] {
  return PAGE_MATRIX[role] ?? [];
}
