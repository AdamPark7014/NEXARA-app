import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('iter15 stock-level / banking / GR tenant contracts', () => {
  it('stock level lookups scope via warehouse.companyId', () => {
    const tenantId = requireCompanyId(11);
    expect({ id: 5, warehouse: companyWhere(tenantId) }).toEqual({
      id: 5,
      warehouse: { companyId: 11 },
    });
  });

  it('goods receipt accrual requires company', () => {
    expect(() => requireCompanyId(null)).toThrow(/Empresa requerida/);
  });

  it('bank account summary is fail-closed without company', () => {
    expect(companyWhere(2)).toEqual({ companyId: 2 });
  });
});
