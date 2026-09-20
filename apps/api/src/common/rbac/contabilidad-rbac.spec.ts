/**
 * Contrato de autorización del perfil CONTADORA (`ROLES.CONTABILIDAD`).
 *
 * Se prueba por BACKEND, no por esconder botones: cada caso responde "¿el servidor
 * la deja entrar?" usando las mismas dos capas que corren en producción.
 *
 *   1. `checkUrlAccess` — whitelist de `url-matrix.ts`. Es lo que aplica
 *      `UrlAccessGuard` a la API y el middleware de Next a las páginas.
 *   2. Los permisos que `AuthService` emite para el rol. Es lo que compara
 *      `RbacGuard` contra cada `@RBAC({...})` de los controladores.
 *
 * Criterio (acordado para el perfil): ve dinero, documentos, nómina y costos;
 * NO administra herramientas, NO aprueba préstamos, NO toca usuarios ni roles,
 * y NO entra a módulos operativos ajenos.
 */
import { checkUrlAccess } from './url-matrix';
import { ROLES } from './roles.v2';
import { PERMISSIONS } from '../permissions.js';
import { AuthService } from '../../auth/auth.service.js';
import { AccountingService } from '../../accounting/accounting.service.js';
import { companyWhere, requireCompanyId } from '../tenant/tenant-scope.js';
import {
  assertCanCreateToolLoan,
  assertCanManageTools,
  hasToolsManageAccess,
} from '../../tool-requests/tools-access.js';

/** Correo real del puesto; no está en ninguna lista de herramientas. */
const CORREO_CONTADORA = 'contabilidad@nexara.com.mx';

/**
 * Permisos efectivos del rol, calculados con el MISMO código que usa el login.
 * `addV2RolePermissions` es privado y solo se apoya en `this.applyToolsManageByEmail`,
 * así que invocarlo sobre el prototipo da el resultado real sin levantar el módulo Nest.
 */
function permisosDelRol(roleKey: string, email?: string | null): string[] {
  const proto = AuthService.prototype as unknown as Record<string, unknown>;
  const fn = proto['addV2RolePermissions'] as (
    permissions: string[],
    roleKey: string | null | undefined,
    email?: string | null,
  ) => string[];
  return fn.call(proto, [], roleKey, email ?? null);
}

const permisosContadora = permisosDelRol(ROLES.CONTABILIDAD, CORREO_CONTADORA);

/** Atajo legible: `GET` salvo que se indique otro método. */
function puede(
  role: string,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
): boolean {
  return checkUrlAccess(role as never, url, method).allowed;
}

describe('CONTADORA · lo que SÍ le toca (200)', () => {
  const suyas: Array<[string, 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE']> = [
    ['/api/accounting/workspace/dashboard', 'GET'],
    ['/api/accounting/accounts', 'GET'],
    ['/api/accounting/journal-entries', 'POST'],
    ['/api/accounting/invoices', 'GET'],
    ['/api/accounting/banking/accounts', 'GET'],
    ['/api/expenses/pendientes', 'GET'],
    ['/api/employee-payments/preview-period', 'GET'],
    ['/api/employee-payments/prenomina/batch', 'POST'],
    ['/api/overtime-approvals', 'GET'],
    ['/erp/contabilidad', 'GET'],
    ['/erp/contabilidad/pre-nomina', 'GET'],
    ['/erp/contabilidad/cuentas-por-cobrar', 'GET'],
    ['/erp/finance/prenomina', 'GET'],
    ['/erp/finance/employee-payments', 'GET'],
    ['/erp/invoicing/123', 'GET'],
    ['/api/cotizaciones/88', 'GET'],
  ];

  it.each(suyas)('permite %s %s', (url, method) => {
    expect(puede(ROLES.CONTABILIDAD, url, method)).toBe(true);
  });

  it('tiene los permisos contables que exigen los controladores', () => {
    for (const permiso of [
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.CONTABILIDAD_MANAGE,
      PERMISSIONS.ACCOUNTING_VIEW,
      PERMISSIONS.ACCOUNTING_MANAGE,
      PERMISSIONS.INVOICING_VIEW,
      PERMISSIONS.INVOICING_MANAGE,
      PERMISSIONS.BANKING_VIEW,
      PERMISSIONS.BANKING_MANAGE,
    ]) {
      expect(permisosContadora).toContain(permiso);
    }
  });

  it('el dashboard del workspace acepta su permiso contable', () => {
    const exigidos = [
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.INVOICING_VIEW,
      PERMISSIONS.CONSOLE_ADMIN,
    ];
    expect(exigidos.some((p) => permisosContadora.includes(p))).toBe(true);
  });
});

describe('CONTADORA · herramientas y préstamos (403)', () => {
  it('no administra el inventario de herramientas', () => {
    expect(permisosContadora).not.toContain(PERMISSIONS.TOOLS_MANAGE);
    expect(permisosContadora).not.toContain(PERMISSIONS.TOOLS_INVENTORY);
    expect(hasToolsManageAccess(CORREO_CONTADORA, permisosContadora)).toBe(false);
    expect(() => assertCanManageTools(CORREO_CONTADORA)).toThrow();
  });

  it('no aprueba préstamos de herramienta (ni el suyo)', () => {
    // `POST /api/tool-requests/:id/approve` exige TOOLS_MANAGE + lista de correos.
    expect(() => assertCanCreateToolLoan(CORREO_CONTADORA)).toThrow();
  });

  it('no puede tocar el inventario ni las aprobaciones por URL', () => {
    expect(puede(ROLES.CONTABILIDAD, '/api/tool-requests/inventory')).toBe(false);
    expect(puede(ROLES.CONTABILIDAD, '/api/tool-requests/7/approve', 'POST')).toBe(false);
    expect(puede(ROLES.CONTABILIDAD, '/api/tool-requests/kits/assign', 'POST')).toBe(false);
  });

  it('pedir herramienta para sí misma sigue permitido (no es administrar)', () => {
    expect(permisosContadora).toContain(PERMISSIONS.TOOLS_REQUEST);
  });
});

describe('CONTADORA · administración de usuarios y RBAC (403)', () => {
  it('no recibe permisos de gobierno', () => {
    for (const permiso of [
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.USERS_REVIEW,
      PERMISSIONS.ROLES_MANAGE,
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.COMPANY_SETTINGS_MANAGE,
      PERMISSIONS.AUDIT_VIEW,
    ]) {
      expect(permisosContadora).not.toContain(permiso);
    }
  });

  const vedadas: Array<[string, 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE']> = [
    ['/erp/users', 'GET'],
    ['/api/users', 'GET'],
    ['/api/users', 'POST'],
    ['/api/users/42', 'PATCH'],
    ['/api/roles', 'GET'],
    ['/api/roles/3', 'PATCH'],
    ['/erp/settings', 'GET'],
    ['/erp/companies', 'GET'],
    ['/erp/architecture', 'GET'],
  ];

  it.each(vedadas)('niega %s %s', (url, method) => {
    expect(puede(ROLES.CONTABILIDAD, url, method)).toBe(false);
  });

  it('su propio perfil sí (no es administrar a terceros)', () => {
    expect(puede(ROLES.CONTABILIDAD, '/api/users/me')).toBe(true);
    expect(puede(ROLES.CONTABILIDAD, '/erp/my-profile')).toBe(true);
  });
});

describe('CONTADORA · módulos que no le corresponden (403)', () => {
  const ajenas = [
    '/erp/analytics/bi',
    '/ops/actividades',
    '/ops/projects',
    '/studio/content',
    '/erp/hr/employees',
    '/erp/almacen',
    '/integra/video',
    '/tickets',
  ];

  it.each(ajenas)('niega %s', (url) => {
    expect(puede(ROLES.CONTABILIDAD, url)).toBe(false);
  });

  it('no recibe permisos de RH, BI, compras ni almacén', () => {
    for (const permiso of [
      PERMISSIONS.HR_VIEW,
      PERMISSIONS.HR_MANAGE,
      PERMISSIONS.BI_VIEW,
      PERMISSIONS.PROCUREMENT_APPROVE,
      PERMISSIONS.STOCK_MANAGE,
      PERMISSIONS.WAREHOUSE_MANAGE,
      PERMISSIONS.GPS_MANAGE,
    ]) {
      expect(permisosContadora).not.toContain(permiso);
    }
  });
});

describe('Otros roles · el workspace contable les responde 403', () => {
  const sinContabilidad = [
    ROLES.ING_CAMPO,
    ROLES.ING_SOPORTE,
    ROLES.VENDEDOR,
    ROLES.COORD_VENTAS,
    ROLES.DISENADOR,
    ROLES.LIDER_DISENO,
    ROLES.RH,
    ROLES.COORD_OPERACIONES,
    ROLES.CLIENTE,
  ];

  it.each(sinContabilidad)('%s no entra a /api/accounting/workspace/**', (role) => {
    expect(puede(role, '/api/accounting/workspace/dashboard')).toBe(false);
    expect(puede(role, '/api/accounting/workspace/ledger')).toBe(false);
  });

  it.each(sinContabilidad)('%s tampoco abre el hub /erp/contabilidad', (role) => {
    expect(puede(role, '/erp/contabilidad')).toBe(false);
    expect(puede(role, '/erp/contabilidad/movimientos')).toBe(false);
  });

  it.each(sinContabilidad)('%s no obtiene contabilidad.view ni accounting.view', (role) => {
    const permisos = permisosDelRol(role, `${role}@nexara.com.mx`);
    expect(permisos).not.toContain(PERMISSIONS.CONTABILIDAD_VIEW);
    expect(permisos).not.toContain(PERMISSIONS.ACCOUNTING_VIEW);
  });

  it('RH ve prenómina por su lado, pero no el workspace contable', () => {
    expect(puede(ROLES.RH, '/erp/finance/prenomina')).toBe(true);
    expect(puede(ROLES.RH, '/api/accounting/workspace/dashboard')).toBe(false);
  });

  it('dirección administrativa sí entra (es su alcance)', () => {
    expect(puede(ROLES.DIR_ADMIN, '/api/accounting/workspace/dashboard')).toBe(true);
    expect(puede(ROLES.COORD_ADMIN, '/api/accounting/workspace/dashboard')).toBe(true);
  });
});

describe('Aislamiento por empresa del workspace contable', () => {
  it('sin empresa activa, la consulta no se ejecuta: 403', () => {
    expect(() => requireCompanyId(null)).toThrow();
    expect(() => requireCompanyId(undefined)).toThrow();
    expect(() => requireCompanyId(0)).toThrow();
    expect(requireCompanyId(7)).toBe(7);
  });

  it('sin empresa, el filtro Prisma niega todo en vez de abrir el tenant', () => {
    const sinEmpresa = companyWhere(null);
    // Nunca `{}`: un where vacío devolvería filas de TODAS las empresas.
    expect(Object.keys(sinEmpresa).length).toBeGreaterThan(0);
    expect(sinEmpresa).not.toEqual({});
    expect(companyWhere(7)).toEqual({ companyId: 7 });
  });

  it('el dashboard exige companyId antes de consultar', async () => {
    const servicio = Object.create(AccountingService.prototype) as {
      getWorkspaceDashboard: (c: number | null) => Promise<unknown>;
    };
    await expect(servicio.getWorkspaceDashboard(null)).rejects.toThrow();
  });
});
