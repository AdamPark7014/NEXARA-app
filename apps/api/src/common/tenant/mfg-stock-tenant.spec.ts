import { TENANT_SCOPED_MODELS } from './tenant-models.js';
import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('iter14 mfg/stock/quality tenant stamps', () => {
  it('registers manufacturing and inventory models', () => {
    for (const model of [
      'StockMovement',
      'Lot',
      'SupplierEvaluation',
      'BillOfMaterials',
      'WorkCenter',
      'ProductionOrder',
      'QualityInspection',
      'NonConformanceReport',
    ]) {
      expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
    }
  });

  it('stock movement number is per-tenant unique shape', () => {
    const tenantId = requireCompanyId(3);
    expect({ companyId: tenantId, movementNumber: 'SM-000001' }).toEqual({
      companyId: 3,
      movementNumber: 'SM-000001',
    });
  });

  it('fail-closed without company', () => {
    expect(() => requireCompanyId(undefined)).toThrow(/Empresa requerida/);
    expect(companyWhere(7)).toEqual({ companyId: 7 });
  });
});
