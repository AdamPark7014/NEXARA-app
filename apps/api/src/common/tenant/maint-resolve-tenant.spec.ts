import { TENANT_SCOPED_MODELS } from './tenant-models.js';
import { companyWhere, requireCompanyId, resolveRequiredCompanyId } from './tenant-scope.js';

describe('iter16 maintenance schedule + resolveCompanyId', () => {
  it('registers MaintenanceSchedule as tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('MaintenanceSchedule')).toBe(true);
  });

  it('schedule list scopes by companyId directly', () => {
    const tenantId = requireCompanyId(9);
    expect({ ...companyWhere(tenantId), isActive: true }).toEqual({
      companyId: 9,
      isActive: true,
    });
  });

  it('resolveRequiredCompanyId is fail-closed without fallback env', async () => {
    const prev = process.env.TENANT_ALLOW_PRIMARY_FALLBACK;
    delete process.env.TENANT_ALLOW_PRIMARY_FALLBACK;
    const prisma = {
      companyProfile: {
        findFirst: async () => ({ id: 1 }),
      },
    };
    await expect(resolveRequiredCompanyId(prisma as any, null)).rejects.toThrow(/Empresa requerida/);
    if (prev !== undefined) process.env.TENANT_ALLOW_PRIMARY_FALLBACK = prev;
  });
});
