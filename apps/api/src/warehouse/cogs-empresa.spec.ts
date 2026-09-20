import { WarehouseService } from './warehouse.service.js';

/**
 * QA adversarial · la póliza de COGS del despacho tiene que nacer con empresa.
 *
 * `b62d9ce6` pasó la empresa por toda la cadena de pólizas automáticas y
 * arregló gastos, viáticos y pagos a personal — pero dejó fuera el único
 * llamador de `postInventoryIssueCogs`, que está aquí. Sin `companyId`:
 *
 *  - por defecto `resolveRequiredCompanyId` lanza 403 y el `catch` de
 *    `createStockMovement` lo traga: el inventario sale del almacén y su
 *    costo NUNCA llega a los libros, sin que nadie se entere;
 *  - con `TENANT_ALLOW_PRIMARY_FALLBACK=1` es peor: la póliza se asienta
 *    contra el catálogo de cuentas de la empresa PRIMARIA, que es justo el
 *    cruce de datos entre empresas que este sistema ya sufrió.
 */

const TENANT = 42;

function buildService() {
  const cogs = jest.fn().mockResolvedValue(null);

  const movimiento = {
    id: 900,
    movementNumber: 'SM-0900',
    totalCost: 1234.5,
    createdAt: new Date('2026-09-15T12:00:00.000Z'),
    product: { name: 'Cable UTP', sku: 'UTP-305' },
  };

  const tx = {
    stockLevel: { findFirst: jest.fn().mockResolvedValue({ unitCost: 10 }) },
    stockMovement: { create: jest.fn().mockResolvedValue(movimiento) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const prisma = {
    productPackaging: { findMany: jest.fn().mockResolvedValue([]) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 1, companyId: TENANT }) },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 7, companyId: TENANT }) },
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };

  const service = new WarehouseService(
    prisma as never,
    { notifyStockMovementPosted: jest.fn().mockResolvedValue(undefined) } as never,
    { postInventoryIssueCogs: cogs } as never,
    { next: jest.fn().mockResolvedValue('SM-0900') } as never,
    { publish: jest.fn() } as never,
  );

  // El despacho baja stock: esos dos helpers privados hablan con Prisma real.
  (service as unknown as Record<string, unknown>).readOnHandQty = jest
    .fn()
    .mockResolvedValue(100);
  (service as unknown as Record<string, unknown>).decrementStockLevel = jest
    .fn()
    .mockResolvedValue(undefined);
  (service as unknown as Record<string, unknown>).emitRealtimeLowStockAlerts = jest
    .fn()
    .mockResolvedValue(undefined);

  return { service, cogs };
}

describe('COGS del despacho · empresa', () => {
  it('la póliza automática de COGS se pide con la empresa del movimiento', async () => {
    const { service, cogs } = buildService();

    await service.createStockMovement(
      { type: 'DISPATCH', productId: 7, fromWarehouseId: 1, quantity: 5, unitCost: 246.9 },
      3,
      TENANT,
    );

    expect(cogs).toHaveBeenCalledTimes(1);
    // Sin esta empresa, getAccountByCode cae en resolveRequiredCompanyId:
    // 403 silencioso, o el catálogo de cuentas de otra empresa.
    expect(cogs.mock.calls[0][0]).toMatchObject({
      stockMovementId: 900,
      companyId: TENANT,
    });
  });
});
