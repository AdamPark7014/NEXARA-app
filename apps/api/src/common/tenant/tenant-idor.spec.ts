import { resolveRequiredCompanyId } from './tenant-scope.js';

describe('tenant IDOR deny (extra)', () => {
  it('resolveRequiredCompanyId does not silently fall back without env', async () => {
    const prev = process.env.TENANT_ALLOW_PRIMARY_FALLBACK;
    delete process.env.TENANT_ALLOW_PRIMARY_FALLBACK;
    const prisma = {
      companyProfile: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    try {
      await expect(resolveRequiredCompanyId(prisma as any, null)).rejects.toThrow(
        /Empresa requerida/,
      );
      expect(prisma.companyProfile.findFirst).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.TENANT_ALLOW_PRIMARY_FALLBACK;
      else process.env.TENANT_ALLOW_PRIMARY_FALLBACK = prev;
    }
  });
});
