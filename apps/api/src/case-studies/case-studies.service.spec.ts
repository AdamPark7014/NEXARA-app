import { CaseStudiesService } from './case-studies.service.js';

describe('CaseStudiesService tenant IDOR', () => {
  const prisma = {
    caseStudy: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const svc = new CaseStudiesService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('findOne rejects missing companyId', async () => {
    await expect(svc.findOne(1, null)).rejects.toThrow(/Empresa requerida|company/i);
    expect(prisma.caseStudy.findFirst).not.toHaveBeenCalled();
  });

  it('findOne scopes by companyId', async () => {
    prisma.caseStudy.findFirst.mockResolvedValue({ id: 1, companyId: 42, titulo: 'x' });
    await svc.findOne(1, 42);
    expect(prisma.caseStudy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 1, companyId: 42 }),
      }),
    );
  });

  it('findOne denies foreign tenant row', async () => {
    prisma.caseStudy.findFirst.mockResolvedValue(null);
    await expect(svc.findOne(9, 42)).rejects.toThrow();
  });
});
