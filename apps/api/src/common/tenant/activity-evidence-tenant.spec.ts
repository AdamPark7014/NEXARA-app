import { TENANT_SCOPED_MODELS } from './tenant-models.js';
import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('iter23 activity evidence + delete middleware models', () => {
  it('registers ActivityEvidence as tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('ActivityEvidence')).toBe(true);
  });

  it('models evidence scoped by company', () => {
    const tenantId = requireCompanyId(6);
    expect({ ...companyWhere(tenantId), activityId: 10 }).toEqual({
      companyId: 6,
      activityId: 10,
    });
  });
});
