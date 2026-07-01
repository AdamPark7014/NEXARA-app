/**
 * NEXARA · RBAC v2 — Matriz de URLs por Rol
 * ------------------------------------------
 * Define EXPLÍCITAMENTE qué URLs (rutas web y endpoints API) puede tocar
 * cada rol. Es una whitelist por prefijo + patrón regex.
 *
 *   ✅ Whitelist por defecto (todo lo no listado se NIEGA).
 *   ✅ Un mismo path se puede declarar con scopes: read / write / approve.
 *   ✅ Soporta comodines: ":id", "*", "**".
 *
 * Esta es la única fuente que consulta:
 *   - `UrlAccessGuard` (backend) — para endpoints API
 *   - `middleware.ts` (Next.js)  — para páginas web
 *   - `useCanAccess()` (frontend) — para esconder botones/secciones en UI
 *
 * Convención de paths (canónica, alineada con `apps/web/app/(panels)/*`):
 *   /erp/...     → ERP (CEO, directores, admin, RH, contabilidad)
 *   /crm/...     → CRM (vendedores, coord. ventas)
 *   /ops/...     → Operación (ingenieros campo, soporte, NOC)
 *   /studio/...  → Web/Marketing (diseñadores)
 *   /tickets/... → Cliente externo
 *   /api/...     → Endpoints API (backend)
 *
 * Aliases legacy (`/core`, `/sales`, `/portal`) se normalizan vía
 * `normalizeUrlToCanonical()` para no romper bookmarks viejos.
 */
import { ROLES, type RoleKey } from './roles.v2.js';

export type Scope = 'read' | 'write' | 'approve' | 'admin';

export type UrlRule = {
  /** Prefijo de ruta o patrón. Ej: "/api/activities", "/erp/users", "/erp/users/:id" */
  path: string;
  /** Métodos HTTP permitidos. Omitir = todos. */
  methods?: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
  /** Scope semántico (informativo + para UI). */
  scope?: Scope;
};

/**
 * Matriz Rol → reglas de URL.
 */
export const URL_MATRIX: Record<RoleKey, UrlRule[]> = {
  // ─────────────────────────────────────────────────────────────────
  // SUPER ADMIN — bypass total (la guard cortocircuita antes de leer esto)
  // ─────────────────────────────────────────────────────────────────
  [ROLES.SUPER_ADMIN]: [
    { path: '/**', scope: 'admin' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // CEO — ve TODO (lectura) + aprobaciones de tope
  // ─────────────────────────────────────────────────────────────────
  [ROLES.CEO]: [
    // Rutas específicas primero (first-match-wins)
    { path: '/erp/approvals/**', scope: 'approve' },
    { path: '/api/workflow/**', methods: ['POST'], scope: 'approve' },
    { path: '/api/executive/**', scope: 'read' },
    // Wildcards amplios al final
    { path: '/erp/**', scope: 'read' },
    { path: '/crm/**', scope: 'read' },
    { path: '/ops/**', scope: 'read' },
    { path: '/studio/**', scope: 'read' },
    { path: '/api/**', methods: ['GET'], scope: 'read' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // ARQUITECTO / DIRECTOR TÉCNICO — Josué
  // Supervisa OPS, valida trabajos antes de reportar a Admin + Dirección
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ARQUITECTO]: [
    // OPS — lectura total + aprobación de actividades y evidencias
    { path: '/ops/**',                      scope: 'approve' },
    { path: '/api/activities/**',           scope: 'approve' },
    { path: '/api/activity-evidence/**',    scope: 'approve' },
    { path: '/api/evidences/**',            scope: 'approve' },
    { path: '/api/projects/**',             scope: 'write'   },
    { path: '/api/service-sheets/**',       scope: 'write'   },
    { path: '/api/maintenance/**',          scope: 'write'   },
    { path: '/api/maintenance-contracts/**', scope: 'write'   },
    { path: '/api/gps/**',    methods: ['GET'], scope: 'read' },
    { path: '/api/vehicles/**', methods: ['GET'], scope: 'read' },
    // ERP parcial — ve lo operacional, no finanzas ni usuarios
    { path: '/erp',                         scope: 'read' },
    { path: '/erp/dashboard',               scope: 'read' },
    { path: '/erp/architecture',            scope: 'write' },
    { path: '/erp/calendar',                scope: 'read'  },
    { path: '/erp/documents/**',            scope: 'read'  },
    { path: '/erp/notifications-center',    scope: 'read'  },
    { path: '/erp/my-profile',              scope: 'write' },
    { path: '/erp/kb/**',                   scope: 'read'  },
    // CRM parcial — ve proyectos y cotizaciones (aprueba técnicamente)
    { path: '/crm/projects/**',             scope: 'write' },
    { path: '/crm/quotes',  methods: ['GET'], scope: 'read' },
    // API lectura general para reportes
    { path: '/api/users',   methods: ['GET'], scope: 'read' },
    { path: '/api/clients', methods: ['GET'], scope: 'read' },
    { path: '/api/ventas/proyectos/**', methods: ['GET'], scope: 'read' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // DIRECTOR DE OPERACIONES — aprueba viáticos/proyectos nivel alto
  // ─────────────────────────────────────────────────────────────────
  [ROLES.DIR_OPERACIONES]: [
    { path: '/erp', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/executive', scope: 'read' },
    { path: '/erp/approvals/**', scope: 'approve' },
    { path: '/erp/architecture', scope: 'read' },
    { path: '/erp/companies/**', scope: 'write' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/documents/**', scope: 'read' },
    { path: '/erp/finance/**', scope: 'approve' },
    { path: '/erp/procurement/**', scope: 'approve' },
    { path: '/erp/warehouse/**', scope: 'read' },
    { path: '/erp/analytics/**', scope: 'read' },
    { path: '/erp/exports', scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/ops/**', scope: 'read' },
    { path: '/crm/dashboard', scope: 'read' },
    { path: '/crm/quotes/**', scope: 'approve' },
    { path: '/crm/projects/**', scope: 'read' },
    { path: '/crm/tenders/**', scope: 'read' },
    { path: '/crm/pipeline', scope: 'read' },
    { path: '/crm/reports', scope: 'read' },
    { path: '/api/**', methods: ['GET'], scope: 'read' },
    { path: '/api/workflow/**', scope: 'approve' },
    { path: '/api/projects/**', scope: 'write' },
    { path: '/api/viaticos/**', scope: 'approve' },
    { path: '/api/viatics/**', scope: 'approve' },
    { path: '/api/cotizaciones/**', scope: 'approve' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // DIRECTOR ADMINISTRATIVO — finanzas, compras, RH (alto nivel)
  // ─────────────────────────────────────────────────────────────────
  [ROLES.DIR_ADMIN]: [
    { path: '/erp/**', scope: 'admin' },
    { path: '/crm/dashboard', scope: 'read' },
    { path: '/crm/quotes/**', scope: 'approve' },
    { path: '/crm/reports', scope: 'read' },
    { path: '/api/**', methods: ['GET'], scope: 'read' },
    { path: '/api/accounting/**', scope: 'approve' },
    { path: '/api/procurement/**', scope: 'approve' },
    { path: '/api/hr/**', scope: 'approve' },
    { path: '/api/users/**', scope: 'admin' },
    { path: '/api/workflow/**', scope: 'approve' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // COORD ADMINISTRATIVO — segundo nivel de aprobación
  // ─────────────────────────────────────────────────────────────────
  [ROLES.COORD_ADMIN]: [
    { path: '/erp', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/approvals/**', scope: 'approve' },
    { path: '/erp/companies/**', scope: 'write' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/documents/**', scope: 'write' },
    { path: '/erp/accounting/**', scope: 'write' },
    { path: '/erp/banking/**', scope: 'write' },
    { path: '/erp/invoicing/**', scope: 'write' },
    { path: '/erp/finance/**', scope: 'approve' },
    { path: '/erp/procurement/**', scope: 'approve' },
    { path: '/erp/warehouse/**', scope: 'write' },
    { path: '/erp/users', methods: ['GET'], scope: 'read' },
    { path: '/erp/exports', scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/erp/news', scope: 'read' },
    { path: '/api/users', methods: ['GET'], scope: 'read' },
    { path: '/api/users/profile/**', scope: 'write' },
    { path: '/api/company/**', scope: 'write' },
    { path: '/api/accounting/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/procurement/**', scope: 'approve' },
    { path: '/api/viaticos/**', scope: 'approve' },
    { path: '/api/viatics/**', scope: 'approve' },
    { path: '/api/expenses/**', scope: 'write' },
    { path: '/api/clients/**', scope: 'write' },
    { path: '/api/inventories/**', scope: 'write' },
    { path: '/api/warehouse/**', scope: 'write' },
    { path: '/api/stock/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/catalog/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/documents/**', scope: 'write' },
    { path: '/api/workflow/**', scope: 'approve' },
    { path: '/crm/dashboard', scope: 'read' },
    { path: '/crm/leads/**', scope: 'write' },
    { path: '/crm/clients/**', scope: 'write' },
    { path: '/crm/opportunities/**', scope: 'write' },
    { path: '/crm/quotes/**', scope: 'write' },
    { path: '/crm/pipeline', scope: 'read' },
    { path: '/crm/products/**', scope: 'write' },
    { path: '/ops/tools/**', scope: 'read' },
    { path: '/api/tool-requests/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/ventas/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/cotizaciones/**', methods: ['GET', 'POST', 'PATCH', 'PUT'], scope: 'write' },
    { path: '/api/accounting/invoices/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // ADMINISTRATIVO — primer nivel (operación día a día)
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ADMINISTRATIVO]: [
    { path: '/erp', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/approvals', methods: ['GET'], scope: 'read' },
    { path: '/erp/companies/**', scope: 'write' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/documents/**', scope: 'write' },
    { path: '/erp/finance/viatics/**', scope: 'write' },
    { path: '/erp/finance/expenses/**', scope: 'write' },
    { path: '/erp/hr/attendance', scope: 'write' },
    { path: '/erp/hr/lunch-breaks', scope: 'write' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/erp/news', scope: 'read' },
    { path: '/api/attendance/**', methods: ['GET', 'POST'], scope: 'write' },
    { path: '/api/lunch-breaks/**', methods: ['GET', 'POST', 'PUT'], scope: 'write' },
    { path: '/api/expenses/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/workflow/**', methods: ['GET', 'POST'], scope: 'read' },
    { path: '/api/viaticos/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/viatics/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/documents/**', scope: 'write' },
    { path: '/api/clients/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // COORD OPERACIONES — supervisa ing. de campo, project manager
  // ─────────────────────────────────────────────────────────────────
  [ROLES.COORD_OPERACIONES]: [
    { path: '/ops', scope: 'read' },
    { path: '/ops/dashboard', scope: 'read' },
    { path: '/ops/activities/**', scope: 'approve' },
    { path: '/ops/evidences/**', scope: 'approve' },
    { path: '/ops/projects/**', scope: 'write' },
    { path: '/ops/vehicles/**', scope: 'approve' },
    { path: '/ops/maintenance/**', scope: 'write' },
    { path: '/ops/support/**', scope: 'write' },
    { path: '/ops/noc/**', scope: 'read' },
    { path: '/ops/gps/**', scope: 'read' },
    { path: '/ops/assets/**', scope: 'write' },
    { path: '/ops/service-clients/**', scope: 'write' },
    { path: '/ops/tools/**', scope: 'read' },
    { path: '/ops/recruiting/**', scope: 'read' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/crm/quotes', methods: ['GET'], scope: 'read' },
    { path: '/api/activities/**', scope: 'approve' },
    { path: '/api/evidences/**', scope: 'approve' },
    { path: '/api/projects/**', scope: 'write' },
    { path: '/api/maintenance/**', scope: 'write' },
    { path: '/api/maintenance-contracts/**', scope: 'write' },
    { path: '/api/vehicles/**', scope: 'approve' },
    { path: '/api/gps/**', scope: 'read' },
    { path: '/api/service-sheets/**', scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // INGENIERO DE CAMPO — solo lo suyo
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ING_CAMPO]: [
    // Páginas frontend
    { path: '/ops', scope: 'read' },
    { path: '/ops/dashboard', scope: 'read' },
    { path: '/ops/activities/**', scope: 'read' },
    { path: '/ops/evidences/**', scope: 'write' },
    { path: '/ops/viatics/**', scope: 'write' },
    { path: '/ops/vehicles', scope: 'read' },
    { path: '/ops/tools', scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/erp/hr/attendance', scope: 'write' },
    { path: '/erp/hr/lunch-breaks', scope: 'write' },
    { path: '/api/activities/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/activity-evidence/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/evidences/**', methods: ['GET', 'POST', 'PATCH', 'DELETE'], scope: 'write' },
    { path: '/api/viaticos/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/viatics/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/attendance/**', methods: ['GET', 'POST'], scope: 'write' },
    { path: '/api/lunch-breaks/**', methods: ['GET', 'POST', 'PUT'], scope: 'write' },
    { path: '/api/gps/heartbeat', methods: ['POST'], scope: 'write' },
    { path: '/api/vehicles/**', methods: ['GET'], scope: 'read' },
    { path: '/api/tool-requests/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/service-sheets/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // INGENIERO DE SOPORTE — tickets, NOC, mantenimiento
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ING_SOPORTE]: [
    { path: '/ops', scope: 'read' },
    { path: '/ops/dashboard', scope: 'read' },
    { path: '/ops/support/**', scope: 'write' },
    { path: '/ops/noc/**', scope: 'write' },
    { path: '/ops/maintenance/**', scope: 'write' },
    { path: '/ops/assets/**', scope: 'read' },
    { path: '/ops/service-clients/**', scope: 'read' },
    { path: '/ops/activities/**', scope: 'read' },
    { path: '/ops/evidences/**', scope: 'read' },
    { path: '/ops/my-viatics/**', scope: 'write' },
    { path: '/ops/tools/**', scope: 'read' },
    { path: '/erp/hr/attendance', scope: 'write' },
    { path: '/erp/kb/**', scope: 'write' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/api/activities/**', scope: 'write' },
    { path: '/api/activities', scope: 'write' },
    { path: '/api/activity-evidence/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/evidences/**', methods: ['GET', 'POST', 'PATCH', 'DELETE'], scope: 'write' },
    { path: '/api/client-ticket-requests/**', scope: 'write' },
    { path: '/api/sla/**', scope: 'read' },
    { path: '/api/sla-tracker/**', scope: 'write' },
    { path: '/api/maintenance/**', scope: 'write' },
    { path: '/api/maintenance-contracts/**', scope: 'read' },
    { path: '/api/devices/**', scope: 'read' },
    { path: '/api/noc/**', scope: 'write' },
    { path: '/api/inventories/**', methods: ['GET', 'POST', 'PATCH'], scope: 'read' },
    { path: '/api/service-clients/**', methods: ['GET', 'POST', 'PUT', 'PATCH'], scope: 'write' },
    { path: '/api/assets/**', scope: 'read' },
    { path: '/api/tool-requests/**', methods: ['GET'], scope: 'read' },
    { path: '/api/kb/**', scope: 'write' },
    { path: '/api/attendance/**', methods: ['GET', 'POST'], scope: 'write' },
    { path: '/api/gps/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/viaticos/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/viatics/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // COORD VENTAS — gerente comercial
  // ─────────────────────────────────────────────────────────────────
  [ROLES.COORD_VENTAS]: [
    { path: '/crm/**', scope: 'approve' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/api/ventas/**', scope: 'approve' },
    { path: '/api/cotizaciones/**', scope: 'approve' },
    { path: '/api/tenders/**', scope: 'write' },
    { path: '/api/sales-targets/**', scope: 'write' },
    { path: '/api/clients/**', scope: 'write' },
    { path: '/api/crm-activities/**', scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // VENDEDOR — CRM (sus leads, clientes, cotizaciones)
  // ─────────────────────────────────────────────────────────────────
  [ROLES.VENDEDOR]: [
    { path: '/crm', scope: 'read' },
    { path: '/crm/dashboard', scope: 'read' },
    { path: '/crm/leads/**', scope: 'write' },
    { path: '/crm/clients/**', scope: 'write' },
    { path: '/crm/opportunities/**', scope: 'write' },
    { path: '/crm/quotes/**', scope: 'write' },
    { path: '/crm/templates/**', scope: 'read' },
    { path: '/crm/agenda', scope: 'write' },
    { path: '/crm/products', scope: 'read' },
    { path: '/crm/targets', scope: 'read' },
    { path: '/crm/pipeline', scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/api/ventas/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/cotizaciones/**', methods: ['GET', 'POST', 'PATCH', 'PUT'], scope: 'write' },
    { path: '/api/clients/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/catalog/**', methods: ['GET'], scope: 'read' },
    { path: '/api/crm-activities/**', methods: ['GET', 'POST', 'PATCH', 'DELETE'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // LÍDER DISEÑO — Studio completo
  // ─────────────────────────────────────────────────────────────────
  [ROLES.LIDER_DISENO]: [
    { path: '/studio/**', scope: 'admin' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/api/projects/**', scope: 'write' },
    { path: '/api/news/**', scope: 'write' },
    { path: '/api/newsletter/**', scope: 'write' },
    { path: '/api/contact-messages/**', scope: 'read' },
    { path: '/api/company/**', scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // DISEÑADOR — solo sus tareas en Studio
  // ─────────────────────────────────────────────────────────────────
  [ROLES.DISENADOR]: [
    { path: '/studio', scope: 'read' },
    { path: '/studio/dashboard', scope: 'read' },
    { path: '/studio/pages/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/news/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/social/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/cases/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/contacts', methods: ['GET'], scope: 'read' },
    { path: '/studio/leads', methods: ['GET'], scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/api/projects/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/news/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // RH
  // ─────────────────────────────────────────────────────────────────
  [ROLES.RH]: [
    { path: '/erp', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/hr/**', scope: 'write' },
    { path: '/erp/finance/employee-payments/**', scope: 'write' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/documents/**', scope: 'write' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/ops/recruiting/**', scope: 'write' },
    { path: '/api/hr/**', scope: 'write' },
    { path: '/api/employee-payments/**', scope: 'write' },
    { path: '/api/attendance/**', scope: 'write' },
    { path: '/api/cvs/**', scope: 'write' },
    { path: '/api/fines/**', scope: 'write' },
    { path: '/api/lunch-breaks/**', scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // CONTABILIDAD
  // ─────────────────────────────────────────────────────────────────
  [ROLES.CONTABILIDAD]: [
    { path: '/erp', scope: 'read' },
    { path: '/erp/dashboard', scope: 'read' },
    { path: '/erp/accounting/**', scope: 'write' },
    { path: '/erp/banking/**', scope: 'write' },
    { path: '/erp/invoicing/**', scope: 'write' },
    { path: '/erp/finance/**', scope: 'write' },
    { path: '/erp/exports', scope: 'read' },
    { path: '/erp/calendar', scope: 'read' },
    { path: '/erp/documents/**', scope: 'read' },
    { path: '/erp/notifications-center', scope: 'read' },
    { path: '/erp/my-profile', scope: 'write' },
    { path: '/crm/quotes', methods: ['GET'], scope: 'read' },
    { path: '/crm/projects/**', methods: ['GET'], scope: 'read' },
    { path: '/api/accounting/**', scope: 'write' },
    { path: '/api/ventas/proyectos/**', methods: ['GET'], scope: 'read' },
    { path: '/api/expenses/**', scope: 'write' },
    { path: '/api/employee-payments/**', methods: ['GET', 'POST'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // CLIENTE EXTERNO — portal
  // ─────────────────────────────────────────────────────────────────
  [ROLES.CLIENTE]: [
    { path: '/tickets/**', scope: 'write' },
    { path: '/api/client-portal/**', scope: 'write' },
    { path: '/api/client-ticket-requests/**', scope: 'write' },
    { path: '/api/branch-portal/**', scope: 'read' },
  ],
};

/* ──────────────────────────────────────────────────────────────────
 *  Normalización de paths legacy → canónicos
 * ────────────────────────────────────────────────────────────────── */

const LEGACY_PANEL_PREFIX_MAP: Record<string, string> = {
  '/core': '/erp',
  '/sales': '/crm',
  '/portal': '/tickets',
};

/** Normaliza un pathname/url al prefijo de panel canónico. */
export function normalizeUrlToCanonical(url: string): string {
  const clean = url.split('?')[0].replace(/\/+$/, '') || '/';
  for (const [legacy, canonical] of Object.entries(LEGACY_PANEL_PREFIX_MAP)) {
    if (clean === legacy) return canonical;
    if (clean.startsWith(`${legacy}/`)) return `${canonical}${clean.slice(legacy.length)}`;
  }
  return clean;
}

/* ──────────────────────────────────────────────────────────────────
 *  Matcher
 * ────────────────────────────────────────────────────────────────── */

function compilePattern(path: string): RegExp {
  const escaped = path
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/\*\*/g, '(/.*)?')
    .replace(/\/\*/g, '/[^/]+')
    .replace(/:[a-zA-Z_]+/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

const compiledCache = new Map<string, RegExp>();

function regexFor(path: string): RegExp {
  let r = compiledCache.get(path);
  if (!r) {
    r = compilePattern(path);
    compiledCache.set(path, r);
  }
  return r;
}

/**
 * Verifica si un rol puede acceder a una URL+método.
 *
 * @returns objeto con `allowed`, `scope` y la regla que matcheó (para auditoría).
 */
export function checkUrlAccess(
  role: RoleKey,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
): { allowed: boolean; scope?: Scope; matchedRule?: string } {
  if (role === ROLES.SUPER_ADMIN) return { allowed: true, scope: 'admin' };

  // Normaliza: quita query, trailing slash, y mapea paths legacy → canónicos.
  const path = normalizeUrlToCanonical(url);

  const rules = URL_MATRIX[role] ?? [];
  for (const rule of rules) {
    if (rule.methods && !rule.methods.includes(method)) continue;
    if (regexFor(rule.path).test(path)) {
      return { allowed: true, scope: rule.scope, matchedRule: rule.path };
    }
  }
  return { allowed: false };
}

/** Devuelve todas las URLs permitidas para un rol (útil para introspección/UI). */
export function listAllowedUrls(role: RoleKey): UrlRule[] {
  return URL_MATRIX[role] ?? [];
}
