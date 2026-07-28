import {
  TENANT_DENY_ALL,
  assertCompanyAccess,
  companyWhere,
  mergeCompanyWhere,
  requireCompanyId,
} from './tenant-scope.js';

describe('tenant-scope (fail-closed)', () => {
  const prevNull = process.env.TENANT_ALLOW_NULL_ROWS;

  afterEach(() => {
    if (prevNull === undefined) delete process.env.TENANT_ALLOW_NULL_ROWS;
    else process.env.TENANT_ALLOW_NULL_ROWS = prevNull;
  });

  it('companyWhere never returns empty object without companyId', () => {
    expect(companyWhere(null)).toEqual(TENANT_DENY_ALL);
    expect(companyWhere(undefined)).toEqual(TENANT_DENY_ALL);
    expect(companyWhere(NaN)).toEqual(TENANT_DENY_ALL);
    expect(companyWhere(0)).toEqual(TENANT_DENY_ALL);
    expect(companyWhere(-5)).toEqual(TENANT_DENY_ALL);
  });

  it('companyWhere hard scopes to companyId', () => {
    expect(companyWhere(42)).toEqual({ companyId: 42 });
    expect(companyWhere(7, 'soft')).toEqual({
      OR: [{ companyId: 7 }, { companyId: null }],
    });
  });

  it('requireCompanyId throws without valid id', () => {
    expect(() => requireCompanyId(null)).toThrow();
    expect(() => requireCompanyId(0)).toThrow();
    expect(requireCompanyId(3)).toBe(3);
  });

  it('assertCompanyAccess blocks cross-tenant and missing context', () => {
    expect(() => assertCompanyAccess({ companyId: 1 }, 2, 'X')).toThrow();
    expect(() => assertCompanyAccess({ companyId: 1 }, null, 'X')).toThrow();
    expect(() => assertCompanyAccess(null, 1, 'X')).toThrow();
    expect(() => assertCompanyAccess({ companyId: 9 }, 9, 'X')).not.toThrow();
  });

  it('assertCompanyAccess blocks null-stamped rows by default', () => {
    delete process.env.TENANT_ALLOW_NULL_ROWS;
    expect(() => assertCompanyAccess({ companyId: null }, 1, 'X')).toThrow();
  });

  it('mergeCompanyWhere AND-combines filters', () => {
    expect(mergeCompanyWhere({ status: 'OPEN' }, 5)).toEqual({
      AND: [{ status: 'OPEN' }, { companyId: 5 }],
    });
    expect(mergeCompanyWhere(undefined, null)).toEqual(TENANT_DENY_ALL);
  });
});
