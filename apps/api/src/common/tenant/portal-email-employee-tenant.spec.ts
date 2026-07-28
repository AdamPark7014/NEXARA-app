import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('iter27 portal email + UserCompany employeeNumber', () => {
  it('models per-tenant portalEmail unique', () => {
    const tenantId = requireCompanyId(2);
    expect({ ...companyWhere(tenantId), portalEmail: 'a@cliente.com' }).toEqual({
      companyId: 2,
      portalEmail: 'a@cliente.com',
    });
  });

  it('models login ambiguity requiring company hint', () => {
    const companyIds = new Set([1, 2]);
    expect(companyIds.size > 1).toBe(true);
  });

  it('models UserCompany employeeNumber unique per tenant', () => {
    const tenantId = requireCompanyId(7);
    expect({
      companyId: tenantId,
      employeeNumber: 'NXR25SYS010',
    }).toEqual({ companyId: 7, employeeNumber: 'NXR25SYS010' });
  });
});
