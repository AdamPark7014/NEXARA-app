import 'reflect-metadata';
import { PERMISSIONS } from '../common/permissions.js';
import { AccountingWorkspaceController } from './workspace.controller.js';

/**
 * Contrato de autorización del panel de la contadora.
 *
 * Lee el metadata @RBAC real del controlador en vez de reimplementar la regla
 * aquí: si alguien afloja el decorador, esta prueba lo caza. La versión previa
 * copiaba la lista de permisos dentro del test (y además importaba de vitest,
 * así que nunca llegó a correr bajo Jest).
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
  it('el método existe en AccountingService', async () => {
    const mod = await import('./accounting.service.js');
    expect(typeof mod.AccountingService.prototype.getWorkspaceDashboard).toBe(
      'function',
    );
  });

  it('acepta empresa y rango de fechas', async () => {
    const mod = await import('./accounting.service.js');
    expect(
      mod.AccountingService.prototype.getWorkspaceDashboard.length,
    ).toBeGreaterThanOrEqual(3);
  });
});
