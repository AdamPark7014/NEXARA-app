import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';

describe('ActivitiesService.remove', () => {
  const activity = {
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const realtime = { emitToCompany: jest.fn() };

  function service() {
    return new ActivitiesService(
      { activity } as never,
      {} as never,
      { publishEntityLifecycle: jest.fn() } as never,
      realtime as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('responde 403 a cualquiera que no sea el usuario 1 y no toca la base', async () => {
    await expect(service().remove(9, 3, 2)).rejects.toBeInstanceOf(ForbiddenException);
    expect(activity.findFirst).not.toHaveBeenCalled();
    expect(activity.update).not.toHaveBeenCalled();
    expect(activity.delete).not.toHaveBeenCalled();
    expect(realtime.emitToCompany).not.toHaveBeenCalled();
  });

  it('el usuario 1 marca deletedAt y deletedById y avisa a la pizarra', async () => {
    activity.findFirst.mockResolvedValue({ id: 9, companyId: 3, anNumber: 'AN-0001' });
    activity.update.mockResolvedValue({ id: 9, companyId: 3, anNumber: 'AN-0001' });

    const out = await service().remove(9, 3, 1);

    expect(activity.delete).not.toHaveBeenCalled();
    expect(activity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 9, deletedAt: null, companyId: 3 }),
      }),
    );
    const data = activity.update.mock.calls[0][0].data;
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(data.deletedById).toBe(1);
    expect(realtime.emitToCompany).toHaveBeenCalledWith(3, 'activity:updated', {
      id: 9,
      anNumber: 'AN-0001',
      deleted: true,
    });
    expect(out).toEqual({ id: 9, anNumber: 'AN-0001', deleted: true });
  });

  it('no encuentra una actividad ya borrada o de otra empresa', async () => {
    activity.findFirst.mockResolvedValue(null);
    await expect(service().remove(9, 3, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(activity.update).not.toHaveBeenCalled();
  });
});
