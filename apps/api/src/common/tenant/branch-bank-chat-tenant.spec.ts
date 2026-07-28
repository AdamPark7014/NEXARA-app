import { TENANT_SCOPED_MODELS } from './tenant-models.js';
import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('iter21 branch / bank / chat tenant stamps', () => {
  it('registers child models as tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('ServiceClientBranch')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('BankTransaction')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('BankReconciliation')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('ChatMessage')).toBe(true);
  });

  it('fail-closed companyWhere for branch/bank/chat shapes', () => {
    const tenantId = requireCompanyId(9);
    expect(companyWhere(tenantId)).toEqual({ companyId: 9 });
    expect(companyWhere(null)).toEqual({ companyId: -1 });
  });
});
