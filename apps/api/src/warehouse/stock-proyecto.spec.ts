import { WarehouseService } from './warehouse.service.js';

function fixture() {
  const tx = {
    stockMovement: { create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, id: 1, product: { name: 'Cable' } })) },
  };
  const prisma = {
    productPackaging: { findMany: jest.fn().mockResolvedValue([]) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    operationalProject: { findFirst: jest.fn().mockResolvedValue({ id: 8 }) },
    activity: { findFirst: jest.fn().mockResolvedValue({ id: 9, projectId: 8 }) },
    $transaction: jest.fn(async fn => fn(tx)),
  };
  const service = new WarehouseService(prisma as any,
    { notifyStockMovementPosted: jest.fn().mockResolvedValue(null) } as any,
    { postInventoryIssueCogs: jest.fn().mockResolvedValue(null) } as any,
    { next: jest.fn().mockResolvedValue('SM-1') } as any, { publish: jest.fn() } as any);
  for (const nombre of ['decrementStockLevel', 'emitRealtimeLowStockAlerts']) (service as any)[nombre] = jest.fn().mockResolvedValue(null);
  (service as any).readOnHandQty = jest.fn().mockResolvedValue(100);
  const dto = { type: 'DISPATCH', productId: 7, fromWarehouseId: 1, quantity: 2, unitCost: 10, projectId: 8 };
  return { service, prisma, tx, dto };
}

describe('salida directa a proyecto maestro', () => {
  it('valida empresa y conserva proyecto sin exigir una actividad', async () => {
    const f = fixture();
    await f.service.createStockMovement(f.dto, 3, 42);
    expect(f.prisma.operationalProject.findFirst).toHaveBeenCalledWith({ where: { id: 8, companyId: 42, deletedAt: null }, select: { id: true } });
    expect(f.tx.stockMovement.create.mock.calls[0][0].data).toMatchObject({ projectId: 8, activityId: null, companyId: 42 });
  });
  it('rechaza proyecto de otra empresa antes de mover stock', async () => {
    const f = fixture(); f.prisma.operationalProject.findFirst.mockResolvedValue(null);
    await expect(f.service.createStockMovement(f.dto, 3, 42)).rejects.toThrow('Proyecto no encontrado');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rechaza actividad que pertenece a otro proyecto', async () => {
    const f = fixture(); f.prisma.activity.findFirst.mockResolvedValue({ id: 9, projectId: 11 });
    await expect(f.service.createStockMovement({ ...f.dto, activityId: 9 }, 3, 42)).rejects.toThrow('La actividad no pertenece');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN])('rechaza id inválido %s', async projectId => {
    const f = fixture();
    await expect(f.service.createStockMovement({ ...f.dto, projectId }, 3, 42)).rejects.toThrow('Proyecto inválido');
  });
});
