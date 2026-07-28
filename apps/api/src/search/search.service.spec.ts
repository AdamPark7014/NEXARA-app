import { SearchService } from './search.service.js';

describe('SearchService tenant IDOR', () => {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([]) },
    salesClient: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Acme', legalName: null, status: 'ACTIVE' }]) },
    salesProject: { findMany: jest.fn().mockResolvedValue([]) },
    operationalProject: { findMany: jest.fn().mockResolvedValue([]) },
    activity: { findMany: jest.fn().mockResolvedValue([]) },
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    asset: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleAsset: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const svc = new SearchService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects missing companyId (no cross-tenant search)', async () => {
    await expect(svc.globalSearch('acme', null)).rejects.toThrow(/Empresa requerida/);
    expect(prisma.salesClient.findMany).not.toHaveBeenCalled();
  });

  it('scopes sales clients to active companyId', async () => {
    await svc.globalSearch('acme', 42);
    expect(prisma.salesClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 42 }),
      }),
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyMemberships: { some: { companyId: 42 } },
        }),
      }),
    );
  });
});
