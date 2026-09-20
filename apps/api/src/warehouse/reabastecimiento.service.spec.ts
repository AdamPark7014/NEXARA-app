import { ReabastecimientoService } from './reabastecimiento.service.js';

const EMPRESA = 7;
/** Reloj congelado: el servicio usa `new Date()` y la ventana de 90 días tiene borde. */
const AHORA = new Date('2026-09-19T12:00:00.000Z');
const HACE_DIAS = (d: number) => new Date(AHORA.getTime() - d * 86_400_000);

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(AHORA);
});
afterAll(() => {
  jest.useRealTimers();
});

function nivel(over: Record<string, unknown> = {}) {
  return {
    id: 11,
    productId: 3,
    warehouseId: 2,
    quantity: 40,
    reservedQty: 0,
    minCalculado: null,
    maxCalculado: null,
    calculadoAt: null,
    product: {
      id: 3,
      sku: 'CON-RJ45',
      name: 'Conector RJ45',
      unitName: 'pz',
      esCirculante: true,
      leadTimeDias: 10,
      compraMinima: null,
      stockSeguridadDias: 5,
      packagings: [
        { id: 1, nombre: 'Bolsa', piezasPorUnidad: 50, esDefaultCompra: false },
        { id: 2, nombre: 'Caja', piezasPorUnidad: 100, esDefaultCompra: true },
      ],
    },
    warehouse: { id: 2, code: 'ALM', name: 'Central' },
    ...over,
  };
}

/** 10 piezas por día durante 90 días. */
function salidasDiarias(productId = 3, warehouseId = 2, cantidad = 10) {
  return Array.from({ length: 90 }, (_, i) => ({
    productId,
    fromWarehouseId: warehouseId,
    quantity: cantidad,
    createdAt: HACE_DIAS(i + 1),
  }));
}

function build(niveles: unknown[], movimientos: unknown[]) {
  const prisma = {
    stockLevel: {
      findMany: jest.fn().mockResolvedValue(niveles),
      update: jest.fn().mockResolvedValue({}),
    },
    stockMovement: { findMany: jest.fn().mockResolvedValue(movimientos) },
    companyProfile: { findMany: jest.fn().mockResolvedValue([{ id: EMPRESA }]) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 99 }]) },
  };
  const notifications = { createBulkNotifications: jest.fn().mockResolvedValue([]) };
  return {
    service: new ReabastecimientoService(prisma as any, notifications as any),
    prisma,
    notifications,
  };
}

describe('ReabastecimientoService.listar', () => {
  it('sugiere comprar en múltiplos del empaque de compra por defecto', async () => {
    // 10/día, lead 10 + seguridad 5 → min 150, lote 100 (caja) → max 250.
    // Hay 40 → falta 210 → sube a 3 cajas = 300.
    const { service } = build([nivel()], salidasDiarias());
    const [renglon] = await service.listar(EMPRESA, {});

    expect(renglon.min).toBe(150);
    expect(renglon.max).toBe(250);
    expect(renglon.reponer).toBe(true);
    expect(renglon.sugerido).toBe(300);
    expect(renglon.sugeridoEmpaque).toEqual({ nombre: 'Caja', unidades: 3, piezasPorUnidad: 100 });
    expect(renglon.unidadBase).toBe('pz');
    expect(renglon.almacen).toBe('ALM Central');
  });

  it('respeta el mínimo ya guardado por el job en vez de recalcularlo', async () => {
    const { service } = build(
      [nivel({ minCalculado: 500, maxCalculado: 800, calculadoAt: new Date('2026-09-18T09:00:00Z') })],
      salidasDiarias(),
    );
    const [renglon] = await service.listar(EMPRESA, {});
    expect(renglon.min).toBe(500);
    expect(renglon.max).toBe(800);
    expect(renglon.calculadoAt).toBe('2026-09-18T09:00:00.000Z');
  });

  it('descuenta lo apartado antes de decidir si falta', async () => {
    const { service } = build([nivel({ quantity: 200, reservedQty: 90 })], salidasDiarias());
    const [renglon] = await service.listar(EMPRESA, {});
    expect(renglon.disponible).toBe(110);
    expect(renglon.reponer).toBe(true);
  });

  it('por defecto solo devuelve lo que hay que comprar', async () => {
    const { service } = build([nivel({ quantity: 900 })], salidasDiarias());
    expect(await service.listar(EMPRESA, {})).toEqual([]);
    expect(await service.listar(EMPRESA, { todos: true })).toHaveLength(1);
  });

  it('sin consumo no aparece: eso es material muerto, no faltante', async () => {
    const { service } = build([nivel({ quantity: 0 })], []);
    expect(await service.listar(EMPRESA, {})).toEqual([]);
  });

  it('ordena por urgencia: menos días de cobertura primero', async () => {
    const urgente = nivel({ id: 20, productId: 4, quantity: 10 });
    urgente.product = { ...nivel().product, id: 4, sku: 'CAB-UTP', name: 'Cable UTP' };
    const { service } = build(
      [nivel(), urgente],
      [...salidasDiarias(3, 2, 10), ...salidasDiarias(4, 2, 10)],
    );
    const filas = await service.listar(EMPRESA, {});
    expect(filas.map((f) => f.sku)).toEqual(['CAB-UTP', 'CON-RJ45']);
  });
});

describe('ReabastecimientoService.recalcular', () => {
  it('guarda mínimo, máximo y la hora del cálculo', async () => {
    const { service, prisma } = build([nivel()], salidasDiarias());
    const res = await service.recalcular(EMPRESA);

    expect(res.recalculados).toBe(1);
    expect(res.conMinimo).toBe(1);
    const data = prisma.stockLevel.update.mock.calls[0][0].data;
    expect(Number(data.minCalculado)).toBe(150);
    expect(Number(data.maxCalculado)).toBe(250);
    expect(data.calculadoAt).toBeInstanceOf(Date);
  });

  it('sin niveles circulantes no toca nada', async () => {
    const { service, prisma } = build([], []);
    const res = await service.recalcular(EMPRESA);
    expect(res.recalculados).toBe(0);
    expect(prisma.stockLevel.update).not.toHaveBeenCalled();
  });
});

describe('ReabastecimientoService.notificarFaltantes', () => {
  it('avisa a almacén y compras, con dedupe de un día', async () => {
    const { service, notifications } = build([nivel()], salidasDiarias());
    const total = await service.notificarFaltantes(EMPRESA);

    expect(total).toBe(1);
    const [payloads] = notifications.createBulkNotifications.mock.calls[0];
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      userId: 99,
      type: 'STOCK_ALERT',
      companyId: EMPRESA,
      dedupeSeconds: 24 * 3600,
      entityType: 'StockLevel',
      relatedEntityId: 11,
    });
    expect(payloads[0].message).toContain('Comprar 3 cajas');
    expect(payloads[0].relatedUrl).toContain('tab=reabastecimiento');
  });

  it('sin faltantes no molesta a nadie', async () => {
    const { service, notifications } = build([nivel({ quantity: 900 })], salidasDiarias());
    expect(await service.notificarFaltantes(EMPRESA)).toBe(0);
    expect(notifications.createBulkNotifications).not.toHaveBeenCalled();
  });
});
