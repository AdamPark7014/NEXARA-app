import { HrService } from './hr.service.js';

describe('HrService performance reviews tenant IDOR', () => {
  const prisma = {
    performanceReview: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const svc = new HrService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('listReviews requires companyId', async () => {
    await expect(svc.listReviews(undefined, undefined, null)).rejects.toThrow(/Empresa requerida/);
    expect(prisma.performanceReview.findMany).not.toHaveBeenCalled();
  });

  it('getReview scopes and denies missing row', async () => {
    prisma.performanceReview.findFirst.mockResolvedValue(null);
    await expect(svc.getReview(5, 10)).rejects.toThrow();
    expect(prisma.performanceReview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 5, companyId: 10 }),
      }),
    );
  });

  it('createReview stamps companyId', async () => {
    prisma.performanceReview.create.mockResolvedValue({ id: 1 });
    await svc.createReview(
      {
        userId: 2,
        period: 'ANNUAL',
        reviewDate: '2026-01-01',
        overallRating: 4,
      },
      3,
      77,
    );
    expect(prisma.performanceReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 77, reviewerId: 3 }),
      }),
    );
  });
});
