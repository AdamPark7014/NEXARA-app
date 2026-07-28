import { TENANT_SCOPED_MODELS } from './tenant-models.js';
import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('iter18 Activity.anNumber + IdempotencyKey tenant scope', () => {
  it('keeps Activity tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('Activity')).toBe(true);
  });

  it('models per-tenant activity number uniqueness', () => {
    const tenantId = requireCompanyId(7);
    expect({ ...companyWhere(tenantId), anNumber: 'AN-0001' }).toEqual({
      companyId: 7,
      anNumber: 'AN-0001',
    });
  });

  it('models per-tenant idempotency compound key', () => {
    const tenantId = requireCompanyId(3);
    expect({
      companyId: tenantId,
      key: 'req-1',
      method: 'POST',
      path: '/api/invoices',
    }).toMatchObject(companyWhere(3));
  });
});
