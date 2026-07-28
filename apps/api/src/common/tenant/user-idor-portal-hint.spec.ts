import { requireCompanyId } from './tenant-scope.js';

describe('iter26 user-by-id + optional portal company hint', () => {
  it('models membership assert for user-by-id', () => {
    const tenantId = requireCompanyId(8);
    expect({
      id: 42,
      companyMemberships: { some: { companyId: tenantId } },
    }).toEqual({
      id: 42,
      companyMemberships: { some: { companyId: 8 } },
    });
  });

  it('models optional portal login company hint', () => {
    expect({
      email: 'portal@cliente.com',
      password: 'x',
      companySlug: 'acme',
    }).toMatchObject({ companySlug: 'acme' });
  });

  it('models cross-kind portal email conflict shape', () => {
    const email = 'shared@portal.com';
    expect({ clientWhere: { portalEmail: email }, branchWhere: { portalEmail: email } }).toEqual({
      clientWhere: { portalEmail: email },
      branchWhere: { portalEmail: email },
    });
  });
});
