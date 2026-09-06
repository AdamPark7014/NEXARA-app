/**
 * NEXARA · Red de seguridad del déficit de módulos por rol
 * ========================================================
 *
 * El fallo que esta suite existe para impedir: un rol se queda con un puñado de
 * módulos aunque su trabajo exija muchos más. Pasa porque el menú se decide en
 * TRES capas encadenadas y basta con que una niegue:
 *
 *   1. `PAGE_MATRIX`            (apps/web/lib/rbac/page-matrix.ts)    — whitelist de páginas
 *   2. `shouldShowModuleInSidebar` (apps/web/lib/section-views.ts)    — qué se pinta en el menú
 *   3. `URL_MATRIX` → `/me/navigation` (apps/api/.../url-matrix.ts)   — clip del servidor
 *
 * Como se intersectan, el resultado es siempre la MÁS restrictiva. Aquí se fija
 * el conjunto exacto que ve cada rol y, sobre todo, se exige que las tres capas
 * digan lo mismo: cualquier módulo que 1 y 2 concedan y 3 recorte es un bug.
 */
import { describe, expect, it } from 'vitest';
import { MODULES, type ModuleEntry } from '@/lib/access-matrix';
import { canUserAccessPath } from '@/lib/user-access';
import { shouldShowModuleInSidebar } from '@/lib/section-views';
import { filterModulesByNavigation, type MeNavigation } from '@/lib/me-navigation';
import { canOpenPage } from '@/lib/rbac/page-matrix';
import { ALL_ROLES, ROLES, type RoleKey } from '@/lib/rbac/roles';
// La API es la tercera capa: se importa de verdad para que un recorte allí
// rompa esta suite en vez de descubrirse en producción.
import { URL_MATRIX } from '../../../api/src/common/rbac/url-matrix';
import { deriveModuleKeysFromPaths } from '../../../api/src/me/navigation-module-map';

const ALL_MODULES = Object.values(MODULES) as ModuleEntry[];

function moduleUrl(m: ModuleEntry): string {
  const p = m.path ?? '/';
  return `/${m.panel}${p === '/' ? '' : p.startsWith('/') ? p : `/${p}`}`;
}

function userFor(role: RoleKey) {
  return { roleKey: role, isSuperAdmin: role === ROLES.SUPER_ADMIN };
}

/** Réplica exacta de lo que hace `AppShell`: sidebar y luego clip de `/me/navigation`. */
function navigationFor(role: RoleKey): MeNavigation {
  const paths = (URL_MATRIX[role] ?? []).map((r) => r.path);
  const { moduleKeys, webModuleIds } = deriveModuleKeysFromPaths(paths);
  return { roleKey: role, orgRoleKey: null, panels: [], paths, moduleKeys, webModuleIds };
}

function passesPageMatrix(role: RoleKey, m: ModuleEntry): boolean {
  return canUserAccessPath(userFor(role), moduleUrl(m));
}

function passesSidebarRules(role: RoleKey, m: ModuleEntry): boolean {
  return shouldShowModuleInSidebar(userFor(role), m);
}

/** Módulos que el usuario ve de verdad, tras las tres capas. */
function visibleModules(role: RoleKey): string[] {
  const afterWeb = ALL_MODULES.filter((m) => passesPageMatrix(role, m) && passesSidebarRules(role, m));
  return filterModulesByNavigation(afterWeb, navigationFor(role))
    .map((m) => m.id)
    .sort();
}

/**
 * Conjunto esperado por rol. Si un cambio de RBAC mueve un módulo, este archivo
 * tiene que moverse en el mismo commit: es el registro de qué ve cada puesto.
 */
const EXPECTED_MODULES: Record<RoleKey, string[]> = {
  super_admin: [
    'accounting',
    'approvals',
    'architecture',
    'attendance',
    'audit',
    'banking',
    'bi',
    'calendar',
    'chat',
    'companies',
    'crm-agenda',
    'crm-chat',
    'crm-clients',
    'crm-dashboard',
    'crm-leads',
    'crm-opportunities',
    'crm-pipeline',
    'crm-products',
    'crm-projects',
    'crm-quotes',
    'crm-reports',
    'crm-sales-team',
    'crm-targets',
    'crm-templates',
    'crm-tenders',
    'documents',
    'employee-payments',
    'executive',
    'expenses-admin',
    'exports',
    'facilities-access',
    'fines',
    'hr',
    'integra-access',
    'integra-alarms',
    'integra-anpr',
    'integra-attendance',
    'integra-audit',
    'integra-detection',
    'integra-espacios',
    'integra-events',
    'integra-home',
    'integra-map',
    'integra-my-profile',
    'integra-notifications',
    'integra-people',
    'integra-schedules',
    'integra-settings',
    'integra-vehicles',
    'integra-video',
    'integra-visitors',
    'invoicing',
    'kb',
    'kpis-hr',
    'lab-ai',
    'lab-chat',
    'lab-flags',
    'lab-health',
    'lab-home',
    'lunch-breaks',
    'my-profile',
    'news',
    'notifications-center',
    'ops-activities',
    'ops-assets',
    'ops-chat',
    'ops-cvs',
    'ops-dashboard',
    'ops-dispatch',
    'ops-gps',
    'ops-maintenance',
    'ops-noc',
    'ops-projects',
    'ops-service-clients',
    'ops-support-inbox',
    'ops-support-sla',
    'ops-tools',
    'ops-vehicles',
    'orgchart',
    'procurement',
    'reuniones',
    'settings',
    'studio-cases',
    'studio-chat',
    'studio-contacts',
    'studio-dashboard',
    'studio-hero',
    'studio-leads',
    'studio-news',
    'studio-newsletter',
    'studio-pages',
    'studio-social',
    'users',
    'viatics-admin',
    'warehouse',
  ],
  ceo: [
    'accounting',
    'approvals',
    'architecture',
    'attendance',
    'audit',
    'banking',
    'bi',
    'calendar',
    'chat',
    'companies',
    'crm-agenda',
    'crm-chat',
    'crm-clients',
    'crm-dashboard',
    'crm-leads',
    'crm-opportunities',
    'crm-pipeline',
    'crm-products',
    'crm-projects',
    'crm-quotes',
    'crm-reports',
    'crm-sales-team',
    'crm-targets',
    'crm-templates',
    'crm-tenders',
    'documents',
    'employee-payments',
    'executive',
    'expenses-admin',
    'exports',
    'facilities-access',
    'fines',
    'hr',
    'integra-access',
    'integra-alarms',
    'integra-anpr',
    'integra-attendance',
    'integra-audit',
    'integra-detection',
    'integra-espacios',
    'integra-events',
    'integra-home',
    'integra-map',
    'integra-my-profile',
    'integra-notifications',
    'integra-people',
    'integra-schedules',
    'integra-settings',
    'integra-vehicles',
    'integra-video',
    'integra-visitors',
    'invoicing',
    'kb',
    'kpis-hr',
    'lab-ai',
    'lab-chat',
    'lab-flags',
    'lab-health',
    'lab-home',
    'lunch-breaks',
    'my-profile',
    'news',
    'notifications-center',
    'ops-activities',
    'ops-assets',
    'ops-chat',
    'ops-cvs',
    'ops-dashboard',
    'ops-dispatch',
    'ops-gps',
    'ops-maintenance',
    'ops-noc',
    'ops-projects',
    'ops-service-clients',
    'ops-support-inbox',
    'ops-support-sla',
    'ops-tools',
    'ops-vehicles',
    'orgchart',
    'procurement',
    'reuniones',
    'settings',
    'studio-cases',
    'studio-chat',
    'studio-contacts',
    'studio-dashboard',
    'studio-hero',
    'studio-leads',
    'studio-news',
    'studio-newsletter',
    'studio-pages',
    'studio-social',
    'users',
    'viatics-admin',
    'warehouse',
  ],
  arquitecto: [
    'approvals',
    'attendance',
    'calendar',
    'chat',
    'crm-projects',
    'crm-quotes',
    'dashboard',
    'documents',
    'integra-access',
    'integra-alarms',
    'integra-anpr',
    'integra-attendance',
    'integra-audit',
    'integra-detection',
    'integra-espacios',
    'integra-events',
    'integra-home',
    'integra-map',
    'integra-my-profile',
    'integra-notifications',
    'integra-people',
    'integra-schedules',
    'integra-settings',
    'integra-vehicles',
    'integra-video',
    'integra-visitors',
    'kb',
    'lunch-breaks',
    'my-profile',
    'notifications-center',
    'ops-activities',
    'ops-assets',
    'ops-chat',
    'ops-cvs',
    'ops-dashboard',
    'ops-dispatch',
    'ops-gps',
    'ops-maintenance',
    'ops-noc',
    'ops-projects',
    'ops-service-clients',
    'ops-support-inbox',
    'ops-support-sla',
    'ops-tools',
    'ops-viatics',
    'orgchart',
    'reuniones',
  ],
  dir_operaciones: [
    'approvals',
    'architecture',
    'attendance',
    'bi',
    'calendar',
    'chat',
    'companies',
    'crm-dashboard',
    'crm-pipeline',
    'crm-projects',
    'crm-quotes',
    'crm-reports',
    'crm-tenders',
    'dashboard',
    'documents',
    'employee-payments',
    'executive',
    'expenses-admin',
    'exports',
    'facilities-access',
    'integra-access',
    'integra-alarms',
    'integra-anpr',
    'integra-attendance',
    'integra-audit',
    'integra-detection',
    'integra-espacios',
    'integra-events',
    'integra-home',
    'integra-map',
    'integra-my-profile',
    'integra-notifications',
    'integra-people',
    'integra-schedules',
    'integra-settings',
    'integra-vehicles',
    'integra-video',
    'integra-visitors',
    'kb',
    'lunch-breaks',
    'my-profile',
    'news',
    'notifications-center',
    'ops-activities',
    'ops-assets',
    'ops-chat',
    'ops-cvs',
    'ops-dashboard',
    'ops-dispatch',
    'ops-gps',
    'ops-maintenance',
    'ops-noc',
    'ops-projects',
    'ops-service-clients',
    'ops-support-inbox',
    'ops-support-sla',
    'ops-tools',
    'ops-vehicles',
    'ops-viatics',
    'orgchart',
    'procurement',
    'reuniones',
    'warehouse',
  ],
  dir_admin: [
    'accounting',
    'approvals',
    'architecture',
    'attendance',
    'audit',
    'banking',
    'bi',
    'calendar',
    'chat',
    'companies',
    'crm-agenda',
    'crm-clients',
    'crm-dashboard',
    'crm-leads',
    'crm-opportunities',
    'crm-pipeline',
    'crm-products',
    'crm-projects',
    'crm-quotes',
    'crm-reports',
    'crm-sales-team',
    'crm-targets',
    'crm-templates',
    'crm-tenders',
    'dashboard',
    'documents',
    'employee-payments',
    'executive',
    'expenses-admin',
    'exports',
    'facilities-access',
    'fines',
    'hr',
    'invoicing',
    'kb',
    'kpis-hr',
    'lunch-breaks',
    'my-profile',
    'news',
    'notifications-center',
    'ops-activities',
    'ops-projects',
    'orgchart',
    'procurement',
    'reuniones',
    'settings',
    'users',
    'viatics-admin',
    'warehouse',
  ],
  coord_admin: [
    'accounting',
    'approvals',
    'attendance',
    'banking',
    'calendar',
    'chat',
    'companies',
    'crm-agenda',
    'crm-clients',
    'crm-dashboard',
    'crm-leads',
    'crm-opportunities',
    'crm-pipeline',
    'crm-products',
    'crm-projects',
    'crm-quotes',
    'dashboard',
    'documents',
    'employee-payments',
    'expenses-admin',
    'exports',
    'fines',
    'hr',
    'invoicing',
    'kb',
    'kpis-hr',
    'lunch-breaks',
    'my-profile',
    'news',
    'notifications-center',
    'ops-activities',
    'ops-projects',
    'orgchart',
    'procurement',
    'reuniones',
    'users',
    'viatics-admin',
    'warehouse',
  ],
  administrativo: [
    'approvals',
    'attendance',
    'calendar',
    'chat',
    'companies',
    'crm-agenda',
    'crm-clients',
    'crm-leads',
    'crm-pipeline',
    'crm-quotes',
    'dashboard',
    'documents',
    'expenses-admin',
    'invoicing',
    'lunch-breaks',
    'my-profile',
    'news',
    'notifications-center',
    'ops-vehicles',
    'procurement',
    'reuniones',
    'viatics-admin',
    'warehouse',
  ],
  coord_operaciones: [
    'approvals',
    'attendance',
    'calendar',
    'chat',
    'crm-quotes',
    'documents',
    'integra-access',
    'integra-alarms',
    'integra-anpr',
    'integra-attendance',
    'integra-audit',
    'integra-detection',
    'integra-espacios',
    'integra-events',
    'integra-home',
    'integra-map',
    'integra-my-profile',
    'integra-notifications',
    'integra-people',
    'integra-schedules',
    'integra-settings',
    'integra-vehicles',
    'integra-video',
    'integra-visitors',
    'kb',
    'lunch-breaks',
    'my-profile',
    'notifications-center',
    'ops-activities',
    'ops-assets',
    'ops-chat',
    'ops-cvs',
    'ops-dashboard',
    'ops-dispatch',
    'ops-gps',
    'ops-maintenance',
    'ops-noc',
    'ops-projects',
    'ops-service-clients',
    'ops-support-inbox',
    'ops-support-sla',
    'ops-tools',
    'ops-vehicles',
    'ops-viatics',
    'orgchart',
    'reuniones',
  ],
  ing_campo: [
    'attendance',
    'calendar',
    'chat',
    'documents',
    'lunch-breaks',
    'my-profile',
    'notifications-center',
    'ops-chat',
    'ops-dashboard',
    'ops-dispatch',
    'ops-my-activities',
    'ops-my-vehicles',
    'ops-my-viatics',
    'ops-tools',
    'reuniones',
  ],
  ing_soporte: [
    'attendance',
    'calendar',
    'chat',
    'crm-quotes',
    'documents',
    'integra-access',
    'integra-alarms',
    'integra-anpr',
    'integra-attendance',
    'integra-audit',
    'integra-detection',
    'integra-espacios',
    'integra-events',
    'integra-home',
    'integra-map',
    'integra-my-profile',
    'integra-notifications',
    'integra-people',
    'integra-schedules',
    'integra-settings',
    'integra-vehicles',
    'integra-video',
    'integra-visitors',
    'kb',
    'lunch-breaks',
    'my-profile',
    'notifications-center',
    'ops-chat',
    'ops-dashboard',
    'ops-my-activities',
    'ops-my-viatics',
    'ops-noc',
    'ops-support-inbox',
    'ops-support-sla',
    'ops-tools',
    'reuniones',
  ],
  coord_ventas: [
    'approvals',
    'attendance',
    'calendar',
    'chat',
    'crm-agenda',
    'crm-chat',
    'crm-clients',
    'crm-dashboard',
    'crm-leads',
    'crm-opportunities',
    'crm-pipeline',
    'crm-products',
    'crm-projects',
    'crm-quotes',
    'crm-reports',
    'crm-sales-team',
    'crm-targets',
    'crm-templates',
    'crm-tenders',
    'dashboard',
    'documents',
    'kb',
    'lunch-breaks',
    'my-profile',
    'notifications-center',
    'orgchart',
    'reuniones',
    'studio-contacts',
    'studio-leads',
  ],
  vendedor: [
    'attendance',
    'calendar',
    'chat',
    'crm-agenda',
    'crm-chat',
    'crm-clients',
    'crm-dashboard',
    'crm-leads',
    'crm-opportunities',
    'crm-pipeline',
    'crm-products',
    'crm-projects',
    'crm-quotes',
    'lunch-breaks',
    'my-profile',
    'notifications-center',
    'reuniones',
  ],
  lider_diseno: [
    'attendance',
    'calendar',
    'chat',
    'crm-products',
    'crm-quotes',
    'crm-templates',
    'lunch-breaks',
    'my-profile',
    'notifications-center',
    'reuniones',
    'studio-cases',
    'studio-chat',
    'studio-contacts',
    'studio-dashboard',
    'studio-hero',
    'studio-leads',
    'studio-news',
    'studio-newsletter',
    'studio-pages',
    'studio-social',
  ],
  disenador: [
    'attendance',
    'calendar',
    'chat',
    'crm-products',
    'crm-quotes',
    'lunch-breaks',
    'my-profile',
    'notifications-center',
    'reuniones',
    'studio-cases',
    'studio-chat',
    'studio-contacts',
    'studio-dashboard',
    'studio-hero',
    'studio-leads',
    'studio-news',
    'studio-newsletter',
    'studio-pages',
    'studio-social',
  ],
  rh: [
    'approvals',
    'attendance',
    'calendar',
    'chat',
    'dashboard',
    'documents',
    'employee-payments',
    'fines',
    'hr',
    'kb',
    'kpis-hr',
    'lunch-breaks',
    'my-profile',
    'notifications-center',
    'ops-cvs',
    'orgchart',
    'reuniones',
    'viatics-admin',
  ],
  contabilidad: [
    'accounting',
    'approvals',
    'attendance',
    'banking',
    'calendar',
    'chat',
    'crm-projects',
    'crm-quotes',
    'dashboard',
    'documents',
    'employee-payments',
    'expenses-admin',
    'exports',
    'invoicing',
    'kb',
    'lunch-breaks',
    'my-profile',
    'notifications-center',
    'reuniones',
    'viatics-admin',
  ],
  cliente: [
    'integra-access',
    'integra-alarms',
    'integra-anpr',
    'integra-events',
    'integra-home',
    'integra-map',
    'integra-my-profile',
    'integra-notifications',
    'integra-people',
    'integra-vehicles',
    'integra-video',
    'integra-visitors',
  ],
};

/** Suelo por puesto: por debajo de esto el rol no puede hacer su trabajo. */
const MIN_MODULES: Partial<Record<RoleKey, number>> = {
  administrativo: 20,
  contabilidad: 18,
  rh: 16,
  vendedor: 15,
  coord_ventas: 25,
  ing_campo: 13,
  ing_soporte: 30,
  coord_operaciones: 40,
  arquitecto: 40,
  dir_admin: 45,
  dir_operaciones: 55,
  coord_admin: 35,
  lider_diseno: 18,
  disenador: 17,
  ceo: 90,
  super_admin: 90,
};

describe('modulos visibles por rol', () => {
  it.each(ALL_ROLES)('%s ve exactamente su catalogo', (role) => {
    expect(visibleModules(role)).toEqual(EXPECTED_MODULES[role]);
  });

  it('ningun rol interno se queda por debajo de su suelo de trabajo', () => {
    for (const [role, floor] of Object.entries(MIN_MODULES) as Array<[RoleKey, number]>) {
      expect(visibleModules(role).length, `${role} bajo de ${floor} modulos`).toBeGreaterThanOrEqual(floor);
    }
  });

  it('el super admin ve el catalogo completo salvo bandejas personales y pestanas', () => {
    // `ops-my-*` son bandejas de otro; evidencias y contratos viven como pestana
    // dentro de Actividades y Mantenimiento; el ejecutivo sustituye al dashboard.
    const shown = new Set(EXPECTED_MODULES.super_admin);
    expect(ALL_MODULES.filter((m) => !shown.has(m.id)).map((m) => m.id).sort()).toEqual([
      'dashboard',
      'ops-evidences',
      'ops-maintenance-contracts',
      'ops-my-activities',
      'ops-my-evidences',
      'ops-my-vehicles',
      'ops-my-viatics',
      'ops-viatics',
    ]);
  });
});

describe('coherencia de las tres capas', () => {
  it('lo que la web concede, /me/navigation no lo recorta', () => {
    const clipped: string[] = [];
    for (const role of ALL_ROLES) {
      const afterWeb = ALL_MODULES.filter(
        (m) => passesPageMatrix(role, m) && passesSidebarRules(role, m),
      );
      const afterNav = new Set(
        filterModulesByNavigation(afterWeb, navigationFor(role)).map((m) => m.id),
      );
      for (const m of afterWeb) {
        if (!afterNav.has(m.id)) clipped.push(`${role} -> ${m.id}`);
      }
    }
    expect(clipped).toEqual([]);
  });

  it('el comodin raiz de url-matrix significa acceso total, no cero', () => {
    // `/**` colapsaba a base vacia y dejaba al super admin con 1 modulo.
    const nav: MeNavigation = {
      roleKey: 'super_admin',
      orgRoleKey: null,
      panels: [],
      paths: ['/**'],
      moduleKeys: [],
      webModuleIds: ['my-profile'],
    };
    expect(filterModulesByNavigation(ALL_MODULES, nav)).toHaveLength(ALL_MODULES.length);
  });

  it('una navegacion vacia nunca recorta (build viejo o API caida)', () => {
    const nav: MeNavigation = {
      roleKey: 'vendedor',
      orgRoleKey: null,
      panels: [],
      paths: [],
      moduleKeys: [],
      webModuleIds: [],
    };
    expect(filterModulesByNavigation(ALL_MODULES, nav)).toHaveLength(ALL_MODULES.length);
  });
});

describe('el modulo se abre entero, no solo su listado', () => {
  // Un path sin `/**` deja ver la lista y bloquea el detalle: el usuario cree
  // que tiene el modulo hasta que hace clic en la primera fila.
  const LIST_AND_DETAIL: Array<[RoleKey, string]> = [
    [ROLES.ADMINISTRATIVO, '/erp/invoicing'],
    [ROLES.ADMINISTRATIVO, '/erp/warehouse'],
    [ROLES.ADMINISTRATIVO, '/erp/procurement'],
    [ROLES.COORD_ADMIN, '/erp/invoicing'],
    [ROLES.COORD_ADMIN, '/erp/procurement'],
    [ROLES.CONTABILIDAD, '/erp/invoicing'],
    [ROLES.CONTABILIDAD, '/crm/quotes'],
    [ROLES.COORD_OPERACIONES, '/crm/quotes'],
    [ROLES.DIR_ADMIN, '/crm/tenders'],
    [ROLES.DIR_OPERACIONES, '/erp/warehouse'],
    [ROLES.DIR_OPERACIONES, '/erp/procurement'],
    [ROLES.ING_SOPORTE, '/crm/quotes'],
  ];

  it.each(LIST_AND_DETAIL)('%s abre %s y tambien su detalle', (role, path) => {
    expect(canOpenPage(role, path)).toBe(true);
    expect(canOpenPage(role, `${path}/123`)).toBe(true);
  });

  it('no queda ningun modulo con listado accesible y detalle bloqueado', () => {
    const parents = [
      '/crm/clients',
      '/crm/leads',
      '/crm/opportunities',
      '/crm/projects',
      '/crm/quotes',
      '/crm/tenders',
      '/erp/invoicing',
      '/erp/warehouse',
      '/erp/procurement',
      '/ops/activities',
      '/ops/projects',
      '/ops/service-clients',
      '/ops/support',
      '/ops/vehicles',
    ];
    const broken: string[] = [];
    for (const role of ALL_ROLES) {
      if (role === ROLES.SUPER_ADMIN) continue;
      for (const p of parents) {
        if (canOpenPage(role, p) && !canOpenPage(role, `${p}/123`)) broken.push(`${role} -> ${p}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

describe('cada puesto llega a su objeto de trabajo', () => {
  // Casos reportados por el dueno del producto. Cada asercion nombra la funcion
  // documentada en `docs/AREAS-VS-SISTEMA.md` que la justifica.
  it('administrativo factura: es su funcion #1 en el organigrama', () => {
    expect(visibleModules(ROLES.ADMINISTRATIVO)).toContain('invoicing');
    expect(canOpenPage(ROLES.ADMINISTRATIVO, '/erp/invoicing/42')).toBe(true);
  });

  it('administrativo da seguimiento a clientes: leads, embudo y agenda', () => {
    expect(visibleModules(ROLES.ADMINISTRATIVO)).toEqual(
      expect.arrayContaining(['crm-clients', 'crm-leads', 'crm-pipeline', 'crm-agenda']),
    );
  });

  it('administrativo compra a mayorista y consulta almacen', () => {
    expect(visibleModules(ROLES.ADMINISTRATIVO)).toEqual(
      expect.arrayContaining(['procurement', 'warehouse']),
    );
  });

  it('ing_soporte tiene el NOC, que es donde vive su turno', () => {
    expect(visibleModules(ROLES.ING_SOPORTE)).toEqual(
      expect.arrayContaining(['ops-noc', 'ops-support-inbox', 'ops-support-sla']),
    );
    expect(canOpenPage(ROLES.ING_SOPORTE, '/ops/noc')).toBe(true);
  });

  it('vendedor ve Oportunidades y su pipeline', () => {
    expect(visibleModules(ROLES.VENDEDOR)).toEqual(
      expect.arrayContaining([
        'crm-opportunities',
        'crm-pipeline',
        'crm-leads',
        'crm-quotes',
        'crm-clients',
      ]),
    );
  });

  it('arquitecto valida los cierres: aprobaciones + supervision OPS', () => {
    expect(canOpenPage(ROLES.ARQUITECTO, '/erp/approvals')).toBe(true);
    expect(visibleModules(ROLES.ARQUITECTO)).toEqual(
      expect.arrayContaining(['approvals', 'ops-activities', 'documents', 'kb']),
    );
  });

  it('arquitecto conserva INTEGRA, que /me/navigation le borraba entero', () => {
    expect(visibleModules(ROLES.ARQUITECTO)).toEqual(
      expect.arrayContaining(['integra-home', 'integra-video', 'integra-access']),
    );
  });

  it('rh autoriza permisos y lleva pagos al personal', () => {
    expect(visibleModules(ROLES.RH)).toEqual(
      expect.arrayContaining(['approvals', 'hr', 'fines', 'employee-payments', 'attendance']),
    );
  });

  it('contabilidad autoriza gastos y abre la cotizacion que factura', () => {
    expect(visibleModules(ROLES.CONTABILIDAD)).toEqual(
      expect.arrayContaining(['approvals', 'accounting', 'invoicing', 'crm-quotes']),
    );
    expect(canOpenPage(ROLES.CONTABILIDAD, '/crm/quotes/7')).toBe(true);
  });

  it('coord_ventas tiene calendario propio y los leads del sitio', () => {
    expect(visibleModules(ROLES.COORD_VENTAS)).toEqual(
      expect.arrayContaining(['calendar', 'studio-leads', 'studio-contacts', 'approvals']),
    );
  });

  it('el equipo de diseno conserva chat y calendario', () => {
    for (const role of [ROLES.LIDER_DISENO, ROLES.DISENADOR]) {
      expect(visibleModules(role)).toEqual(expect.arrayContaining(['chat', 'calendar']));
    }
  });

  it('el ingeniero de campo llega a documentos y su calendario', () => {
    expect(visibleModules(ROLES.ING_CAMPO)).toEqual(
      expect.arrayContaining(['documents', 'calendar']),
    );
  });

  it('el cliente externo sigue confinado al portal y su INTEGRA', () => {
    expect(visibleModules(ROLES.CLIENTE).every((id) => id.startsWith('integra-'))).toBe(true);
    expect(canOpenPage(ROLES.CLIENTE, '/erp/invoicing')).toBe(false);
    expect(canOpenPage(ROLES.CLIENTE, '/integra/settings')).toBe(false);
  });

  it('ampliar no rompio el confinamiento: nadie operativo entra en gobierno', () => {
    for (const role of [ROLES.ING_CAMPO, ROLES.ING_SOPORTE, ROLES.VENDEDOR, ROLES.DISENADOR]) {
      expect(canOpenPage(role, '/erp/users')).toBe(false);
      expect(canOpenPage(role, '/erp/accounting')).toBe(false);
      expect(canOpenPage(role, '/erp/banking')).toBe(false);
      expect(canOpenPage(role, '/erp/settings')).toBe(false);
    }
    // Facturacion fiscal sigue fuera del alcance operativo.
    expect(canOpenPage(ROLES.ING_CAMPO, '/erp/invoicing')).toBe(false);
    expect(canOpenPage(ROLES.VENDEDOR, '/erp/invoicing')).toBe(false);
  });
});
