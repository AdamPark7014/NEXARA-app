// El runner de apps/api es jest (`jest.config.js`), no vitest: el `import from 'vitest'`
// que traía este archivo hacía fallar la suite entera antes de ejecutar un solo caso, así
// que este contrato de autorización llevaba tiempo sin verificarse. describe/it/expect son
// globales de jest, y los imports son estáticos porque jest corre en CommonJS: el `import()`
// dinámico exigiría --experimental-vm-modules.
import 'reflect-metadata';
import { PERMISSIONS } from '../common/permissions.js';
import { AccountingService } from './accounting.service.js';
import { AccountingWorkspaceController } from './workspace.controller.js';

/**
 * Contrato de autorización del panel de la contadora.
 *
 * Lee el metadata @RBAC real del controlador en vez de reimplementar la regla
 * aquí: si alguien afloja el decorador, esta prueba lo caza. La versión previa
 * copiaba la lista de permisos dentro del test, así que habría seguido en verde
 * aunque el endpoint quedara abierto.
 */

function rbacDe(metodo: keyof AccountingWorkspaceController) {
  return Reflect.getMetadata(
    'rbac',
    AccountingWorkspaceController.prototype[metodo] as unknown as object,
  ) as { anyPermissions?: string[]; permissions?: string[] } | undefined;
}

describe('autorización del panel de contabilidad', () => {
  const rbac = rbacDe('dashboard');

  it('el endpoint declara permisos explícitos', () => {
    expect(rbac).toBeDefined();
    expect(Array.isArray(rbac?.anyPermissions)).toBe(true);
    expect(rbac?.anyPermissions?.length).toBeGreaterThan(0);
  });

  it('contabilidad, facturación y admin de consola pueden verlo', () => {
    expect(rbac?.anyPermissions).toContain(PERMISSIONS.CONTABILIDAD_VIEW);
    expect(rbac?.anyPermissions).toContain(PERMISSIONS.INVOICING_VIEW);
    expect(rbac?.anyPermissions).toContain(PERMISSIONS.CONSOLE_ADMIN);
  });

  it('no se cuela ningún permiso de campo ni de herramientas', () => {
    const concedidos = rbac?.anyPermissions ?? [];
    const prohibidos = concedidos.filter((p) =>
      /^(ops|activities|tools|inventory)\./.test(p),
    );
    expect(prohibidos).toEqual([]);
  });
});

describe('contrato de getWorkspaceDashboard', () => {
  it('el método existe en AccountingService', () => {
    expect(typeof AccountingService.prototype.getWorkspaceDashboard).toBe('function');
  });

  it('acepta empresa y rango de fechas', () => {
    expect(AccountingService.prototype.getWorkspaceDashboard.length).toBeGreaterThanOrEqual(3);
  });
});
