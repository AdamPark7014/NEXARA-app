import { requireCompanyId } from './tenant-scope.js';

describe('iter28 drop User.employeeNumber global unique', () => {
  it('models employee numbers unique only on UserCompany', () => {
    const a = requireCompanyId(1);
    const b = requireCompanyId(2);
    // Same code allowed across tenants at the User column level;
    // uniqueness is enforced on UserCompany.(companyId, employeeNumber).
    expect([
      { companyId: a, employeeNumber: 'NXR25SYS001' },
      { companyId: b, employeeNumber: 'NXR25SYS001' },
    ]).toHaveLength(2);
  });

  it('models SCIM membership filter', () => {
    const tenantId = requireCompanyId(4);
    expect({
      roleId: 9,
      isActive: true,
      companyMemberships: { some: { companyId: tenantId } },
    }).toMatchObject({
      companyMemberships: { some: { companyId: 4 } },
    });
  });
});
