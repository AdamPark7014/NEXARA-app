import { TENANT_SCOPED_MODELS } from './tenant-models.js';
import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('iter22 mutate-by-id + stock/sheet/hr uniques', () => {
  it('registers stock/sheet models', () => {
    expect(TENANT_SCOPED_MODELS.has('ServiceSheet')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('WarehouseLocation')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('StockLevel')).toBe(true);
  });

  it('models HR day uniqueness per company', () => {
    const tenantId = requireCompanyId(4);
    expect({
      ...companyWhere(tenantId),
      userId: 12,
      date: '2026-07-26',
    }).toMatchObject({ companyId: 4, userId: 12 });
  });
});
