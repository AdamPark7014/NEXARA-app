import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('ops/sales tenant stamps contract', () => {
  it('scopes work projects / fines / tools by companyId', () => {
    expect(companyWhere(9)).toEqual({ companyId: 9 });
    expect(() => requireCompanyId(undefined)).toThrow(/Empresa requerida/);
  });

  it('order template default is per-tenant shape', () => {
    const where = { isDefault: true, ...companyWhere(4) };
    expect(where).toEqual({ isDefault: true, companyId: 4 });
  });
});
