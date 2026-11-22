import { seriesQueSiguenFuera } from './evidencia-salida.js';
import { WarehouseService } from './warehouse.service.js';

/**
 * Un número de serie es una pieza: si ya salió del almacén y no ha regresado, no puede volver a
 * salir. Antes se podía registrar la misma serie en dos salidas (una etiqueta leída dos veces, o
 * tecleada mal) y el historial decía que la misma cámara estaba en dos obras.
 */
describe('series que siguen fuera del almacén', () => {
  const mov = (type: string, series: string[], createdAt: string, movementNumber = `SM-${createdAt.slice(8, 10)}`) => ({
    type,
    series,
    createdAt: new Date(createdAt),
    movementNumber,
  });

  it('la que salió y no ha regresado sigue fuera, con el folio de su salida', () => {
    const fuera = seriesQueSiguenFuera(['DS-1', 'DS-2'], [mov('DISPATCH', ['DS-1'], '2026-11-10T16:00:00Z', 'SM-10')]);

    expect(fuera).toEqual([{ serie: 'DS-1', movementNumber: 'SM-10' }]);
  });

  it('si regresó después de salir, puede volver a salir', () => {
    const historial = [
      mov('DISPATCH', ['DS-1'], '2026-11-10T16:00:00Z'),
      mov('RETURN', ['DS-1'], '2026-11-12T16:00:00Z'),
    ];

    expect(seriesQueSiguenFuera(['DS-1'], historial)).toEqual([]);
  });

  it('cuenta el movimiento más reciente, venga el historial en el orden que venga', () => {
    const historial = [
      mov('RETURN', ['DS-1'], '2026-11-12T16:00:00Z'),
      mov('DISPATCH', ['DS-1'], '2026-11-15T16:00:00Z', 'SM-15'),
      mov('DISPATCH', ['DS-1'], '2026-11-10T16:00:00Z', 'SM-10'),
    ];

    expect(seriesQueSiguenFuera(['DS-1'], historial)).toEqual([{ serie: 'DS-1', movementNumber: 'SM-15' }]);
  });

  it('una transferencia entre almacenes no la saca; una baja sí', () => {
    expect(seriesQueSiguenFuera(['DS-1'], [mov('TRANSFER', ['DS-1'], '2026-11-10T16:00:00Z')])).toEqual([]);
    expect(seriesQueSiguenFuera(['DS-1'], [mov('SCRAP', ['DS-1'], '2026-11-10T16:00:00Z', 'SM-10')])).toEqual([
      { serie: 'DS-1', movementNumber: 'SM-10' },
    ]);
  });

  it('lee las series guardadas como estén escritas', () => {
    const historial = [mov('DISPATCH', [' ds-1 '], '2026-11-10T16:00:00Z', 'SM-10')];

    expect(seriesQueSiguenFuera(['DS-1'], historial)).toEqual([{ serie: 'DS-1', movementNumber: 'SM-10' }]);
  });
});

function fixture(historial: unknown[] = []) {
  const tx = {
    stockMovement: {
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, id: 9, product: { name: 'Cámara' } })),
    },
  };
  const prisma = {
    productPackaging: { findMany: jest.fn().mockResolvedValue([]) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 4 }) },
    stockMovement: {
      findMany: jest.fn().mockResolvedValue(historial),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 9, type: 'DISPATCH', productId: 7, quantity: 2, fotos: null, series: ['DS-9'] }),
      update: jest.fn().mockImplementation(async ({ data }) => ({ id: 9, movementNumber: 'SM-9', ...data })),
    },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
  const service = new WarehouseService(
    prisma as any,
    { notifyStockMovementPosted: jest.fn().mockResolvedValue(null) } as any,
    { postInventoryIssueCogs: jest.fn().mockResolvedValue(null) } as any,
    { next: jest.fn().mockResolvedValue('SM-9') } as any,
    { publish: jest.fn() } as any,
  );
  for (const nombre of ['decrementStockLevel', 'incrementStockLevel', 'emitRealtimeLowStockAlerts']) {
    (service as any)[nombre] = jest.fn().mockResolvedValue(null);
  }
  (service as any).readOnHandQty = jest.fn().mockResolvedValue(100);
  const salida = { type: 'DISPATCH', productId: 7, fromWarehouseId: 1, quantity: 2, unitCost: 10 };
  return { service, prisma, tx, salida };
}

describe('una serie que ya salió no vuelve a salir', () => {
  const yaSalio = [{ id: 3, type: 'DISPATCH', series: ['DS-1'], movementNumber: 'SM-3', createdAt: new Date('2026-11-10T16:00:00Z') }];

  it('rechaza la salida, dice cuál serie y en qué movimiento salió, y no mueve existencias', async () => {
    const f = fixture(yaSalio);

    await expect(f.service.createStockMovement({ ...f.salida, series: ['ds-1', 'DS-2'] }, 3, 42)).rejects.toThrow(
      'La serie DS-1 ya salió en el movimiento SM-3 y no ha regresado. Revisa la etiqueta o registra primero su devolución.',
    );
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('busca solo en el mismo producto y en la misma empresa', async () => {
    const f = fixture();

    await f.service.createStockMovement({ ...f.salida, series: ['DS-1', 'DS-2'] }, 3, 42);

    expect(f.prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId: 7,
          companyId: 42,
          OR: [{ series: { array_contains: ['DS-1'] } }, { series: { array_contains: ['DS-2'] } }],
        },
      }),
    );
    expect(f.tx.stockMovement.create).toHaveBeenCalled();
  });

  it('con dos series repetidas las nombra a las dos', async () => {
    const f = fixture([
      ...yaSalio,
      { id: 5, type: 'DISPATCH', series: ['DS-2'], movementNumber: 'SM-5', createdAt: new Date('2026-11-11T16:00:00Z') },
    ]);

    await expect(f.service.createStockMovement({ ...f.salida, series: ['DS-1', 'DS-2'] }, 3, 42)).rejects.toThrow(
      'Las series DS-1 y DS-2 ya salieron (movimientos SM-3 y SM-5) y no han regresado. Revisa las etiquetas o registra primero su devolución.',
    );
  });

  it('la devolución de esa serie sí entra', async () => {
    const f = fixture(yaSalio);

    await f.service.createStockMovement({ type: 'RETURN', productId: 7, toWarehouseId: 1, quantity: 1, series: ['DS-1'] }, 3, 42);

    expect(f.tx.stockMovement.create).toHaveBeenCalled();
  });

  it('una salida sin series no consulta el historial', async () => {
    const f = fixture(yaSalio);

    await f.service.createStockMovement(f.salida, 3, 42);

    expect(f.prisma.stockMovement.findMany).not.toHaveBeenCalled();
  });

  it('tampoco se puede agregar después a otra salida', async () => {
    const f = fixture(yaSalio);

    await expect(f.service.agregarEvidenciaMovimiento(9, { series: 'DS-1' }, 42)).rejects.toThrow(
      /La serie DS-1 ya salió en el movimiento SM-3/,
    );
    expect(f.prisma.stockMovement.update).not.toHaveBeenCalled();
    // No se compara la salida contra sí misma.
    expect(f.prisma.stockMovement.findMany.mock.calls[0][0].where).toMatchObject({ id: { not: 9 }, productId: 7 });
  });

  it('agregar solo fotos a una salida no consulta el historial', async () => {
    const f = fixture(yaSalio);

    await f.service.agregarEvidenciaMovimiento(9, { fotos: [{ url: '/uploads/almacen/a.jpg' }] }, 42);

    expect(f.prisma.stockMovement.findMany).not.toHaveBeenCalled();
    expect(f.prisma.stockMovement.update).toHaveBeenCalled();
  });
});
