import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('iter25 user-plane + portal tenant increments', () => {
  it('models UserCompany membership filter shape', () => {
    const tenantId = requireCompanyId(11);
    expect({
      companyMemberships: { some: companyWhere(tenantId) },
    }).toEqual({
      companyMemberships: { some: { companyId: 11 } },
    });
  });

  it('models portal JWT company claim', () => {
    const tenantId = requireCompanyId(3);
    expect({
      sub: 'portal:client:9',
      companyId: tenantId,
      portalType: 'client',
    }).toMatchObject({ companyId: 3 });
  });

  it('models employeeNumber peer scope by membership', () => {
    const tenantId = requireCompanyId(5);
    expect({
      employeeNumber: 'NXR25SYS001',
      companyMemberships: { some: { companyId: tenantId } },
    }).toMatchObject({
      companyMemberships: { some: { companyId: 5 } },
    });
  });
});
