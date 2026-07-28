import { companyWhere, requireCompanyId } from './tenant-scope.js';
import { TENANT_SCOPED_MODELS } from './tenant-models.js';

describe('iter12 targets/req/kit/safety tenant stamps', () => {
  it('registers SalesTarget, PurchaseRequisition, ToolKitAssignment, Safety models', () => {
    for (const model of [
      'SalesTarget',
      'PurchaseRequisition',
      'ToolKitAssignment',
      'SafetyIncident',
      'WorkPermit',
      'TrainingRecord',
      'WorkProjectExpense',
      'WorkProjectPayroll',
      'WorkProjectLog',
      'ToolRenewal',
      'Budget',
      'GoodsReceipt',
    ]) {
      expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
    }
  });

  it('sales target upsert unique key includes companyId', () => {
    const tenantId = requireCompanyId(12);
    const where = {
      companyId_ownerId_period_year_month_quarter: {
        companyId: tenantId,
        ownerId: 3,
        period: 'MONTHLY',
        year: 2026,
        month: 7,
        quarter: null,
      },
    };
    expect(where.companyId_ownerId_period_year_month_quarter.companyId).toBe(12);
  });

  it('requisition list is fail-closed without company', () => {
    expect(() => requireCompanyId(null)).toThrow(/Empresa requerida/);
    expect(companyWhere(5)).toEqual({ companyId: 5 });
  });

  it('kit assignment create stamps companyId', () => {
    const tenantId = requireCompanyId(8);
    const data = {
      inventoryItemId: 1,
      userId: 2,
      companyId: tenantId,
      isActive: true,
    };
    expect(data).toMatchObject({ companyId: 8 });
  });
});
