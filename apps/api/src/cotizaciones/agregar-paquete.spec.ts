/**
 * Guardar rehace todas las partidas: borra y vuelve a crear, y lo que no llegue a `update` se pierde.
 * Agregar un paquete mandaba una lista corta, así que las demás partidas se quedaban sin costo, sin
 * margen y sin su liga con CT.
 */
import { Prisma } from '@prisma/client';
import { CotizacionesService } from './cotizaciones.service.js';
import { calculateLine, normalizeItems, type RawCotizacionItem } from './cotizacion-totals.js';

const CLAVE = 'camara-bala-instalada';
/** Las escribe la base o salen del cálculo: no se conservan, se vuelven a generar. */
const NO_SE_CONSERVAN = ['id', 'cotizacionId', 'lineTotal', 'createdAt'];

/** Una partida como la lee Prisma, con todas sus columnas: los importes llegan como Decimal. */
const conTodo = () => ({
  id: 11,
  cotizacionId: 50,
  productId: 9,
  grupo: 'EQUIPOS',
  paqueteClave: 'otro-paquete',
  paqueteCantidad: 2,
  category: 'CCTV',
  name: 'Cámara IP',
  partida: '1.1',
  description: 'Ficha técnica',
  scope: 'Interior',
  brand: 'Hikvision',
  model: 'DS-2CD1023',
  imagenUrl: 'https://ejemplo.test/camara.webp',
  sku: 'SKU-1',
  partNumber: 'PN-1',
  batchReference: 'L-1',
  unit: 'Pieza',
  qty: 3,
  unitPrice: new Prisma.Decimal('1204.00'),
  unitCost: new Prisma.Decimal('1000.00'),
  supplierId: 4,
  supplierSku: 'CT-77',
  productCtId: 77,
  supplierCode: 'CT',
  supplierWarehouseCode: '14A',
  marginPercent: new Prisma.Decimal('20.40'),
  stockSnapshot: 12,
  leadTimeDays: 3,
  scoreReason: 'precio',
  optimizationMode: 'costo',
  discount: 5,
  tax: 16,
  ieps: 8,
  retention: 4,
  laborHours: new Prisma.Decimal('1.50'),
  laborRate: new Prisma.Decimal('200.00'),
  warrantyMonths: 12,
  deliveryTime: '2 semanas',
  countryOrigin: 'China',
  notes: 'Va con soporte',
  lineTotal: new Prisma.Decimal('0.00'),
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
});

function armar(items: Array<Record<string, unknown>>) {
  const cotizacion = { id: 50, companyId: 7, status: 'DRAFT', createdById: 15, marginPercent: null, conIva: true, alcanceBloques: [], items };
  const prisma = {
    cotizacion: {
      findFirst: jest.fn().mockResolvedValue(cotizacion),
      findFirstOrThrow: jest.fn().mockResolvedValue({ ...cotizacion, total: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    cotizacionItem: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
  } as any;
  const service = new CotizacionesService(
    prisma,
    { requestAutoApproval: jest.fn(), publishEntityLifecycle: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  jest.spyOn(service, 'detalleCore').mockResolvedValue({} as never);
  /** Lo que quedaría en la tabla después de agregar el paquete. */
  const guardadas = async () => {
    await service.agregarPaquete(50, CLAVE, 2, 15, 7);
    return prisma.cotizacionItem.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
  };
  return { guardadas, prisma };
}

/** Decimal y número valen lo mismo: lo que importa es la cifra. */
const cifra = (valor: unknown) => (valor instanceof Prisma.Decimal ? valor.toNumber() : valor);

describe('agregar un paquete no toca las demás partidas', () => {
  it('conservan todas sus columnas, también las que se agreguen al esquema después', async () => {
    const fila = conTodo();
    // Una columna nueva tiene que estar en la partida de arriba para que esta prueba la cuide.
    expect(Object.keys(fila).sort()).toEqual(Object.values(Prisma.CotizacionItemScalarFieldEnum).sort());

    const { guardadas } = armar([fila]);
    const [guardada] = await guardadas();
    for (const columna of Object.keys(fila).filter((c) => !NO_SE_CONSERVAN.includes(c))) {
      expect([columna, guardada?.[columna]]).toEqual([columna, cifra(fila[columna as keyof typeof fila])]);
    }
  });

  it('la liga con CT sigue completa: sin ella el pedido dice que no hay partidas de catálogo', async () => {
    const { guardadas } = armar([conTodo()]);
    const [guardada] = await guardadas();
    expect(guardada).toMatchObject({ productCtId: 77, supplierSku: 'CT-77', sku: 'SKU-1', supplierCode: 'CT', supplierWarehouseCode: '14A' });
  });

  it('el importe de la partida no cambia, y su IEPS y su retención siguen en el total', async () => {
    const fila = conTodo();
    const { guardadas, prisma } = armar([fila]);
    const [guardada] = await guardadas();
    const [normalizada] = normalizeItems([fila as unknown as RawCotizacionItem]);
    expect(guardada?.['unitPrice']).toBe(1204);
    expect(guardada?.['lineTotal']).toBe(Math.round(calculateLine(normalizada!).total * 100) / 100);
    const { iepsTotal, retentionTotal } = prisma.cotizacion.update.mock.calls[0][0].data;
    expect(iepsTotal).toBeGreaterThan(0);
    expect(retentionTotal).toBeGreaterThan(0);
  });

  it('un precio escrito a mano se queda, con costo o sin él', async () => {
    const aMano = { ...conTodo(), id: 12, unitCost: null, marginPercent: null, unitPrice: new Prisma.Decimal('500.00') };
    const conCosto = { ...conTodo(), id: 13, marginPercent: null, unitPrice: new Prisma.Decimal('999.99') };
    const { guardadas } = armar([aMano, conCosto]);
    const [primera, segunda] = await guardadas();
    expect(primera).toMatchObject({ unitPrice: 500, unitCost: null, marginPercent: null });
    expect(segunda).toMatchObject({ unitPrice: 999.99, unitCost: 1000, marginPercent: null });
  });

  it('el mismo paquete se reemplaza, no se suma, y las demás siguen en su lugar', async () => {
    const delPaquete = { ...conTodo(), id: 14, paqueteClave: CLAVE, name: 'Cámara de antes', qty: 9 };
    const { guardadas } = armar([delPaquete, conTodo()]);
    const filas = await guardadas();
    expect(filas.map((f) => f['name'])).not.toContain('Cámara de antes');
    expect(filas[0]).toMatchObject({ name: 'Cámara IP', unitCost: 1000 });
    expect(filas.slice(1).every((f) => f['paqueteClave'] === CLAVE && f['paqueteCantidad'] === 2)).toBe(true);
  });
});
