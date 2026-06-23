/**
 * NEXARA · RBAC v2 — Navegación unificada por rol
 * ------------------------------------------------
 * Reemplaza los sidebars hardcoded por panel:
 *   - console/Sidebar.tsx (37+ items hardcoded)
 *   - ventas/VentasSidebar.tsx (14 items)
 *   - operacion/OperacionSidebar.tsx
 *   - contabilidad/layout.tsx navGroups
 *
 * Cada nav item declara los roles que lo ven.
 * El componente renderer filtra automáticamente por role.
 */
import { ROLES, type PanelKey, type RoleKey } from './roles';

export type NavItem = {
  /** Identificador estable (para keys de React). */
  id: string;
  /** Etiqueta visible. */
  label: string;
  /** Ruta destino (sin prefijo de subdominio — ya estás dentro). */
  href: string;
  /** Lucide icon name (opcional). */
  icon?: string;
  /** Roles que ven este item. */
  roles: RoleKey[];
  /** Item children — submenú colapsible. */
  children?: NavItem[];
  /** Badge dinámico (ej. count de notificaciones). */
  badge?: 'new' | 'beta' | string;
};

export type NavGroup = {
  id: string;
  title: string;
  items: NavItem[];
};

/* ──────────────────────────────────────────────────────────────────
 *  CORE / ERP — admin, CEO, contabilidad, RH, administrativos
 * ────────────────────────────────────────────────────────────────── */
export const CORE_NAV: NavGroup[] = [
  {
    id: 'home',
    title: 'Inicio',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/core/dashboard', icon: 'home',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN,
                ROLES.ADMINISTRATIVO, ROLES.RH, ROLES.CONTABILIDAD] },
      { id: 'executive', label: 'Vista Ejecutiva', href: '/core/executive', icon: 'sparkles',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN] },
      { id: 'aprobaciones', label: 'Mis Aprobaciones', href: '/core/aprobaciones', icon: 'check-circle',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.COORD_OPERACIONES,
                ROLES.COORD_VENTAS, ROLES.ADMINISTRATIVO] },
    ],
  },
  {
    id: 'operativo',
    title: 'Operación',
    items: [
      { id: 'actividades', label: 'Actividades y Evidencias', href: '/core/actividades', icon: 'clipboard-list',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.COORD_ADMIN, ROLES.ADMINISTRATIVO] },
      { id: 'viaticos', label: 'Viáticos', href: '/core/viaticos', icon: 'wallet',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.ADMINISTRATIVO] },
      { id: 'proyectos', label: 'Proyectos', href: '/core/proyectos', icon: 'folder-kanban',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.COORD_ADMIN] },
      { id: 'mantenimiento', label: 'Mantenimientos', href: '/core/mantenimiento', icon: 'wrench',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.COORD_ADMIN] },
      { id: 'sla', label: 'SLA y Soporte', href: '/core/sla', icon: 'gauge',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.COORD_ADMIN] },
    ],
  },
  {
    id: 'comercial',
    title: 'Comercial',
    items: [
      { id: 'clientes', label: 'Clientes', href: '/core/clientes', icon: 'users',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.ADMINISTRATIVO, ROLES.CONTABILIDAD] },
      { id: 'cotizaciones', label: 'Cotizaciones', href: '/core/cotizaciones', icon: 'file-text',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.COORD_ADMIN, ROLES.ADMINISTRATIVO, ROLES.CONTABILIDAD] },
      { id: 'crm-resumen', label: 'CRM (resumen)', href: '/core/crm-resumen', icon: 'trending-up',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN] },
    ],
  },
  {
    id: 'finanzas',
    title: 'Finanzas',
    items: [
      { id: 'contabilidad', label: 'Contabilidad', href: '/core/contabilidad', icon: 'book-open',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.CONTABILIDAD] },
      { id: 'facturacion', label: 'Facturación / CFDI', href: '/core/facturacion', icon: 'receipt',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.CONTABILIDAD] },
      { id: 'banca', label: 'Banca y Conciliación', href: '/core/banca', icon: 'landmark',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.CONTABILIDAD] },
      { id: 'gastos', label: 'Gastos', href: '/core/gastos', icon: 'minus-circle',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.CONTABILIDAD] },
      { id: 'compras', label: 'Compras', href: '/core/compras', icon: 'shopping-cart',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN] },
    ],
  },
  {
    id: 'almacen',
    title: 'Almacén',
    items: [
      { id: 'inventario', label: 'Inventario', href: '/core/inventario', icon: 'package',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES, ROLES.COORD_ADMIN, ROLES.ADMINISTRATIVO] },
      { id: 'almacen', label: 'Almacén / Stock', href: '/core/almacen', icon: 'warehouse',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN] },
      { id: 'catalogo', label: 'Catálogo', href: '/core/catalogo', icon: 'tags',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN] },
    ],
  },
  {
    id: 'rh',
    title: 'Recursos Humanos',
    items: [
      { id: 'empleados', label: 'Empleados', href: '/core/empleados', icon: 'user-cog',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.RH] },
      { id: 'nomina', label: 'Nómina', href: '/core/nomina', icon: 'banknote',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.RH] },
      { id: 'asistencia', label: 'Asistencia', href: '/core/asistencia', icon: 'calendar-check',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.RH] },
      { id: 'cvs', label: 'Reclutamiento (CVs)', href: '/core/cvs', icon: 'file-user',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.RH] },
      { id: 'sanciones', label: 'Sanciones', href: '/core/sanciones', icon: 'alert-triangle',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.RH] },
    ],
  },
  {
    id: 'sistema',
    title: 'Sistema',
    items: [
      { id: 'usuarios', label: 'Usuarios y Roles', href: '/core/usuarios', icon: 'shield',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN] },
      { id: 'configuracion', label: 'Configuración', href: '/core/configuracion', icon: 'settings',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN] },
      { id: 'auditoria', label: 'Auditoría', href: '/core/auditoria', icon: 'history',
        roles: [ROLES.CEO, ROLES.DIR_ADMIN] },
      { id: 'reportes', label: 'Reportes / BI', href: '/core/reportes', icon: 'bar-chart-3',
        roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.CONTABILIDAD] },
    ],
  },
];

/* ──────────────────────────────────────────────────────────────────
 *  SALES / CRM
 * ────────────────────────────────────────────────────────────────── */
export const SALES_NAV: NavGroup[] = [
  {
    id: 'home', title: 'Inicio',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/sales/dashboard', icon: 'home',
        roles: [ROLES.COORD_VENTAS, ROLES.VENDEDOR, ROLES.CEO, ROLES.DIR_OPERACIONES] },
    ],
  },
  {
    id: 'pipeline', title: 'Mi Pipeline',
    items: [
      { id: 'mis-leads', label: 'Mis Leads', href: '/sales/mis-leads', icon: 'target',
        roles: [ROLES.VENDEDOR, ROLES.COORD_VENTAS] },
      { id: 'oportunidades', label: 'Oportunidades', href: '/sales/oportunidades', icon: 'trending-up',
        roles: [ROLES.VENDEDOR, ROLES.COORD_VENTAS, ROLES.CEO, ROLES.DIR_OPERACIONES] },
      { id: 'mis-clientes', label: 'Mis Clientes', href: '/sales/mis-clientes', icon: 'users',
        roles: [ROLES.VENDEDOR, ROLES.COORD_VENTAS] },
      { id: 'cotizaciones', label: 'Cotizaciones', href: '/sales/cotizaciones', icon: 'file-text',
        roles: [ROLES.VENDEDOR, ROLES.COORD_VENTAS, ROLES.CEO, ROLES.DIR_OPERACIONES] },
    ],
  },
  {
    id: 'gestion', title: 'Gestión (equipo)',
    items: [
      { id: 'equipo', label: 'Equipo Comercial', href: '/sales/equipo', icon: 'users-2',
        roles: [ROLES.COORD_VENTAS, ROLES.CEO] },
      { id: 'cuotas', label: 'Cuotas y Comisiones', href: '/sales/cuotas', icon: 'medal',
        roles: [ROLES.COORD_VENTAS, ROLES.CEO] },
      { id: 'licitaciones', label: 'Licitaciones', href: '/sales/licitaciones', icon: 'gavel',
        roles: [ROLES.COORD_VENTAS, ROLES.CEO, ROLES.DIR_OPERACIONES] },
      { id: 'reportes', label: 'Reportes', href: '/sales/reportes', icon: 'bar-chart',
        roles: [ROLES.COORD_VENTAS, ROLES.CEO] },
    ],
  },
  {
    id: 'recursos', title: 'Recursos',
    items: [
      { id: 'catalogo', label: 'Catálogo', href: '/sales/catalogo', icon: 'tags',
        roles: [ROLES.VENDEDOR, ROLES.COORD_VENTAS] },
      { id: 'agenda', label: 'Mi Agenda', href: '/sales/agenda', icon: 'calendar',
        roles: [ROLES.VENDEDOR, ROLES.COORD_VENTAS] },
      { id: 'mi-cuota', label: 'Mi Cuota', href: '/sales/mi-cuota', icon: 'gauge',
        roles: [ROLES.VENDEDOR] },
    ],
  },
];

/* ──────────────────────────────────────────────────────────────────
 *  OPS / OPERACIÓN
 * ────────────────────────────────────────────────────────────────── */
export const OPS_NAV: NavGroup[] = [
  {
    id: 'home', title: 'Hoy',
    items: [
      { id: 'mi-agenda', label: 'Mi Agenda', href: '/ops/mi-agenda', icon: 'calendar',
        roles: [ROLES.ING_CAMPO, ROLES.ING_SOPORTE, ROLES.COORD_OPERACIONES, ROLES.CEO, ROLES.DIR_OPERACIONES] },
      { id: 'dashboard', label: 'Dashboard', href: '/ops/dashboard', icon: 'home',
        roles: [ROLES.COORD_OPERACIONES, ROLES.CEO, ROLES.DIR_OPERACIONES] },
    ],
  },
  {
    id: 'campo', title: 'Trabajo de Campo',
    items: [
      { id: 'mis-actividades', label: 'Mis Actividades', href: '/ops/mis-actividades', icon: 'clipboard-list',
        roles: [ROLES.ING_CAMPO] },
      { id: 'actividades', label: 'Actividades (todas)', href: '/ops/actividades', icon: 'clipboard',
        roles: [ROLES.COORD_OPERACIONES, ROLES.CEO, ROLES.DIR_OPERACIONES] },
      { id: 'mis-viaticos', label: 'Mis Viáticos', href: '/ops/mis-viaticos', icon: 'wallet',
        roles: [ROLES.ING_CAMPO] },
      { id: 'asistencia', label: 'Check-in / Check-out', href: '/ops/asistencia', icon: 'map-pin',
        roles: [ROLES.ING_CAMPO, ROLES.ING_SOPORTE] },
      { id: 'mis-vehiculos', label: 'Mi Vehículo', href: '/ops/mis-vehiculos', icon: 'truck',
        roles: [ROLES.ING_CAMPO] },
    ],
  },
  {
    id: 'soporte', title: 'Soporte y NOC',
    items: [
      { id: 'soporte', label: 'Tickets de Soporte', href: '/ops/soporte', icon: 'life-buoy',
        roles: [ROLES.ING_SOPORTE, ROLES.COORD_OPERACIONES] },
      { id: 'noc', label: 'NOC Monitor', href: '/ops/noc', icon: 'activity',
        roles: [ROLES.ING_SOPORTE, ROLES.COORD_OPERACIONES] },
      { id: 'mantenimiento', label: 'Mantenimientos', href: '/ops/mantenimiento', icon: 'wrench',
        roles: [ROLES.ING_SOPORTE, ROLES.COORD_OPERACIONES] },
      { id: 'sla', label: 'SLA', href: '/ops/sla', icon: 'gauge',
        roles: [ROLES.ING_SOPORTE, ROLES.COORD_OPERACIONES] },
      { id: 'kb', label: 'Base de Conocimiento', href: '/ops/kb', icon: 'book',
        roles: [ROLES.ING_SOPORTE] },
    ],
  },
  {
    id: 'gestion', title: 'Gestión',
    items: [
      { id: 'proyectos', label: 'Proyectos', href: '/ops/proyectos', icon: 'folder-kanban',
        roles: [ROLES.COORD_OPERACIONES, ROLES.CEO, ROLES.DIR_OPERACIONES] },
      { id: 'equipos', label: 'Equipos / Activos', href: '/ops/equipos', icon: 'box',
        roles: [ROLES.COORD_OPERACIONES, ROLES.ING_SOPORTE] },
      { id: 'vehiculos', label: 'Vehículos (flota)', href: '/ops/vehiculos', icon: 'truck',
        roles: [ROLES.COORD_OPERACIONES, ROLES.CEO] },
      { id: 'gps', label: 'GPS / Tracking', href: '/ops/gps', icon: 'map',
        roles: [ROLES.COORD_OPERACIONES, ROLES.CEO, ROLES.DIR_OPERACIONES] },
    ],
  },
];

/* ──────────────────────────────────────────────────────────────────
 *  STUDIO / WEB / MARKETING
 * ────────────────────────────────────────────────────────────────── */
export const STUDIO_NAV: NavGroup[] = [
  {
    id: 'home', title: 'Inicio',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/studio/dashboard', icon: 'home',
        roles: [ROLES.LIDER_DISENO, ROLES.DISENADOR, ROLES.CEO] },
    ],
  },
  {
    id: 'sitio', title: 'Sitio público',
    items: [
      { id: 'hero', label: 'Hero / Inicio', href: '/studio/sitio/hero', icon: 'image',
        roles: [ROLES.LIDER_DISENO, ROLES.DISENADOR] },
      { id: 'servicios', label: 'Servicios', href: '/studio/sitio/servicios', icon: 'layers',
        roles: [ROLES.LIDER_DISENO, ROLES.DISENADOR] },
      { id: 'soluciones', label: 'Soluciones', href: '/studio/sitio/soluciones', icon: 'shapes',
        roles: [ROLES.LIDER_DISENO, ROLES.DISENADOR] },
      { id: 'proyectos', label: 'Proyectos (showcase)', href: '/studio/proyectos', icon: 'briefcase',
        roles: [ROLES.LIDER_DISENO, ROLES.DISENADOR] },
      { id: 'nosotros', label: 'Nosotros', href: '/studio/sitio/nosotros', icon: 'building',
        roles: [ROLES.LIDER_DISENO, ROLES.DISENADOR] },
      { id: 'contacto', label: 'Contacto', href: '/studio/sitio/contacto', icon: 'mail',
        roles: [ROLES.LIDER_DISENO, ROLES.DISENADOR] },
    ],
  },
  {
    id: 'contenido', title: 'Contenido',
    items: [
      { id: 'noticias', label: 'Noticias / Blog', href: '/studio/noticias', icon: 'newspaper',
        roles: [ROLES.LIDER_DISENO, ROLES.DISENADOR] },
      { id: 'galeria', label: 'Galería', href: '/studio/galeria', icon: 'images',
        roles: [ROLES.LIDER_DISENO, ROLES.DISENADOR] },
      { id: 'redes', label: 'Redes Sociales', href: '/studio/redes', icon: 'share-2',
        roles: [ROLES.LIDER_DISENO, ROLES.DISENADOR] },
      { id: 'newsletter', label: 'Newsletter', href: '/studio/newsletter', icon: 'send',
        roles: [ROLES.LIDER_DISENO] },
    ],
  },
  {
    id: 'leads', title: 'Leads & Equipo',
    items: [
      { id: 'contactos', label: 'Mensajes de Contacto', href: '/studio/contactos', icon: 'inbox',
        roles: [ROLES.LIDER_DISENO, ROLES.CEO] },
      { id: 'equipo', label: 'Equipo de Diseño', href: '/studio/equipo', icon: 'users',
        roles: [ROLES.LIDER_DISENO] },
    ],
  },
];

/* ──────────────────────────────────────────────────────────────────
 *  PORTAL — cliente externo
 * ────────────────────────────────────────────────────────────────── */
export const PORTAL_NAV: NavGroup[] = [
  {
    id: 'home', title: 'Mi Portal',
    items: [
      { id: 'inicio', label: 'Inicio', href: '/portal', icon: 'home', roles: [ROLES.CLIENTE] },
      { id: 'mis-tickets', label: 'Mis Tickets', href: '/portal/mis-tickets', icon: 'ticket', roles: [ROLES.CLIENTE] },
      { id: 'nuevo-ticket', label: 'Nuevo Ticket', href: '/portal/nuevo-ticket', icon: 'plus-circle', roles: [ROLES.CLIENTE] },
      { id: 'mis-servicios', label: 'Mis Servicios', href: '/portal/mis-servicios', icon: 'briefcase', roles: [ROLES.CLIENTE] },
      { id: 'mis-sucursales', label: 'Mis Sucursales', href: '/portal/mis-sucursales', icon: 'map-pin', roles: [ROLES.CLIENTE] },
    ],
  },
];

// `PanelKey` se define una sola vez en `./roles` (importado arriba) para
// evitar conflicto de re-exportación duplicada desde `./index`.

/** Selector de NAV por panel. */
export function getNavForPanel(panel: PanelKey): NavGroup[] {
  switch (panel) {
    case 'core':   return CORE_NAV;
    case 'sales':  return SALES_NAV;
    case 'ops':    return OPS_NAV;
    case 'studio': return STUDIO_NAV;
    case 'portal': return PORTAL_NAV;
  }
}

/** Filtra grupos/items según el rol. */
export function filterNavByRole(groups: NavGroup[], role: RoleKey): NavGroup[] {
  return groups
    .map(g => ({
      ...g,
      items: g.items
        .filter(i => i.roles.includes(role) || role === ROLES.SUPER_ADMIN)
        .map(i => i.children
          ? { ...i, children: i.children.filter(c => c.roles.includes(role) || role === ROLES.SUPER_ADMIN) }
          : i),
    }))
    .filter(g => g.items.length > 0);
}
