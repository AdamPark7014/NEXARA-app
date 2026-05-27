/**
 * NEXARA · RBAC v2 (frontend) — Matriz URL ligera.
 *
 * Sólo necesitamos checar páginas, no endpoints (la API ya tiene su guard).
 * Esto es lo que consulta `middleware.ts` para gate de rutas.
 */
import { ROLES, type RoleKey } from './roles';

export type PageRule = string; // path con comodines: /core/**, /sales/cotizaciones/*, /core/users/:id

/**
 * Páginas permitidas por rol. Cualquier ruta NO listada está bloqueada.
 * (Las rutas /api/** las controla el backend.)
 */
export const PAGE_MATRIX: Record<RoleKey, PageRule[]> = {
  [ROLES.SUPER_ADMIN]: ['/**'],

  [ROLES.CEO]: [
    '/core/**',
    '/sales/**',
    '/ops/**',
    '/studio/**',
  ],

  [ROLES.DIR_OPERACIONES]: [
    '/core/dashboard',
    '/core/aprobaciones/**',
    '/core/proyectos/**',
    '/core/cotizaciones/**',
    '/core/viaticos/**',
    '/core/actividades/**',
    '/core/mantenimiento/**',
    '/core/inventario/**',
    '/core/sla/**',
    '/core/reportes/**',
    '/core/clientes/**',
    '/ops/**',
    '/sales/dashboard',
    '/sales/cotizaciones/**',
  ],

  [ROLES.DIR_ADMIN]: [
    '/core/**',
  ],

  [ROLES.COORD_ADMIN]: [
    '/core/dashboard',
    '/core/aprobaciones/**',
    '/core/contabilidad/**',
    '/core/facturacion/**',
    '/core/compras/**',
    '/core/viaticos/**',
    '/core/inventario/**',
    '/core/almacen/**',
    '/core/actividades/**',
    '/core/clientes/**',
    '/core/documentos/**',
    '/core/usuarios',
    '/core/reportes/**',
  ],

  [ROLES.ADMINISTRATIVO]: [
    '/core/dashboard',
    '/core/actividades/**',
    '/core/viaticos/**',
    '/core/documentos/**',
    '/core/clientes/**',
    '/core/cotizaciones',
    '/core/inventario',
    '/core/contabilidad',
    '/core/aprobaciones/mias',
    '/core/mi-perfil',
  ],

  [ROLES.COORD_OPERACIONES]: [
    '/ops/dashboard',
    '/ops/actividades/**',
    '/ops/proyectos/**',
    '/ops/agenda/**',
    '/ops/equipos/**',
    '/ops/mantenimiento/**',
    '/ops/sla/**',
    '/ops/vehiculos/**',
    '/ops/gps/**',
    '/core/cotizaciones',
    '/core/dashboard',
  ],

  [ROLES.ING_CAMPO]: [
    '/ops/mi-agenda',
    '/ops/mis-actividades/**',
    '/ops/mis-viaticos/**',
    '/ops/asistencia/**',
    '/ops/mis-vehiculos',
    '/ops/mi-perfil',
  ],

  [ROLES.ING_SOPORTE]: [
    '/ops/soporte/**',
    '/ops/noc/**',
    '/ops/mantenimiento/**',
    '/ops/sla/**',
    '/ops/equipos/**',
    '/ops/clientes-servicio/**',
    '/ops/kb/**',
  ],

  [ROLES.COORD_VENTAS]: [
    '/sales/**',
    '/core/dashboard',
  ],

  [ROLES.VENDEDOR]: [
    '/sales/dashboard',
    '/sales/mis-leads/**',
    '/sales/mis-clientes/**',
    '/sales/oportunidades/**',
    '/sales/cotizaciones/**',
    '/sales/agenda',
    '/sales/catalogo',
    '/sales/mi-cuota',
    '/sales/mi-perfil',
  ],

  [ROLES.LIDER_DISENO]: [
    '/studio/**',
    '/core/dashboard',
  ],

  [ROLES.DISENADOR]: [
    '/studio/dashboard',
    '/studio/sitio/**',
    '/studio/proyectos/**',
    '/studio/galeria/**',
    '/studio/noticias/**',
    '/studio/redes/**',
    '/studio/mi-perfil',
  ],

  [ROLES.RH]: [
    '/core/dashboard',
    '/core/rh/**',
    '/core/empleados/**',
    '/core/asistencia/**',
    '/core/cvs/**',
    '/core/nomina/**',
    '/core/vacaciones/**',
    '/core/sanciones/**',
    '/core/lunch-breaks/**',
  ],

  [ROLES.CONTABILIDAD]: [
    '/core/dashboard',
    '/core/contabilidad/**',
    '/core/facturacion/**',
    '/core/banca/**',
    '/core/gastos/**',
    '/core/cotizaciones',
    '/core/reportes/**',
  ],

  [ROLES.CLIENTE]: [
    '/portal/**',
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

/** Verifica si un rol puede ABRIR una página concreta. */
export function canOpenPage(role: RoleKey, pathname: string): boolean {
  if (role === ROLES.SUPER_ADMIN) return true;
  const clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  const rules = PAGE_MATRIX[role] ?? [];
  return rules.some(p => rx(p).test(clean));
}

/** Lista plana de prefijos permitidos (para sidebar). */
export function allowedPrefixes(role: RoleKey): string[] {
  return PAGE_MATRIX[role] ?? [];
}
