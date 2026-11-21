import { WarehouseService } from './warehouse.service.js';

/**
 * Salida de almacén con evidencia (Adam, 21-11-2026): número de serie de cada pieza, quién se
 * lleva el material y las fotos, que también se pueden agregar después de registrar la salida.
 */
function fixture() {
  const tx = {
    stockMovement: {
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, id: 1, product: { name: 'Cámara' } })),
    },
  };
  const prisma = {
    productPackaging: { findMany: jest.fn().mockResolvedValue([]) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 4 }) },
    stockMovement: {
      findFirst: jest.fn().mockResolvedValue({ id: 1, quantity: 2, fotos: null, series: null }),
      update: jest.fn().mockImplementation(async ({ data }) => ({ id: 1, movementNumber: 'SM-1', ...data })),
    },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
  const service = new WarehouseService(
    prisma as any,
    { notifyStockMovementPosted: jest.fn().mockResolvedValue(null) } as any,
    { postInventoryIssueCogs: jest.fn().mockResolvedValue(null) } as any,
    { next: jest.fn().mockResolvedValue('SM-1') } as any,
    { publish: jest.fn() } as any,
  );
  for (const nombre of ['decrementStockLevel', 'emitRealtimeLowStockAlerts']) {
    (service as any)[nombre] = jest.fn().mockResolvedValue(null);
  }
  (service as any).readOnHandQty = jest.fn().mockResolvedValue(100);
  const dto = { type: 'DISPATCH', productId: 7, fromWarehouseId: 1, quantity: 2, unitCost: 10 };
  return { service, prisma, tx, dto };
}

describe('salida de almacén con evidencia', () => {
  it('guarda la serie de cada pieza y quién recibe', async () => {
    const f = fixture();
    await f.service.createStockMovement({ ...f.dto, series: ['ds-1', 'DS-2'], recibidoPorId: 4 }, 3, 42);
    expect(f.prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 4, isActive: true, companyMemberships: { some: { companyId: 42 } } },
      select: { id: true },
    });
    expect(f.tx.stockMovement.create.mock.calls[0][0].data).toMatchObject({
      series: ['DS-1', 'DS-2'],
      recibidoPorId: 4,
    });
  });

  it('una app anterior sigue sacando material sin serie ni responsable', async () => {
    const f = fixture();
    await f.service.createStockMovement(f.dto, 3, 42);
    const data = f.tx.stockMovement.create.mock.calls[0][0].data;
    expect(data.recibidoPorId).toBeNull();
    expect(data).not.toHaveProperty('series');
    expect(data).not.toHaveProperty('fotos');
    expect(f.prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('no deja más series que piezas ni mueve existencias', async () => {
    const f = fixture();
    await expect(f.service.createStockMovement({ ...f.dto, series: ['A', 'B', 'C'] }, 3, 42)).rejects.toThrow(
      /3 números de serie/,
    );
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('quien recibe tiene que ser personal activo de la empresa', async () => {
    const f = fixture();
    f.prisma.user.findFirst.mockResolvedValue(null);
    await expect(f.service.createStockMovement({ ...f.dto, recibidoPorId: 99 }, 3, 42)).rejects.toThrow(
      /no es personal activo/,
    );
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('agregar evidencia suma fotos y series a la salida ya registrada', async () => {
    const f = fixture();
    f.prisma.stockMovement.findFirst.mockResolvedValue({
      id: 1,
      quantity: 2,
      fotos: [{ url: '/uploads/almacen/a.jpg' }],
      series: ['S1'],
    });
    await f.service.agregarEvidenciaMovimiento(1, { fotos: [{ url: '/uploads/almacen/b.jpg' }], series: 's2' }, 42);
    expect(f.prisma.stockMovement.update.mock.calls[0][0].data).toEqual({
      fotos: [{ url: '/uploads/almacen/a.jpg' }, { url: '/uploads/almacen/b.jpg' }],
      series: ['S1', 'S2'],
    });
  });

  it('no agrega evidencia a un movimiento de otra empresa', async () => {
    const f = fixture();
    f.prisma.stockMovement.findFirst.mockResolvedValue(null);
    await expect(f.service.agregarEvidenciaMovimiento(1, { series: 'S1' }, 42)).rejects.toThrow(
      'Movimiento no encontrado',
    );
    expect(f.prisma.stockMovement.update).not.toHaveBeenCalled();
  });

  it('agregar evidencia vacía no escribe nada', async () => {
    const f = fixture();
    await expect(f.service.agregarEvidenciaMovimiento(1, {}, 42)).rejects.toThrow(/al menos una foto/);
    expect(f.prisma.stockMovement.update).not.toHaveBeenCalled();
  });
});
