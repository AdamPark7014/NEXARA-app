import { avisoSeriesDentro, seriesQueYaEstanDentro } from './evidencia-salida.js';
import { WarehouseService } from './warehouse.service.js';

/**
 * Un número de serie es una pieza: la que ya está en almacén no se recibe otra vez. Antes la misma
 * etiqueta leída en dos recepciones (una entrega parcial, una caja escaneada dos veces) quedaba como
 * dos piezas con la misma serie, y al sacar una el historial ya no decía cuál seguía dentro.
 */
describe('series que ya están en almacén', () => {
  const mov = (type: string, series: string[], createdAt: string, movementNumber: string) => ({
    type,
    series,
    createdAt: new Date(createdAt),
    movementNumber,
  });

  it('la que se recibió y no ha salido ya está dentro, con el folio de su entrada', () => {
    const dentro = seriesQueYaEstanDentro(['DS-1', 'DS-2'], [mov('RECEIPT', ['DS-1'], '2026-11-10T16:00:00Z', 'SM-10')]);

    expect(dentro).toEqual([{ serie: 'DS-1', movementNumber: 'SM-10' }]);
  });

  it('si salió después de entrar, puede volver a recibirse (garantía, cambio físico)', () => {
    const historial = [
      mov('RECEIPT', ['DS-1'], '2026-11-10T16:00:00Z', 'SM-10'),
      mov('DISPATCH', ['DS-1'], '2026-11-12T16:00:00Z', 'SM-12'),
    ];

    expect(seriesQueYaEstanDentro(['DS-1'], historial)).toEqual([]);
  });

  it('la devuelta y la transferida entre almacenes también siguen dentro', () => {
    expect(seriesQueYaEstanDentro(['DS-1'], [mov('RETURN', ['DS-1'], '2026-11-10T16:00:00Z', 'SM-10')])).toHaveLength(1);
    expect(seriesQueYaEstanDentro(['DS-1'], [mov('TRANSFER', ['DS-1'], '2026-11-10T16:00:00Z', 'SM-10')])).toHaveLength(1);
  });

  it('un ajuste no dice si está dentro o fuera: no bloquea', () => {
    expect(seriesQueYaEstanDentro(['DS-1'], [mov('ADJUSTMENT', ['DS-1'], '2026-11-10T16:00:00Z', 'SM-10')])).toEqual([]);
  });

  it('el aviso dice cuál serie, en qué movimiento está y qué hacer', () => {
    expect(avisoSeriesDentro([{ serie: 'DS-1', movementNumber: 'SM-10' }])).toBe(
      'La serie DS-1 ya está registrada en almacén (movimiento SM-10). Revisa la etiqueta: una pieza no se recibe dos veces.',
    );
    expect(
      avisoSeriesDentro([
        { serie: 'DS-1', movementNumber: 'SM-10' },
        { serie: 'DS-2', movementNumber: 'SM-11' },
      ]),
    ).toBe(
      'Las series DS-1 y DS-2 ya están registradas en almacén (movimientos SM-10 y SM-11). Revisa las etiquetas: una pieza no se recibe dos veces.',
    );
  });
});

function fixture(historial: unknown[] = [], movimiento: Record<string, unknown> = {}) {
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
        .mockResolvedValue({ id: 9, type: 'RECEIPT', productId: 7, quantity: 2, fotos: null, series: ['DS-9'], ...movimiento }),
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
  const entrada = { type: 'RECEIPT', productId: 7, toWarehouseId: 1, quantity: 2, unitCost: 10 };
  return { service, prisma, tx, entrada };
}

describe('una serie que ya está en almacén no se recibe otra vez', () => {
  const yaEntro = [{ id: 3, type: 'RECEIPT', series: ['DS-1'], movementNumber: 'SM-3', createdAt: new Date('2026-11-10T16:00:00Z') }];

  it('rechaza la recepción, dice cuál serie y en qué movimiento está, y no mueve existencias', async () => {
    const f = fixture(yaEntro);

    await expect(f.service.createStockMovement({ ...f.entrada, series: ['ds-1', 'DS-2'] }, 3, 42)).rejects.toThrow(
      'La serie DS-1 ya está registrada en almacén (movimiento SM-3). Revisa la etiqueta: una pieza no se recibe dos veces.',
    );
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('busca solo en el mismo producto y en la misma empresa', async () => {
    const f = fixture();

    await f.service.createStockMovement({ ...f.entrada, series: ['DS-1'] }, 3, 42);

    expect(f.prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: 7, companyId: 42, OR: [{ series: { array_contains: ['DS-1'] } }] },
      }),
    );
    expect(f.tx.stockMovement.create).toHaveBeenCalled();
  });

  it('la que salió y vuelve a entrar por recepción sí entra', async () => {
    const f = fixture([
      ...yaEntro,
      { id: 5, type: 'DISPATCH', series: ['DS-1'], movementNumber: 'SM-5', createdAt: new Date('2026-11-12T16:00:00Z') },
    ]);

    await f.service.createStockMovement({ ...f.entrada, series: ['DS-1'] }, 3, 42);

    expect(f.tx.stockMovement.create).toHaveBeenCalled();
  });

  it('la devolución no se bloquea: la pieza pudo salir sin que se anotara su serie', async () => {
    const f = fixture(yaEntro);

    await f.service.createStockMovement({ type: 'RETURN', productId: 7, toWarehouseId: 1, quantity: 1, series: ['DS-1'] }, 3, 42);

    expect(f.tx.stockMovement.create).toHaveBeenCalled();
  });

  it('una recepción sin series no consulta el historial', async () => {
    const f = fixture(yaEntro);

    await f.service.createStockMovement(f.entrada, 3, 42);

    expect(f.prisma.stockMovement.findMany).not.toHaveBeenCalled();
  });

  it('tampoco se puede agregar después a otra recepción', async () => {
    const f = fixture(yaEntro);

    await expect(f.service.agregarEvidenciaMovimiento(9, { series: 'DS-1' }, 42)).rejects.toThrow(
      /La serie DS-1 ya está registrada en almacén \(movimiento SM-3\)/,
    );
    expect(f.prisma.stockMovement.update).not.toHaveBeenCalled();
    // No se compara la recepción contra sí misma.
    expect(f.prisma.stockMovement.findMany.mock.calls[0][0].where).toMatchObject({ id: { not: 9 }, productId: 7 });
  });
});
