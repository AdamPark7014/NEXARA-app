import { companyWhere, requireCompanyId, assertCompanyAccess, TENANT_DENY_ALL } from './tenant-scope.js';
import { TENANT_SCOPED_MODELS } from './tenant-models.js';

describe('iter21 IDOR fail-closed contracts', () => {
  it('deny-all when company context missing', () => {
    expect(companyWhere(undefined)).toEqual(TENANT_DENY_ALL);
    expect(companyWhere(0)).toEqual(TENANT_DENY_ALL);
    expect(() => requireCompanyId(null)).toThrow();
  });

  it('assertCompanyAccess hides cross-tenant rows as 404', () => {
    expect(() =>
      assertCompanyAccess({ companyId: 2, id: 1 }, 1, 'Recurso'),
    ).toThrow(/no encontrado/i);
  });

  it('assertCompanyAccess allows matching tenant', () => {
    const row = { companyId: 5, id: 9 };
    assertCompanyAccess(row, 5, 'Recurso');
    expect(row.companyId).toBe(5);
  });

  it('critical child models stay middleware-scoped', () => {
    for (const model of [
      'ServiceClientBranch',
      'BankTransaction',
      'BankReconciliation',
      'ChatMessage',
      'VehicleControl',
      'InventorySnapshot',
      'Payment',
    ]) {
      expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
    }
  });
});
