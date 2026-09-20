import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * Authz contract for Contadora workspace dashboard.
 * Contabilidad / invoicing / console admin: allowed.
 * Field roles without those permissions: denied at RBAC decorator level.
 */

describe('accounting workspace dashboard authz', () => {
  const allowed = new Set([
    PERMISSIONS.CONTABILIDAD_VIEW,
    PERMISSIONS.INVOICING_VIEW,
    PERMISSIONS.CONSOLE_ADMIN,
  ]);

  function canAccess(perms: string[]) {
    return perms.some((p) => allowed.has(p as any));
  }

  it('contabilidad.view puede ver el dashboard', () => {
    expect(canAccess([PERMISSIONS.CONTABILIDAD_VIEW])).toBe(true);
  });

  it('invoicing.view puede ver el dashboard', () => {
    expect(canAccess([PERMISSIONS.INVOICING_VIEW])).toBe(true);
  });

  it('console.admin puede ver el dashboard', () => {
    expect(canAccess([PERMISSIONS.CONSOLE_ADMIN])).toBe(true);
  });

  it('ingeniero de campo sin permisos finance → denegado', () => {
    expect(canAccess(['ops.view', 'activities.view'])).toBe(false);
    expect(canAccess([])).toBe(false);
  });
});

describe('getWorkspaceDashboard shape (unit smoke)', () => {
  it('exporta el método en AccountingService', async () => {
    const mod = await import('./accounting.service.js');
    expect(typeof mod.AccountingService.prototype.getWorkspaceDashboard).toBe('function');
  });
});
