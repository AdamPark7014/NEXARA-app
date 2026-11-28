import { Logger } from '@nestjs/common';
import { camposQueCambian, CtCatalogSyncService, firmaDeFila, firmaDeProducto } from './ct-catalog-sync.service';
import type { NormalizedSupplierProduct, SupplierPullResult } from '../connectors/supplier-connector';
import { applyCap, resolveRowCap, shouldCap } from '../../prisma/row-cap';

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

describe('camposQueCambian', () => {
  const cambian = (guardada: ReturnType<typeof fila>, p: NormalizedSupplierProduct) => camposQueCambian(guardada as never, p);

  it('una fila igual al producto no tiene cambios', () => {
    const p = producto('A');

    expect(cambian(fila(1, p), p)).toEqual([]);
  });

  it('si cambia solo el precio, dice precio', () => {
    expect(cambian(fila(1, producto('A')), producto('A', { price: 11 }))).toEqual(['precio']);
  });

  it('el tipo de cambio de 19.81 a 19.82 cuenta', () => {
    const guardada = fila(1, producto('A', { exchangeRate: 19.81 }));

    expect(cambian(guardada, producto('A', { exchangeRate: 19.82 }))).toEqual(['tipoCambio']);
  });

  it('la existencia con las mismas piezas y otro orden de llaves no cuenta', () => {
    const guardada = fila(1, producto('A'), { existencia: { GDL: 1, PUE: 2 } });

    expect(cambian(guardada, producto('A', { existencia: { PUE: 2, GDL: 1 } }))).toEqual([]);
  });

  it('un almacén en cero en el producto, ausente en la fila, no cuenta', () => {
    const guardada = fila(1, producto('A'), { existencia: { PUE: 2 } });

    expect(cambian(guardada, producto('A', { existencia: { PUE: 2, GDL: 0 } }))).toEqual([]);
  });

  it('una pieza más en un almacén cuenta como existencia', () => {
    expect(cambian(fila(1, producto('A')), producto('A', { existencia: { PUE: 3 } }))).toEqual(['existencia']);
  });

  it('las especificaciones distintas cuentan', () => {
    const otras = [{ tipo: 'Color', valor: 'Blanco' }];

    expect(cambian(fila(1, producto('A')), producto('A', { specifications: otras }))).toEqual(['especificaciones']);
  });

  it('dos campos a la vez salen los dos, sin repetirse', () => {
    const r = cambian(fila(1, producto('A')), producto('A', { price: 12, exchangeRate: 19.5 }));

    expect(r).toHaveLength(2);
    expect(r).toEqual(expect.arrayContaining(['precio', 'tipoCambio']));
    expect(new Set(r).size).toBe(2);
  });

  it('vacío en la base y nulo en CT son lo mismo, como en la firma', () => {
    const guardada = fila(1, producto('A'), { ean: undefined, promociones: null, especificaciones: null });

    expect(cambian(guardada, producto('A', { specifications: [], promotions: [] }))).toEqual([]);
  });

  // Todo lo que la firma ve como cambio lo ve el diagnóstico, y al revés: si discreparan, el log mentiría.
  describe('es consistente con la firma', () => {
    const base = producto('A', { promotions: [{ nombre: 'Promo', precio: 5 }], existencia: { PUE: 2, GDL: 1 }, ean: '123' });
    const variantes: Array<[string, Partial<NormalizedSupplierProduct>]> = [
      ['sin cambio', {}],
      ['mismo valor, otro objeto', { specifications: [{ tipo: 'Color', valor: 'Negro' }], promotions: [{ precio: 5, nombre: 'Promo' }] }],
      ['existencia con otro orden', { existencia: { GDL: 1, PUE: 2 } }],
      ['existencia con un almacén en cero', { existencia: { PUE: 2, GDL: 1, MTY: 0 } }],
      ['existencia con más piezas', { existencia: { PUE: 2, GDL: 2 } }],
      ['existencia sin piezas', { existencia: {} }],
      ['otro almacén', { existencia: { PUE: 2, MTY: 1 } }],
      ['número de parte', { partNumber: 'otro' }],
      ['nombre', { name: 'Otro nombre' }],
      ['modelo', { model: 'M-otro' }],
      ['modelo nulo', { model: null }],
      ['marca', { brand: 'OTRA' }],
      ['subcategoría', { subcategory: 'Otra' }],
      ['categoría', { category: 'Otra' }],
      ['descripción corta', { shortDescription: 'Otra' }],
      ['ean', { ean: '456' }],
      ['ean nulo', { ean: null }],
      ['upc', { upc: '789' }],
      ['sustituto', { substituteSku: 'SUS' }],
      ['activo', { active: false }],
      ['protegido', { protected: true }],
      ['precio', { price: 10.01 }],
      ['precio igual', { price: 10 }],
      ['moneda', { currency: 'MXN' }],
      ['tipo de cambio', { exchangeRate: 18.91 }],
      ['tipo de cambio nulo', { exchangeRate: null }],
      ['especificaciones', { specifications: [] }],
      ['promociones', { promotions: [] }],
      ['imagen', { imageUrl: 'https://x/y.png' }],
      ['varios a la vez', { price: 11, exchangeRate: 19, active: false, name: 'Z' }],
    ];

    it.each(variantes)('%s', (_, extra) => {
      const p = producto('A', { ...base, ...extra });
      const guardada = fila(1, base);

      expect(firmaDeFila(guardada as never) !== firmaDeProducto(p)).toBe(cambian(guardada, p).length > 0);
    });

    it('también al revés: la fila es la que trae el cambio', () => {
      const cambios: Array<Record<string, unknown>> = [
        { nombre: 'Otro' }, { precio: 99 }, { tipoCambio: 17.06 }, { activo: false }, { existencia: { PUE: 9 } },
        { existencia: { PUE: 2, GDL: 1, MTY: 0 } }, { especificaciones: [] }, { promociones: null }, { imagen: 'https://x/y.png' }, { ean: null },
      ];
      for (const c of cambios) {
        const guardada = fila(1, base, c);

        expect(firmaDeFila(guardada as never) !== firmaDeProducto(base)).toBe(cambian(guardada, base).length > 0);
      }
    });
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

  describe('cambios por campo en el log', () => {
    let log: jest.SpyInstance;
    beforeEach(() => {
      log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => log.mockRestore());

    const lineaDeSync = () => String(log.mock.calls.map(([m]) => m).find((m) => String(m).startsWith('CT sync OK')));

    it('cuenta cuántas filas cambiaron en cada campo', async () => {
      const a = producto('A');
      const b = producto('B');
      const c = producto('C');
      const { servicio, prisma } = armar({
        existentes: [fila(1, a), fila(2, b), fila(3, c)],
        pull: { products: [{ ...a, exchangeRate: 19.1 }, { ...b, exchangeRate: 19.1 }, c] },
      });

      const r = await servicio.sync({ source: 'PRIMARY' });

      expect(lineaDeSync()).toContain('upserted=2');
      expect(lineaDeSync()).toMatch(/cambiosPorCampo=tipoCambio:2$/);
      expect(prisma.productCT.upsert).toHaveBeenCalledTimes(2);
      expect(r).toMatchObject({ status: 'OK', rowsRead: 3, rowsUpserted: 2, error: null });
    });

    it('los productos que no estaban cuentan como nuevos', async () => {
      const a = producto('A');
      const { servicio } = armar({
        existentes: [fila(1, a)],
        pull: { products: [{ ...a, price: 99 }, producto('N1'), producto('N2')] },
      });

      await servicio.sync({ source: 'PRIMARY' });

      expect(lineaDeSync()).toMatch(/cambiosPorCampo=nuevo:2,precio:1$/);
    });

    it('si nada cambia dice ninguno', async () => {
      const a = producto('A');
      const { servicio } = armar({ existentes: [fila(1, a)], pull: { products: [a] } });

      await servicio.sync({ source: 'PRIMARY' });

      expect(lineaDeSync()).toMatch(/upserted=0 .*cambiosPorCampo=ninguno$/);
    });

    it('lista los 8 campos que más cambian, de mayor a menor', async () => {
      const a = producto('A');
      const b = producto('B');
      const { servicio } = armar({
        existentes: [fila(1, a), fila(2, b)],
        pull: {
          products: [
            { ...a, price: 1, name: 'X', model: 'X', brand: 'X', category: 'X', subcategory: 'X', shortDescription: 'X', currency: 'MXN', exchangeRate: 1, active: false },
            { ...b, price: 1 },
          ],
        },
      });

      await servicio.sync({ source: 'PRIMARY' });

      const campos = lineaDeSync().split('cambiosPorCampo=')[1]!.split(',');
      expect(campos).toHaveLength(8);
      expect(campos[0]).toBe('precio:2');
      expect(campos.slice(1).every((c) => c.endsWith(':1'))).toBe(true);
    });

    it('una fila que falla al guardar igual queda contada, y el diagnóstico no cambia qué se guarda', async () => {
      const a = producto('A');
      const { servicio, prisma } = armar({ existentes: [fila(1, a)], pull: { products: [{ ...a, price: 5 }] } });
      prisma.productCT.upsert.mockRejectedValueOnce(new Error('value too long'));

      const r = await servicio.sync({ source: 'PRIMARY' });

      expect(r).toMatchObject({ status: 'OK', rowsUpserted: 0 });
      expect(lineaDeSync()).toMatch(/conError=1 cambiosPorCampo=precio:1$/);
    });
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

  // 02-11-2026: 14,877 filas y el sync veía 5,000. 35 filas que CT ya no publica quedaron activas y con el dólar de agosto.
  describe('un catálogo más grande que el tope de filas de PrismaService', () => {
    const tope = resolveRowCap();
    const productos = Array.from({ length: tope * 2 + 1 }, (_, i) => producto(`T${i}`));
    const existentes = productos.map((p, i) => fila(i + 1, p));

    /** Como en producción: pagina por id, y sin `take` corta con el tope. */
    const armarConTope = (pull: { source: 'JSON' | 'XML'; products: NormalizedSupplierProduct[] }) => {
      const armado = armar({ pull });
      armado.prisma.productCT.findMany.mockImplementation(async (args: { take?: number; where?: { id?: { gt?: number } } }) => {
        const desde = existentes.filter((f) => f.id > (args.where?.id?.gt ?? 0));
        return shouldCap('findMany', args) ? applyCap(desde, tope).rows : desde.slice(0, args.take);
      });
      return armado;
    };

    it('no reescribe lo que no cambió, esté donde esté', async () => {
      const { servicio, prisma } = armarConTope({ source: 'JSON', products: productos });

      const r = await servicio.sync({ source: 'PRIMARY' });

      expect(prisma.productCT.upsert).not.toHaveBeenCalled();
      expect(r).toMatchObject({ status: 'OK', rowsUpserted: 0 });
    });

    it('apaga lo que ya no viene, aunque esté más allá del tope', async () => {
      const { servicio, prisma } = armarConTope({ source: 'XML', products: productos.slice(0, -1) });

      await servicio.sync({ source: 'FULL' });

      expect(prisma.productCT.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.productCT.updateMany).toHaveBeenCalledWith({ where: { id: { in: [existentes[existentes.length - 1]!.id] } }, data: { activo: false } });
    });

    it('la mitad de lo activo se cuenta contra todo el catálogo', async () => {
      const { servicio, prisma } = armarConTope({ source: 'XML', products: productos.slice(0, Math.floor(tope * 0.6)) });

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

describe('camposQueCambian · cada campo lleva su propio nombre', () => {
  // Si una etiqueta de la lista interna quedara cruzada (modelo con la etiqueta de marca), el log mentiría
  // justo en lo que sirve para decidir el arreglo. Aquí cada campo cambia solo y debe salir con su nombre.
  it.each<[string, Partial<NormalizedSupplierProduct>]>([
    ['numParte', { partNumber: 'OTRO' }],
    ['nombre', { name: 'Otro nombre' }],
    ['modelo', { model: 'M-OTRO' }],
    ['marca', { brand: 'OTRA' }],
    ['subcategoria', { subcategory: 'Otra sub' }],
    ['categoria', { category: 'Otra cat' }],
    ['descripcion_corta', { shortDescription: 'Otra corta' }],
    ['ean', { ean: '1234567890123' }],
    ['upc', { upc: '123456789012' }],
    ['sustituto', { substituteSku: 'SUST-1' }],
    ['activo', { active: false }],
    ['protegido', { protected: true }],
    ['existencia', { existencia: { PUE: 7 } }],
    ['precio', { price: 99 }],
    ['moneda', { currency: 'MXN' }],
    ['tipoCambio', { exchangeRate: 20.5 }],
    ['especificaciones', { specifications: [{ tipo: 'Color', valor: 'Blanco' }] }],
    ['promociones', { promotions: [{ nombre: 'Promo', precio: 5 }] }],
    ['imagen', { imageUrl: 'https://ejemplo.invalid/foto.jpg' }],
  ])('si solo cambia %s, dice %s y nada más', (campo, cambio) => {
    const guardada = fila(1, producto('A'));

    expect(camposQueCambian(guardada as never, producto('A', cambio))).toEqual([campo]);
  });

  it('los campos nombrados son todos los que firma la fila (ninguno se queda sin diagnóstico)', () => {
    const cambioTotal = producto('A', {
      partNumber: 'X', name: 'X', model: 'X', brand: 'X', subcategory: 'X', category: 'X', shortDescription: 'X',
      ean: 'X', upc: 'X', substituteSku: 'X', active: false, protected: true, existencia: { PUE: 9 }, price: 77,
      currency: 'MXN', exchangeRate: 21, specifications: [{ tipo: 'a', valor: 'b' }],
      promotions: [{ nombre: 'P' }], imageUrl: 'https://ejemplo.invalid/x.jpg',
    });

    expect(camposQueCambian(fila(1, producto('A')) as never, cambioTotal)).toHaveLength(19);
  });
});
