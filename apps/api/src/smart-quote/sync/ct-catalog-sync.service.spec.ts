import { CtCatalogSyncService, firmaDeFila, firmaDeProducto } from './ct-catalog-sync.service';
import type { NormalizedSupplierProduct, SupplierPullResult } from '../connectors/supplier-connector';

const producto = (sku: string, extra: Partial<NormalizedSupplierProduct> = {}): NormalizedSupplierProduct => ({
  externalId: 1,
  sku,
  partNumber: `P-${sku}`,
  name: `Producto ${sku}`,
  model: `M-${sku}`,
  brand: 'ACME',
  brandIdExternal: 1,
  category: 'Cat',
  categoryIdExternal: 1,
  subcategory: 'Sub',
  subcategoryIdExternal: 1,
  shortDescription: 'Corta',
  ean: null,
  upc: null,
  substituteSku: null,
  active: true,
  protected: false,
  existencia: { PUE: 2 },
  price: 10,
  currency: 'USD',
  exchangeRate: 18.9,
  specifications: [{ tipo: 'Color', valor: 'Negro' }],
  promotions: [],
  imageUrl: null,
  raw: {},
  ...extra,
});

/** Lo que la base devuelve para ese producto ya guardado. */
const fila = (id: number, p: NormalizedSupplierProduct, extra: Record<string, unknown> = {}) => ({
  id,
  clave: p.sku,
  numParte: p.partNumber,
  nombre: p.name,
  modelo: p.model,
  marca: p.brand,
  subcategoria: p.subcategory,
  categoria: p.category,
  descripcion_corta: p.shortDescription,
  ean: p.ean,
  upc: p.upc,
  sustituto: p.substituteSku,
  activo: p.active,
  protegido: p.protected,
  existencia: p.existencia,
  precio: p.price,
  moneda: p.currency,
  tipoCambio: p.exchangeRate,
  especificaciones: p.specifications,
  promociones: p.promotions,
  imagen: p.imageUrl,
  ...extra,
});

function armar(opciones: { existentes?: unknown[]; pull?: Partial<SupplierPullResult> & { products: NormalizedSupplierProduct[] } }) {
  const prisma = {
    productCT: {
      findMany: jest.fn().mockResolvedValue(opciones.existentes ?? []),
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    supplierCatalogSyncRun: {
      create: jest.fn().mockResolvedValue({ id: 99 }),
      update: jest.fn().mockImplementation(async ({ data }) => ({ id: 99, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const resultado = { source: 'JSON' as const, fileModifiedAt: null, checksum: 'suma', ...opciones.pull } as SupplierPullResult;
  const connector = {
    code: 'CT',
    pullPrimary: jest.fn().mockResolvedValue(resultado),
    pullFull: jest.fn().mockResolvedValue(resultado),
  };
  return { prisma, connector, servicio: new CtCatalogSyncService(prisma as never, connector as never) };
}

describe('firmas', () => {
  it('una fila igual firma igual, aunque la base traiga las llaves en otro orden', () => {
    const p = producto('A', { promotions: [{ nombre: 'Promo', precio: 5 }], existencia: { PUE: 2, GDL: 1 } });
    const guardada = fila(1, p, { promociones: [{ precio: 5, nombre: 'Promo' }], existencia: { GDL: 1, PUE: 2 } });

    expect(firmaDeFila(guardada as never)).toBe(firmaDeProducto(p));
  });

  it('los almacenes en cero no cuentan como cambio', () => {
    const p = producto('A', { existencia: { PUE: 2, GDL: 0 } });

    expect(firmaDeFila(fila(1, producto('A')) as never)).toBe(firmaDeProducto(p));
  });

  it.each([
    ['precio', { price: 11 }],
    ['existencia', { existencia: { PUE: 3 } }],
    ['activo', { active: false }],
    ['tipo de cambio', { exchangeRate: 19 }],
  ])('cambia con %s', (_, cambio) => {
    expect(firmaDeProducto(producto('A', cambio))).not.toBe(firmaDeProducto(producto('A')));
  });
});

describe('CtCatalogSyncService.sync', () => {
  it('solo escribe lo que cambió o es nuevo', async () => {
    const igual = producto('IGUAL');
    const cambia = producto('CAMBIA', { price: 20 });
    const nuevo = producto('NUEVO');
    const { servicio, prisma } = armar({
      existentes: [fila(1, igual), fila(2, producto('CAMBIA'))],
      pull: { products: [igual, cambia, nuevo] },
    });

    const r = await servicio.sync({ source: 'PRIMARY' });

    expect(prisma.productCT.upsert.mock.calls.map(([a]) => a.where.clave)).toEqual(['CAMBIA', 'NUEVO']);
    expect(r).toMatchObject({ status: 'OK', rowsRead: 3, rowsUpserted: 2, error: null });
  });

  it('guarda solo los almacenes con piezas y no pisa el id que dejó el JSON', async () => {
    const { servicio, prisma } = armar({
      pull: { source: 'XML', products: [producto('A', { externalId: null, existencia: { PUE: 0, GDL: 4 } })] },
    });

    await servicio.sync({ source: 'FULL' });

    const { create, update } = prisma.productCT.upsert.mock.calls[0]![0];
    expect(create.existencia).toEqual({ GDL: 4 });
    expect(update).not.toHaveProperty('idProducto');
  });

  describe('lo que CT ya no publica', () => {
    const siguen = Array.from({ length: 6 }, (_, i) => producto(`S${i}`));

    it('el XML apaga lo que dejó de venir, sin borrarlo', async () => {
      const { servicio, prisma } = armar({
        existentes: [...siguen.map((p, i) => fila(i + 1, p)), fila(50, producto('YA-NO')), fila(51, producto('APAGADO'), { activo: false })],
        pull: { source: 'XML', products: siguen },
      });

      await servicio.sync({ source: 'FULL' });

      expect(prisma.productCT.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.productCT.updateMany).toHaveBeenCalledWith({ where: { id: { in: [50] } }, data: { activo: false } });
    });

    it('el JSON no apaga nada: solo trae lo que hay en existencia', async () => {
      const { servicio, prisma } = armar({
        existentes: [...siguen.map((p, i) => fila(i + 1, p)), fila(50, producto('SIN-PIEZAS'))],
        pull: { source: 'JSON', products: siguen },
      });

      await servicio.sync({ source: 'FULL' });

      expect(prisma.productCT.updateMany).not.toHaveBeenCalled();
    });

    it('un XML con menos de la mitad de lo activo no apaga nada', async () => {
      const { servicio, prisma } = armar({
        existentes: Array.from({ length: 10 }, (_, i) => fila(i + 1, producto(`R${i}`))),
        pull: { source: 'XML', products: [producto('R0'), producto('R1')] },
      });

      await servicio.sync({ source: 'FULL' });

      expect(prisma.productCT.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('corridas', () => {
    it('una cola atorada que se libera solo corre una vez', async () => {
      const { servicio, connector } = armar({ pull: { products: [] } });

      const primera = await servicio.sync({ source: 'PRIMARY', saltarSiReciente: true });
      const segunda = await servicio.sync({ source: 'PRIMARY', saltarSiReciente: true });

      expect(primera.status).toBe('OK');
      expect(segunda.status).toBe('SKIPPED');
      expect(connector.pullPrimary).toHaveBeenCalledTimes(1);
    });

    it('pedirla a mano corre aunque haya una reciente', async () => {
      const { servicio, connector } = armar({ pull: { products: [] } });

      await servicio.sync({ source: 'PRIMARY', saltarSiReciente: true });
      await servicio.sync({ source: 'PRIMARY' });

      expect(connector.pullPrimary).toHaveBeenCalledTimes(2);
    });

    it('el JSON reciente no detiene al XML', async () => {
      const { servicio, connector } = armar({ pull: { products: [] } });

      await servicio.sync({ source: 'PRIMARY', saltarSiReciente: true });
      await servicio.sync({ source: 'FULL', saltarSiReciente: true });

      expect(connector.pullFull).toHaveBeenCalledTimes(1);
    });

    it('dos al mismo tiempo no corren juntas', async () => {
      const { servicio, connector } = armar({ pull: { products: [] } });

      const [a, b] = await Promise.all([servicio.sync({ source: 'PRIMARY' }), servicio.sync({ source: 'FULL' })]);

      expect(a.status).toBe('OK');
      expect(b.status).toBe('SKIPPED');
      expect(connector.pullFull).not.toHaveBeenCalled();
    });

    it('cierra las corridas que un reinicio dejó abiertas', async () => {
      const { servicio, prisma } = armar({ pull: { products: [] } });

      await servicio.sync({ source: 'PRIMARY' });

      const { where, data } = prisma.supplierCatalogSyncRun.updateMany.mock.calls[0]![0];
      expect(where).toMatchObject({ supplierCode: 'CT', status: 'RUNNING' });
      expect(Date.now() - where.startedAt.lt.getTime()).toBeGreaterThanOrEqual(3_600_000);
      expect(data.status).toBe('ERROR');
    });
  });

  describe('errores', () => {
    it('una fila mala no detiene a las demás y queda dicho', async () => {
      const { servicio, prisma } = armar({ pull: { products: [producto('MALA'), producto('BUENA')] } });
      prisma.productCT.upsert.mockRejectedValueOnce(new Error('value too long'));

      const r = await servicio.sync({ source: 'PRIMARY' });

      expect(prisma.productCT.upsert).toHaveBeenCalledTimes(2);
      expect(r).toMatchObject({ status: 'OK', rowsUpserted: 1 });
      expect(r.error).toContain('1 filas sin guardar');
      expect(r.error).toContain('MALA');
    });

    it('con el disco lleno fallan todas: corta pronto y no apaga nada', async () => {
      const productos = Array.from({ length: 100 }, (_, i) => producto(`F${i}`));
      const { servicio, prisma } = armar({ pull: { source: 'XML', products: productos } });
      prisma.productCT.upsert.mockRejectedValue(new Error('No space left on device'));

      const r = await servicio.sync({ source: 'FULL' });

      expect(prisma.productCT.upsert).toHaveBeenCalledTimes(20);
      expect(prisma.productCT.updateMany).not.toHaveBeenCalled();
      expect(r.status).toBe('ERROR');
      expect(r.error).toContain('No space left');
    });

    it('si no baja el archivo la corrida queda en ERROR', async () => {
      const { servicio, connector } = armar({ pull: { products: [] } });
      connector.pullPrimary.mockRejectedValue(new Error('Timeout (data socket)'));

      const r = await servicio.sync({ source: 'PRIMARY' });

      expect(r).toMatchObject({ status: 'ERROR', error: 'Timeout (data socket)' });
    });
  });
});
