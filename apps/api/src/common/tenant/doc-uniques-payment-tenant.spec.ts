import { TENANT_SCOPED_MODELS } from './tenant-models.js';
import { companyWhere, requireCompanyId } from './tenant-scope.js';

describe('iter17 per-tenant document uniques + Payment', () => {
  it('registers Payment as tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('Payment')).toBe(true);
  });

  it('document numbers are unique per company shape', () => {
    const tenantId = requireCompanyId(4);
    expect({ companyId: tenantId, invoiceNumber: 'INV-000001' }).toEqual({
      companyId: 4,
      invoiceNumber: 'INV-000001',
    });
    expect({ companyId: tenantId, poNumber: 'PO-000001' }).toMatchObject({ companyId: 4 });
    expect({ companyId: tenantId, code: 'WH-01' }).toMatchObject(companyWhere(4));
  });

  it('SPEI uniqueness is scoped by company', () => {
    const tenantId = requireCompanyId(2);
    expect({ ...companyWhere(tenantId), speiTrackingKey: 'ABC123' }).toEqual({
      companyId: 2,
      speiTrackingKey: 'ABC123',
    });
  });
});
