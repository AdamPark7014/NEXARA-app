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
 *   /integra/... → integra.nexara.com.mx     (CCTV/ACS Artemis)
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
    '/integra/**',
  ],

  // ─── ARQUITECTO — OPS supervisor + ERP parcial ────────────────────────
  [ROLES.ARQUITECTO]: [
    '/ops/**',
    '/erp/dashboard',
    '/erp/chat',
    '/erp/reuniones',
    '/erp/calendar',
    '/erp/approvals',
    // Diseña y planea proyectos: expedientes y base de conocimiento técnica.
    // `url-matrix` ya se las concedía; era esta capa la que las negaba.
    '/erp/documents',
    '/erp/documents/**',
    '/erp/kb',
    '/erp/kb/**',
    '/erp/hr/orgchart',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/crm/quotes/**',
    '/crm/projects/**',
    '/integra/**',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── DIR. OPERACIONES — visión global, aprobaciones operativas ────────
  [ROLES.DIR_OPERACIONES]: [
    '/erp',
    '/erp/dashboard',
    '/erp/chat',
    '/erp/reuniones',
    '/erp/executive',
    '/erp/approvals',
    '/erp/architecture',
    '/erp/companies',
    '/erp/calendar',
    '/erp/documents',
    '/erp/finance/**',
    // Con el path desnudo se abría la lista pero no el detalle (`/erp/warehouse/5`).
    '/erp/procurement/**',
    '/erp/warehouse/**',
    '/erp/analytics/**',
    '/erp/exports',
    '/erp/kb',
    '/erp/kb/**',
    '/erp/hr/orgchart',
    '/erp/news',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/ops/**',
    '/crm/dashboard',
    '/crm/quotes/**',
    '/crm/projects/**',
    '/crm/tenders/**',
    '/crm/pipeline',
    '/crm/reports',
    '/erp/facilities/**',
    '/integra/**',
    // Un director también ficha su propia entrada.
    ...SELF_ATTENDANCE_PATHS,
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
    '/crm/tenders/**',
    // Dirección Administrativa lleva el seguimiento a clientes (organigrama):
    // `section-views` ya la cuenta como SALES_MANAGERS, esta capa la frenaba.
    '/crm/leads/**',
    '/crm/opportunities/**',
    '/crm/clients/**',
    '/crm/products/**',
    '/crm/projects/**',
    '/crm/pipeline',
    '/crm/agenda',
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
    '/erp/chat',
    '/erp/reuniones',
    '/erp/approvals',
    '/erp/companies',
    '/erp/calendar',
    '/erp/documents',
    '/erp/accounting',
    '/erp/banking',
    // El detalle de una factura vive en `/erp/invoicing/:id`: sin el comodín se
    // abría el listado y no se podía entrar a ninguna.
    '/erp/invoicing/**',
    '/erp/finance/**',
    '/erp/procurement/**',
    '/erp/warehouse',
    '/erp/warehouse/**',
    '/erp/users',
    '/erp/exports',
    // Coordinación Administrativa es HR_MANAGER en `section-views`: plantilla,
    // incidencias y KPIs de personas ya se le muestran, faltaba dejarla entrar.
    '/erp/hr',
    '/erp/hr/fines',
    '/erp/hr/kpis',
    '/erp/hr/orgchart',
    '/erp/kb',
    '/erp/kb/**',
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
    '/crm/agenda',
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
    '/erp/chat',
    '/erp/reuniones',
    '/erp/approvals',
    '/erp/companies',
    '/erp/calendar',
    '/erp/documents',
    '/erp/finance/viatics',
    '/erp/finance/expenses',
    // Facturación es su función #1 en el organigrama (`docs/AREAS-VS-SISTEMA.md`
    // §2). El path desnudo dejaba abrir el listado pero ninguna factura.
    '/erp/invoicing/**',
    // "Compras con Mayorista" y almacén, también función propia del área.
    '/erp/procurement/**',
    '/erp/warehouse/**',
    '/crm/quotes/**',
    '/crm/clients/**',
    // Seguimiento a clientes: `section-views` ya nombra a ADMINISTRATIVO en
    // crm-leads / crm-pipeline / crm-agenda; faltaba la whitelist de páginas.
    '/crm/leads/**',
    '/crm/pipeline',
    '/crm/agenda',
    // Flotilla: `resolveOpsPairNav(vehicles)` le devuelve vista de equipo.
    '/ops/vehicles',
    '/ops/vehicles/**',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/erp/news',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── COORD OPERACIONES — supervisa campo / project manager ────────────
  [ROLES.COORD_OPERACIONES]: [
    '/ops/**',
    '/ops/chat',
    '/erp/chat',
    '/erp/reuniones',
    '/erp/calendar',
    // Planifica servicios y da seguimiento a proyectos: aprueba viáticos y OT,
    // y necesita expedientes y procedimientos. `section-views` ya lo asume.
    '/erp/approvals',
    '/erp/documents',
    '/erp/documents/**',
    '/erp/kb',
    '/erp/kb/**',
    '/erp/hr/orgchart',
    '/erp/notifications-center',
    '/erp/my-profile',
    // Sin comodín no podía abrir una cotización concreta, solo el listado.
    '/crm/quotes/**',
    '/integra/**',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── ING. CAMPO — solo lo suyo ────────────────────────────────────────
  [ROLES.ING_CAMPO]: [
    '/ops/**',
    '/ops/chat',
    '/erp/chat',
    '/erp/reuniones',
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
    '/ops/chat',
    '/ops/support',
    '/ops/support/**',
    '/ops/noc',
    '/ops/noc/**',
    '/erp/chat',
    '/erp/reuniones',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/erp/calendar',
    '/erp/kb',
    '/erp/kb/**',
    '/erp/documents',
    '/erp/documents/**',
    // Soporte cotiza refacciones y renovaciones: `section-views` ya lo nombra
    // explícitamente en `crm-quotes`.
    '/crm/quotes',
    '/crm/quotes/**',
    '/integra/**',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── COORD VENTAS — gerente comercial ─────────────────────────────────
  [ROLES.COORD_VENTAS]: [
    '/crm/**',
    '/crm/chat',
    '/erp/dashboard',
    '/erp/chat',
    '/erp/reuniones',
    // Faltaba hasta su propio calendario, que `section-views` da a todo el
    // personal interno. Aprobaciones y KB corresponden a su nivel (tier 70).
    '/erp/calendar',
    '/erp/approvals',
    '/erp/kb',
    '/erp/kb/**',
    '/erp/documents',
    '/erp/documents/**',
    '/erp/hr/orgchart',
    // Los leads y contactos que entran por el sitio son materia de ventas:
    // `studio-contacts` / `studio-leads` ya listan a SALES_MANAGERS.
    '/studio/contacts',
    '/studio/leads',
    '/erp/notifications-center',
    '/erp/my-profile',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── VENDEDOR — su pipeline ──────────────────────────────────────────
  [ROLES.VENDEDOR]: [
    '/crm/**',
    '/crm/chat',
    '/erp/chat',
    '/erp/reuniones',
    '/erp/calendar',
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
    '/erp/chat',
    '/erp/reuniones',
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
    '/erp/chat',
    '/erp/reuniones',
    '/erp/calendar',
    '/erp/notifications-center',
    '/erp/my-profile',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── RH ───────────────────────────────────────────────────────────────
  [ROLES.RH]: [
    '/erp',
    '/erp/dashboard',
    '/erp/chat',
    '/erp/reuniones',
    '/erp/hr/**',
    '/erp/finance/employee-payments',
    // Viáticos: `resolveViaticsSidebarHome` manda a RH al home de finanzas ERP,
    // así que el módulo se le pintaba y la ruta se le negaba.
    '/erp/finance/viatics',
    // Autoriza permisos, vacaciones e incidencias del personal.
    '/erp/approvals',
    '/erp/kb',
    '/erp/kb/**',
    '/erp/calendar',
    '/erp/documents',
    '/erp/documents/**',
    '/erp/notifications-center',
    '/erp/my-profile',
    '/ops/recruiting',
  ],

  // ─── CONTABILIDAD ─────────────────────────────────────────────────────
  [ROLES.CONTABILIDAD]: [
    '/erp',
    '/erp/dashboard',
    '/erp/chat',
    '/erp/reuniones',
    '/erp/accounting',
    '/erp/banking',
    // El detalle de la factura es su trabajo diario; el path desnudo lo impedía.
    '/erp/invoicing/**',
    '/erp/finance/**',
    '/erp/exports',
    // Autoriza gastos y comprobaciones (tier 60, ya contemplado en section-views).
    '/erp/approvals',
    '/erp/kb',
    '/erp/kb/**',
    '/erp/calendar',
    '/erp/documents',
    '/erp/documents/**',
    '/erp/notifications-center',
    '/erp/my-profile',
    // Referencia para facturar: hacía falta poder abrir la cotización, no solo verla listada.
    '/crm/quotes',
    '/crm/quotes/**',
    '/crm/projects/**',
    ...SELF_ATTENDANCE_PATHS,
  ],

  // ─── CLIENTE EXTERNO — portal + Integra (solo módulos de su company) ──
  [ROLES.CLIENTE]: [
    '/tickets',
    '/tickets/**',
    '/integra',
    '/integra/video',
    '/integra/access',
    '/integra/people',
    '/integra/events',
    '/integra/alarms',
    '/integra/visitors',
    '/integra/vehicles',
    '/integra/anpr',
    '/integra/map',
    '/integra/my-profile',
    '/integra/notifications-center',
    // sin /integra/settings ni /integra/audit — sitios/bitácora los administra NEXARA
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
