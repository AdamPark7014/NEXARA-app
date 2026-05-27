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
 */
import { ROLES, type RoleKey } from './roles.v2';

export type Scope = 'read' | 'write' | 'approve' | 'admin';

export type UrlRule = {
  /** Prefijo de ruta o patrón. Ej: "/api/activities", "/console/users", "/console/users/:id" */
  path: string;
  /** Métodos HTTP permitidos. Omitir = todos. */
  methods?: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
  /** Scope semántico (informativo + para UI). */
  scope?: Scope;
};

/**
 * Matriz Rol → reglas de URL.
 *
 * Convención de paths:
 *   - "/api/..."    → backend
 *   - "/core/..."   → ERP (subdomain console)
 *   - "/sales/..."  → CRM (subdomain ventas)
 *   - "/ops/..."    → Operación (subdomain operacion)
 *   - "/studio/..." → Web/Marketing (subdomain web)
 *   - "/portal/..." → Cliente externo (subdomain tickets)
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
    { path: '/core/**', scope: 'read' },
    { path: '/sales/**', scope: 'read' },
    { path: '/ops/**', scope: 'read' },
    { path: '/studio/**', scope: 'read' },
    { path: '/api/**', methods: ['GET'], scope: 'read' },
    // Aprobaciones tope
    { path: '/core/aprobaciones/**', scope: 'approve' },
    { path: '/api/workflow/approve/**', methods: ['POST'], scope: 'approve' },
    // Ejecutivo
    { path: '/core/dashboard', scope: 'read' },
    { path: '/core/executive/**', scope: 'read' },
    { path: '/api/executive/**', scope: 'read' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // DIRECTOR DE OPERACIONES — aprueba viáticos/proyectos nivel alto
  // ─────────────────────────────────────────────────────────────────
  [ROLES.DIR_OPERACIONES]: [
    { path: '/core/dashboard', scope: 'read' },
    { path: '/core/aprobaciones/**', scope: 'approve' },
    { path: '/core/proyectos/**', scope: 'write' },
    { path: '/core/clientes/**', scope: 'write' },
    { path: '/core/cotizaciones/**', scope: 'approve' },
    { path: '/core/viaticos/**', scope: 'approve' },
    { path: '/core/actividades/**', scope: 'read' },
    { path: '/core/mantenimiento/**', scope: 'write' },
    { path: '/core/inventario/**', scope: 'read' },
    { path: '/core/sla/**', scope: 'read' },
    { path: '/core/reportes/**', scope: 'read' },
    { path: '/ops/**', scope: 'read' },
    { path: '/sales/dashboard', scope: 'read' },
    { path: '/sales/cotizaciones/**', scope: 'approve' },
    { path: '/api/**', methods: ['GET'], scope: 'read' },
    { path: '/api/workflow/**', scope: 'approve' },
    { path: '/api/projects/**', scope: 'write' },
    { path: '/api/viaticos/**', scope: 'approve' },
    { path: '/api/viatics/**', scope: 'approve' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // DIRECTOR ADMINISTRATIVO — finanzas, compras, RH (alto nivel)
  // ─────────────────────────────────────────────────────────────────
  [ROLES.DIR_ADMIN]: [
    { path: '/core/dashboard', scope: 'read' },
    { path: '/core/aprobaciones/**', scope: 'approve' },
    { path: '/core/contabilidad/**', scope: 'approve' },
    { path: '/core/facturacion/**', scope: 'approve' },
    { path: '/core/banca/**', scope: 'approve' },
    { path: '/core/compras/**', scope: 'approve' },
    { path: '/core/rh/**', scope: 'approve' },
    { path: '/core/usuarios/**', scope: 'admin' },
    { path: '/core/roles/**', scope: 'admin' },
    { path: '/core/auditoria/**', scope: 'read' },
    { path: '/core/reportes/**', scope: 'read' },
    { path: '/core/configuracion/**', scope: 'write' },
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
    { path: '/core/dashboard', scope: 'read' },
    { path: '/core/aprobaciones/**', scope: 'approve' },
    { path: '/core/contabilidad/**', scope: 'write' },
    { path: '/core/facturacion/**', scope: 'write' },
    { path: '/core/compras/**', scope: 'approve' },
    { path: '/core/viaticos/**', scope: 'approve' },
    { path: '/core/inventario/**', scope: 'write' },
    { path: '/core/almacen/**', scope: 'write' },
    { path: '/core/actividades/**', scope: 'read' },
    { path: '/core/clientes/**', scope: 'write' },
    { path: '/core/documentos/**', scope: 'write' },
    { path: '/core/usuarios', methods: ['GET'], scope: 'read' },
    { path: '/api/accounting/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/procurement/**', scope: 'approve' },
    { path: '/api/viaticos/**', scope: 'approve' },
    { path: '/api/viatics/**', scope: 'approve' },
    { path: '/api/expenses/**', scope: 'write' },
    { path: '/api/clients/**', scope: 'write' },
    { path: '/api/inventories/**', scope: 'write' },
    { path: '/api/warehouse/**', scope: 'write' },
    { path: '/api/documents/**', scope: 'write' },
    { path: '/api/workflow/**', scope: 'approve' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // ADMINISTRATIVO — primer nivel (operación día a día)
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ADMINISTRATIVO]: [
    { path: '/core/dashboard', scope: 'read' },
    { path: '/core/actividades/**', scope: 'write' },           // documenta evidencias
    { path: '/core/viaticos/**', scope: 'write' },              // primer revisión
    { path: '/core/documentos/**', scope: 'write' },
    { path: '/core/clientes/**', scope: 'write' },
    { path: '/core/cotizaciones/**', methods: ['GET'], scope: 'read' },
    { path: '/core/inventario/**', methods: ['GET'], scope: 'read' },
    { path: '/core/almacen/**', methods: ['GET'], scope: 'read' },
    { path: '/core/contabilidad/**', methods: ['GET'], scope: 'read' },
    { path: '/core/aprobaciones/mias', scope: 'write' },        // sus aprobaciones
    { path: '/core/mi-perfil', scope: 'write' },
    { path: '/api/activities/**', scope: 'write' },
    { path: '/api/activity-evidence/**', scope: 'write' },
    { path: '/api/viaticos/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/viatics/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/documents/**', scope: 'write' },
    { path: '/api/clients/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // COORD OPERACIONES — supervisa ing. de campo, project manager
  // ─────────────────────────────────────────────────────────────────
  [ROLES.COORD_OPERACIONES]: [
    { path: '/ops/dashboard', scope: 'read' },
    { path: '/ops/actividades/**', scope: 'approve' },         // aprueba evidencias
    { path: '/ops/proyectos/**', scope: 'write' },
    { path: '/ops/agenda/**', scope: 'write' },
    { path: '/ops/equipos/**', scope: 'write' },
    { path: '/ops/mantenimiento/**', scope: 'write' },
    { path: '/ops/sla/**', scope: 'read' },
    { path: '/ops/vehiculos/**', scope: 'approve' },
    { path: '/ops/gps/**', scope: 'read' },
    { path: '/core/cotizaciones/**', methods: ['GET'], scope: 'read' },
    { path: '/api/activities/**', scope: 'approve' },
    { path: '/api/projects/**', scope: 'write' },
    { path: '/api/maintenance/**', scope: 'write' },
    { path: '/api/vehicles/**', scope: 'approve' },
    { path: '/api/gps/**', scope: 'read' },
    { path: '/api/service-sheets/**', scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // INGENIERO DE CAMPO — solo lo suyo
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ING_CAMPO]: [
    { path: '/ops/mi-agenda', scope: 'read' },
    { path: '/ops/mis-actividades/**', scope: 'write' },
    { path: '/ops/actividades/:id/evidencia', scope: 'write' },
    { path: '/ops/mis-viaticos/**', scope: 'write' },
    { path: '/ops/asistencia/checkin', scope: 'write' },
    { path: '/ops/mis-vehiculos', scope: 'read' },
    { path: '/ops/mi-perfil', scope: 'write' },
    { path: '/api/activities/mias/**', scope: 'write' },
    { path: '/api/activity-evidence/**', methods: ['POST', 'PATCH', 'GET'], scope: 'write' },
    { path: '/api/viaticos/mios/**', scope: 'write' },
    { path: '/api/viatics/mios/**', scope: 'write' },
    { path: '/api/attendance/checkin', methods: ['POST'], scope: 'write' },
    { path: '/api/gps/heartbeat', methods: ['POST'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // INGENIERO DE SOPORTE — tickets, NOC, mantenimiento
  // ─────────────────────────────────────────────────────────────────
  [ROLES.ING_SOPORTE]: [
    { path: '/ops/soporte/**', scope: 'write' },
    { path: '/ops/noc/**', scope: 'write' },
    { path: '/ops/mantenimiento/**', scope: 'write' },
    { path: '/ops/sla/**', scope: 'read' },
    { path: '/ops/equipos/**', scope: 'read' },
    { path: '/ops/clientes-servicio/**', scope: 'read' },
    { path: '/ops/kb/**', scope: 'write' },
    { path: '/api/client-ticket-requests/**', scope: 'write' },
    { path: '/api/sla-tracker/**', scope: 'write' },
    { path: '/api/maintenance/**', scope: 'write' },
    { path: '/api/maintenance-contracts/**', scope: 'read' },
    { path: '/api/devices/**', scope: 'read' },
    { path: '/api/noc/**', scope: 'write' },
    { path: '/api/kb/**', scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // COORD VENTAS — gerente comercial
  // ─────────────────────────────────────────────────────────────────
  [ROLES.COORD_VENTAS]: [
    { path: '/sales/**', scope: 'approve' },
    { path: '/sales/dashboard', scope: 'read' },
    { path: '/sales/leads/**', scope: 'write' },
    { path: '/sales/oportunidades/**', scope: 'approve' },
    { path: '/sales/clientes/**', scope: 'write' },
    { path: '/sales/cotizaciones/**', scope: 'approve' },
    { path: '/sales/licitaciones/**', scope: 'write' },
    { path: '/sales/reportes/**', scope: 'read' },
    { path: '/sales/cuotas/**', scope: 'write' },
    { path: '/sales/equipo/**', scope: 'admin' },
    { path: '/core/dashboard', scope: 'read' },
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
    { path: '/sales/dashboard', scope: 'read' },
    { path: '/sales/mis-leads/**', scope: 'write' },
    { path: '/sales/mis-clientes/**', scope: 'write' },
    { path: '/sales/oportunidades/**', scope: 'write' },
    { path: '/sales/cotizaciones/**', scope: 'write' },
    { path: '/sales/agenda', scope: 'write' },
    { path: '/sales/catalogo', scope: 'read' },
    { path: '/sales/mi-cuota', scope: 'read' },
    { path: '/sales/mi-perfil', scope: 'write' },
    { path: '/api/ventas/leads/mios', scope: 'write' },
    { path: '/api/cotizaciones/mias/**', scope: 'write' },
    { path: '/api/crm-activities/mias/**', scope: 'write' },
    { path: '/api/clients/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/catalog/**', methods: ['GET'], scope: 'read' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // LÍDER DISEÑO — Studio completo
  // ─────────────────────────────────────────────────────────────────
  [ROLES.LIDER_DISENO]: [
    { path: '/studio/**', scope: 'admin' },
    { path: '/studio/sitio/**', scope: 'admin' },                // CMS de las 5 secciones públicas
    { path: '/studio/proyectos/**', scope: 'write' },
    { path: '/studio/galeria/**', scope: 'admin' },
    { path: '/studio/noticias/**', scope: 'write' },
    { path: '/studio/redes/**', scope: 'write' },
    { path: '/studio/contactos/**', scope: 'read' },
    { path: '/studio/equipo/**', scope: 'admin' },
    { path: '/core/dashboard', scope: 'read' },
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
    { path: '/studio/dashboard', scope: 'read' },
    { path: '/studio/sitio/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/proyectos/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/galeria/**', scope: 'write' },
    { path: '/studio/noticias/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/redes/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/studio/mi-perfil', scope: 'write' },
    { path: '/api/projects/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
    { path: '/api/news/**', methods: ['GET', 'POST', 'PATCH'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // RH
  // ─────────────────────────────────────────────────────────────────
  [ROLES.RH]: [
    { path: '/core/dashboard', scope: 'read' },
    { path: '/core/rh/**', scope: 'write' },
    { path: '/core/empleados/**', scope: 'write' },
    { path: '/core/asistencia/**', scope: 'write' },
    { path: '/core/cvs/**', scope: 'write' },                   // gestión CVs
    { path: '/core/nomina/**', scope: 'write' },
    { path: '/core/vacaciones/**', scope: 'approve' },
    { path: '/core/sanciones/**', scope: 'write' },
    { path: '/core/lunch-breaks/**', scope: 'write' },
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
    { path: '/core/dashboard', scope: 'read' },
    { path: '/core/contabilidad/**', scope: 'write' },
    { path: '/core/facturacion/**', scope: 'write' },
    { path: '/core/banca/**', scope: 'write' },
    { path: '/core/gastos/**', scope: 'write' },
    { path: '/core/cotizaciones/**', methods: ['GET'], scope: 'read' },
    { path: '/core/reportes/**', scope: 'read' },
    { path: '/api/accounting/**', scope: 'write' },
    { path: '/api/expenses/**', scope: 'write' },
    { path: '/api/employee-payments/**', methods: ['GET', 'POST'], scope: 'write' },
  ],

  // ─────────────────────────────────────────────────────────────────
  // CLIENTE EXTERNO — portal
  // ─────────────────────────────────────────────────────────────────
  [ROLES.CLIENTE]: [
    { path: '/portal/**', scope: 'read' },
    { path: '/portal/mis-tickets/**', scope: 'write' },
    { path: '/portal/nuevo-ticket', scope: 'write' },
    { path: '/portal/mis-servicios', scope: 'read' },
    { path: '/portal/mis-sucursales', scope: 'read' },
    { path: '/portal/mi-perfil', scope: 'write' },
    { path: '/api/client-portal/**', scope: 'write' },
    { path: '/api/client-ticket-requests/**', scope: 'write' },
    { path: '/api/branch-portal/**', scope: 'read' },
  ],
};

/* ──────────────────────────────────────────────────────────────────
 *  Matcher
 * ────────────────────────────────────────────────────────────────── */

function compilePattern(path: string): RegExp {
  // "/api/users/:id" → /^\/api\/users\/[^/]+$/
  // "/sales/**"      → /^\/sales\/.*$/
  // "/core/*"        → /^\/core\/[^/]+$/
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

  // Normaliza: quita query y trailing slash
  const path = url.split('?')[0].replace(/\/+$/, '') || '/';

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
