import { CompanyService } from './company.service.js';

/**
 * `resolveForUser` sin `X-Company-Id` — la app móvil nativa no manda el header.
 * Antes caía siempre a la empresa primaria y auto-inscribía al usuario en ella,
 * lo que sacaba a una cuenta acotada (la demo de revisión de tiendas) de su tenant.
 */
function makePrisma(pinnedCompanyId: number | null, membershipForWanted = true) {
  return {
    companyProfile: {
      findFirst: jest.fn().mockResolvedValue({ id: 1, isPrimary: true, isActive: true }),
      findUnique: jest.fn(({ where }: any) => Promise.resolve({ id: where.id })),
      create: jest.fn(),
    },
    userCompany: {
      findFirst: jest
        .fn()
        .mockResolvedValue(pinnedCompanyId == null ? null : { companyId: pinnedCompanyId }),
      findUnique: jest
        .fn()
        .mockResolvedValue(membershipForWanted ? { userId: 42, companyId: 1 } : null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('CompanyService.resolveForUser — tenant pinning sin header', () => {
  it('respeta la empresa default del usuario cuando no es la primaria', async () => {
    const prisma = makePrisma(7);
    const service = new CompanyService(prisma as any);

    const company = await service.resolveForUser({ userId: 42 });

    expect(company.id).toBe(7);
    // No debe auto-inscribir la cuenta en la empresa primaria.
    expect(prisma.userCompany.create).not.toHaveBeenCalled();
  });

  it('mantiene la empresa primaria cuando el default del usuario ya es la primaria', async () => {
    const prisma = makePrisma(1);
    const service = new CompanyService(prisma as any);

    const company = await service.resolveForUser({ userId: 42 });

    expect(company.id).toBe(1);
  });

  it('cae a la primaria cuando el usuario no tiene ninguna membresía default', async () => {
    const prisma = makePrisma(null);
    const service = new CompanyService(prisma as any);

    const company = await service.resolveForUser({ userId: 42 });

    expect(company.id).toBe(1);
  });

  it('con header explícito sigue exigiendo membresía', async () => {
    const prisma = makePrisma(7, false);
    const service = new CompanyService(prisma as any);

    await expect(service.resolveForUser({ userId: 42, companyId: 9 })).rejects.toThrow(
      /No tienes acceso a esta empresa/,
    );
  });

  it('super-admin no queda fijado al tenant demo', async () => {
    const prisma = makePrisma(7);
    const service = new CompanyService(prisma as any);

    const company = await service.resolveForUser({ userId: 42, isSuperAdmin: true });

    expect(company.id).toBe(1);
    expect(prisma.userCompany.findFirst).not.toHaveBeenCalled();
  });
});
