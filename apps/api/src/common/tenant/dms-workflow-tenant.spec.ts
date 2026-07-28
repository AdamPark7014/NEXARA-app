import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('DMS/workflow tenant contract', () => {
  it('document numbers and categories are per-tenant', () => {
    expect(companyWhere(2)).toEqual({ companyId: 2 });
    expect(() => requireCompanyId(null)).toThrow(/Empresa requerida/);
  });

  it('workflow definition lookup shape includes company + entityType', () => {
    const where = {
      entityType: 'SALES_PROJECT',
      status: 'ACTIVE',
      ...companyWhere(5),
    };
    expect(where).toEqual({
      entityType: 'SALES_PROJECT',
      status: 'ACTIVE',
      companyId: 5,
    });
  });
});
