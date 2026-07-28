import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('iter29 user-directory membership filters', () => {
  it('models exports/chat/ventas membership where', () => {
    const tenantId = requireCompanyId(12);
    expect({
      isActive: true,
      companyMemberships: { some: companyWhere(tenantId) },
    }).toEqual({
      isActive: true,
      companyMemberships: { some: { companyId: 12 } },
    });
  });

  it('models public-team company resolution priority', () => {
    const fromEnv = Number(process.env.PUBLIC_COMPANY_ID) || null;
    const fromHeader = 5;
    const resolved = fromEnv && fromEnv > 0 ? fromEnv : fromHeader;
    expect(requireCompanyId(resolved)).toBe(resolved);
  });
});
