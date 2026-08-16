import { BadRequestException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service.js';

/**
 * Reservas de stock bajo concurrencia.
 *
 * El punto de estas pruebas no es "reservar funciona", sino que las dos
 * escrituras que tocan `reservedQty` sean **relativas y guardadas**: leer,
 * calcular y escribir un valor absoluto pierde actualizaciones cuando dos
 * peticiones caen a la vez, y el síntoma en producción es stock que queda
 * reservado para siempre o vendido dos veces.
 */

const NIVEL = { id: 50, quantity: 10, reservedQty: 2 };
const RESERVA = {
  id: 9,
  productId: 3,
  warehouseId: 4,
  quantity: 5,
  status: 'ACTIVE',
  companyId: 7,
};

function build(over: Record<string, any> = {}) {
  const sqlEjecutado: string[] = [];

  const tx = {
    warehouse: { findUnique: jest.fn().mockResolvedValue({ companyId: 7 }) },
    stockLevel: {
      findFirst: jest.fn().mockResolvedValue(NIVEL),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    stockReservation: {
      create: jest.fn().mockResolvedValue({ id: 9 }),
      findFirst: jest.fn().mockResolvedValue(RESERVA),
      findFirstOrThrow: jest.fn().mockResolvedValue({ ...RESERVA, status: 'RELEASED' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn(async (strings: TemplateStringsArray) => {
      sqlEjecutado.push(strings.join('?').replace(/\s+/g, ' ').trim());
      return over.filasAfectadas ?? 1;
    }),
    ...over.tx,
  };

  const prisma = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    ...over.prisma,
  };

  const service = new WarehouseService(prisma as any, {} as any, {} as any, {} as any);
  return { service, tx, sqlEjecutado };
}

describe('reservar stock', () => {
  it('la escritura es relativa y condicionada al disponible', async () => {
    // Con un `update` simple, dos reservas de la última pieza pasaban las dos.
    const { service, sqlEjecutado } = build();
    await service.createReservation(
      { productId: 3, warehouseId: 4, quantity: 5, reason: 'proyecto' },
      1,
    );

    expect(sqlEjecutado).toHaveLength(1);
    expect(sqlEjecutado[0]).toContain('"reservedQty" = "reservedQty" +');
    expect(sqlEjecutado[0]).toContain('("quantity" - "reservedQty") >=');
  });

  it('si otra reserva se adelantó, falla con un mensaje que lo explica', async () => {
    const { service } = build({ filasAfectadas: 0 });
    await expect(
      service.createReservation({ productId: 3, warehouseId: 4, quantity: 5, reason: 'x' }, 1),
    ).rejects.toThrow(/al mismo tiempo/);
  });

  it('rechaza cantidad cero o negativa', async () => {
    const { service } = build();
    await expect(
      service.createReservation({ productId: 3, warehouseId: 4, quantity: 0, reason: 'x' }, 1),
    ).rejects.toThrow(BadRequestException);
  });

  it('exige motivo: una reserva sin razón nadie sabe luego por qué está', async () => {
    const { service } = build();
    await expect(
      service.createReservation({ productId: 3, warehouseId: 4, quantity: 1, reason: '  ' }, 1),
    ).rejects.toThrow(BadRequestException);
  });

  it('no reserva más de lo disponible', async () => {
    // disponible = 10 - 2 = 8
    const { service } = build({
      tx: { stockLevel: { findFirst: jest.fn().mockResolvedValue({ id: 50, quantity: 10, reservedQty: 2 }) } },
    });
    await expect(
      service.createReservation({ productId: 3, warehouseId: 4, quantity: 9, reason: 'x' }, 1),
    ).rejects.toThrow(/Disponible insuficiente/);
  });
});

describe('liberar reserva', () => {
  it('reclama la reserva antes de descontar', async () => {
    // Sin este orden, dos liberaciones simultáneas descontaban dos veces.
    const { service, tx } = build();
    await service.releaseReservation(9, 7);

    const args = tx.stockReservation.updateMany.mock.calls[0][0];
    expect(args.where.status).toBe('ACTIVE');
    expect(args.data.status).toBe('RELEASED');
    expect(args.data.releasedAt).toBeInstanceOf(Date);
  });

  it('el descuento es relativo, no un valor absoluto recalculado', async () => {
    // Era el fallo: dos liberaciones leian el mismo `reservedQty`, restaban lo
    // mismo y escribian lo mismo, asi que una resta se perdia y esa cantidad
    // quedaba reservada para siempre.
    const { service, sqlEjecutado } = build();
    await service.releaseReservation(9, 7);

    expect(sqlEjecutado[0]).toContain('"reservedQty" = GREATEST(0, "reservedQty" -');
  });

  it('una segunda liberación no descuenta otra vez', async () => {
    const { service, tx } = build({
      tx: { stockReservation: { findFirst: jest.fn().mockResolvedValue(RESERVA), updateMany: jest.fn().mockResolvedValue({ count: 0 }) } },
    });

    await expect(service.releaseReservation(9, 7)).rejects.toThrow(/ya fue liberada/);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('sin nivel de stock no revienta: la reserva igual se libera', async () => {
    const { service, tx } = build({
      tx: { stockLevel: { findFirst: jest.fn().mockResolvedValue(null) } },
    });

    await expect(service.releaseReservation(9, 7)).resolves.toBeDefined();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('todo ocurre dentro de una transacción', async () => {
    const { service, tx } = build();
    await service.releaseReservation(9, 7);
    expect(tx.stockReservation.updateMany).toHaveBeenCalled();
  });
});
