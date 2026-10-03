import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CodigosBarrasService } from './codigos-barras.service';
import { WarehouseService } from './warehouse.service';

/**
 * Almacén por código de barras.
 *
 * Lo que estas pruebas sostienen: el lector encuentra el producto aunque el UPC esté
 * guardado como EAN (y al revés), un código nunca queda apuntando a dos productos, y
 * las apps pueden registrar un movimiento mandando solo el código.
 */

const EMPRESA = 7;
const UPC = '036000291452';
const EAN_DEL_UPC = `0${UPC}`;
const EAN = '4006381333931';

const PRODUCTO = {
  id: 31,
  sku: 'SKU-0031',
  name: 'Cámara bala 2 MP',
  ean: EAN_DEL_UPC,
  upc: null,
  codigoBarras: null,
  unitName: 'pieza',
  imageUrl: null,
  companyId: EMPRESA,
};

function build(over: { prisma?: Record<string, any> } = {}) {
  const prisma: Record<string, any> = {
    product: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(async ({ data }: any) => ({ ...PRODUCTO, ...data })),
    },
    productPackaging: { findFirst: jest.fn().mockResolvedValue(null) },
    stockLevel: { findMany: jest.fn().mockResolvedValue([]) },
    brand: { findFirst: jest.fn().mockResolvedValue(null) },
    ...over.prisma,
  };
  const warehouse = new WarehouseService(prisma as any, {} as any, {} as any, {} as any, {} as any);
  const catalog = {
    createProduct: jest.fn(async (dto: any) => ({
      id: 99,
      sku: dto.sku ?? 'SKU-0099',
      name: dto.name,
      ean: dto.ean ?? null,
      upc: dto.upc ?? null,
      codigoBarras: dto.codigoBarras ?? null,
      unitName: dto.unit ?? null,
      imageUrl: dto.imageUrl ?? null,
    })),
  };
  const service = new CodigosBarrasService(prisma as any, warehouse, catalog as any);
  return { service, warehouse, prisma, catalog };
}

describe('findByBarcode', () => {
  it('un UPC-A encuentra el producto aunque esté guardado como EAN-13', async () => {
    const { warehouse, prisma } = build();
    prisma.product.findFirst.mockResolvedValue(PRODUCTO);
    prisma.stockLevel.findMany.mockResolvedValue([
      { quantity: 4, reservedQty: 1, warehouse: { id: 2, name: 'Matriz' } },
      { quantity: 6, reservedQty: 0, warehouse: { id: 2, name: 'Matriz' } },
      { quantity: 3, reservedQty: 0, warehouse: { id: 1, name: 'Bodega' } },
    ]);

    const hallazgo = await warehouse.findByBarcode(` ${UPC}\r`, EMPRESA);

    const where = prisma.product.findFirst.mock.calls[0][0].where;
    expect(where.companyId).toBe(EMPRESA);
    expect(where.OR).toEqual([
      { ean: { in: [UPC, EAN_DEL_UPC] } },
      { upc: { in: [UPC, EAN_DEL_UPC] } },
      { codigoBarras: { in: [UPC, EAN_DEL_UPC] } },
      { sku: { equals: UPC, mode: 'insensitive' } },
    ]);
    expect(hallazgo).toMatchObject({
      match: 'producto',
      codigoBarras: UPC,
      tipo: 'UPC_A',
      product: { id: 31 },
    });
    // La existencia llega sumada por almacén: es lo que la app enseña bajo el nombre.
    expect(hallazgo.existencias).toEqual([
      { warehouseId: 1, almacen: 'Bodega', cantidad: 3, reservado: 0 },
      { warehouseId: 2, almacen: 'Matriz', cantidad: 10, reservado: 1 },
    ]);
  });

  it('el código de una caja gana sobre el de la pieza', async () => {
    const { warehouse, prisma } = build();
    prisma.productPackaging.findFirst.mockResolvedValue({
      id: 5,
      nombre: 'Caja',
      piezasPorUnidad: 10,
      product: PRODUCTO,
    });

    const hallazgo = await warehouse.findByBarcode(EAN, EMPRESA);

    expect(hallazgo).toMatchObject({
      match: 'empaque',
      packaging: { id: 5, nombre: 'Caja', piezasPorUnidad: 10 },
    });
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('código desconocido → 404 (la pantalla ofrece darlo de alta)', async () => {
    const { warehouse } = build();
    await expect(warehouse.findByBarcode(EAN, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('vacío → 400', async () => {
    const { warehouse } = build();
    await expect(warehouse.findByBarcode('  ', EMPRESA)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('asignarCodigo', () => {
  it('un UPC-A se guarda en `upc`', async () => {
    const { service, prisma } = build();
    prisma.product.findFirst
      .mockResolvedValueOnce({ ...PRODUCTO, ean: null }) // el producto
      .mockResolvedValueOnce(null); // nadie más tiene el código

    await service.asignarCodigo(31, { codigo: UPC }, EMPRESA);

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 31 }, data: { upc: UPC } }),
    );
  });

  it('un EAN-13 va a `ean` y un código propio a `codigoBarras`', async () => {
    const { service, prisma } = build();
    prisma.product.findFirst.mockResolvedValueOnce({ ...PRODUCTO, ean: null }).mockResolvedValueOnce(null);
    await service.asignarCodigo(31, { codigo: EAN }, EMPRESA);
    expect(prisma.product.update.mock.calls[0][0].data).toEqual({ ean: EAN });

    prisma.product.findFirst.mockResolvedValueOnce(PRODUCTO).mockResolvedValueOnce(null);
    await service.asignarCodigo(31, { codigo: 'DS-2CD1023G0E-I' }, EMPRESA);
    expect(prisma.product.update.mock.calls[1][0].data).toEqual({ codigoBarras: 'DS-2CD1023G0E-I' });
  });

  it('no deja un código apuntando a dos productos', async () => {
    const { service, prisma } = build();
    prisma.product.findFirst
      .mockResolvedValueOnce({ ...PRODUCTO, ean: null })
      .mockResolvedValueOnce({ id: 8, name: 'Otro producto', sku: 'SKU-0008' });

    await expect(service.asignarCodigo(31, { codigo: UPC }, EMPRESA)).rejects.toThrow(
      /ya es de «Otro producto»/,
    );
    // Busca a los demás, no a sí mismo, y con las dos formas del código.
    const where = prisma.product.findFirst.mock.calls[1][0].where;
    expect(where.id).toEqual({ not: 31 });
    expect(where.OR[0]).toEqual({ ean: { in: [UPC, EAN_DEL_UPC] } });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('tampoco si ya es el código de una caja', async () => {
    const { service, prisma } = build();
    prisma.product.findFirst.mockResolvedValueOnce({ ...PRODUCTO, ean: null }).mockResolvedValueOnce(null);
    prisma.productPackaging.findFirst.mockResolvedValue({
      nombre: 'Caja',
      product: { name: 'Conector RJ45' },
    });
    await expect(service.asignarCodigo(31, { codigo: UPC }, EMPRESA)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('un UPC con el verificador mal no se guarda', async () => {
    const { service, prisma } = build();
    await expect(service.asignarCodigo(31, { codigo: '036000291453' }, EMPRESA)).rejects.toThrow(
      /verificador/,
    );
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('cambiar un código que ya tenía pide confirmación', async () => {
    const { service, prisma } = build();
    const conEan = { ...PRODUCTO, ean: '7501031311309' };
    prisma.product.findFirst.mockResolvedValueOnce(conEan).mockResolvedValueOnce(null);
    await expect(service.asignarCodigo(31, { codigo: EAN }, EMPRESA)).rejects.toThrow(
      /ya tiene el código 7501031311309/,
    );

    prisma.product.findFirst.mockResolvedValueOnce(conEan).mockResolvedValueOnce(null);
    await service.asignarCodigo(31, { codigo: EAN, reemplazar: true }, EMPRESA);
    expect(prisma.product.update).toHaveBeenCalledTimes(1);
  });

  it('producto de otra empresa → 404', async () => {
    const { service } = build();
    await expect(service.asignarCodigo(31, { codigo: UPC }, EMPRESA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('altaPorCodigo', () => {
  it('crea el producto con el código en su columna y lo que trajo el catálogo', async () => {
    const { service, catalog } = build();

    const creado = await service.altaPorCodigo(
      {
        codigo: EAN,
        name: '  Cámara bala 2 MP ',
        marca: 'Hikvision',
        modelo: 'DS-2CD1023G0E-I',
        descripcion: 'Lente 2.8 mm',
        imagenUrl: 'https://cdn.example/camara.jpg',
      },
      EMPRESA,
    );

    expect(catalog.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: EMPRESA,
        name: 'Cámara bala 2 MP',
        ean: EAN,
        upc: null,
        codigoBarras: null,
        imageUrl: 'https://cdn.example/camara.jpg',
        especificaciones: { marca: 'Hikvision', modelo: 'DS-2CD1023G0E-I' },
      }),
    );
    expect(creado).toMatchObject({ id: 99, ean: EAN });
  });

  it('liga la marca solo si ya existe en el catálogo', async () => {
    const { service, catalog, prisma } = build();
    prisma.brand.findFirst.mockResolvedValue({ id: 4 });
    await service.altaPorCodigo({ codigo: UPC, name: 'Switch 8 puertos', marca: 'tp-link' }, EMPRESA);
    expect(catalog.createProduct.mock.calls[0][0]).toMatchObject({ brandId: 4, upc: UPC });
  });

  it('una imagen que no es https se descarta', async () => {
    const { service, catalog } = build();
    await service.altaPorCodigo(
      { codigo: 'CAB-UTP-CAT6', name: 'Cable UTP', imagenUrl: 'http://inseguro.example/a.jpg' },
      EMPRESA,
    );
    expect(catalog.createProduct.mock.calls[0][0]).toMatchObject({
      imageUrl: undefined,
      codigoBarras: 'CAB-UTP-CAT6',
    });
  });

  it('si el código ya existe no crea un duplicado', async () => {
    const { service, catalog, prisma } = build();
    prisma.product.findFirst.mockResolvedValue({ id: 8, name: 'Ya estaba', sku: 'SKU-0008' });
    await expect(service.altaPorCodigo({ codigo: EAN, name: 'Otro' }, EMPRESA)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(catalog.createProduct).not.toHaveBeenCalled();
  });

  it('sin nombre no hay alta', async () => {
    const { service } = build();
    await expect(service.altaPorCodigo({ codigo: EAN, name: ' ' }, EMPRESA)).rejects.toThrow(/nombre/);
  });
});

describe('movimientoPorCodigo', () => {
  it('código de pieza: el movimiento sale en unidad base', async () => {
    const { service, warehouse, prisma } = build();
    prisma.product.findFirst.mockResolvedValue(PRODUCTO);
    const crear = jest.spyOn(warehouse, 'createStockMovement').mockResolvedValue({ id: 500 } as any);

    const r = await service.movimientoPorCodigo(
      { codigo: UPC, type: 'RECEIPT', quantity: 3, toWarehouseId: 2 },
      11,
      EMPRESA,
    );

    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RECEIPT',
        productId: 31,
        quantity: 3,
        toWarehouseId: 2,
        packagingId: undefined,
        reference: UPC,
      }),
      11,
      EMPRESA,
    );
    expect(r).toMatchObject({ match: 'producto', movement: { id: 500 }, packaging: null });
  });

  it('código de caja: manda la presentación para que se convierta a piezas', async () => {
    const { service, warehouse, prisma } = build();
    prisma.productPackaging.findFirst.mockResolvedValue({
      id: 5,
      nombre: 'Caja',
      piezasPorUnidad: 10,
      product: PRODUCTO,
    });
    const crear = jest.spyOn(warehouse, 'createStockMovement').mockResolvedValue({ id: 501 } as any);

    await service.movimientoPorCodigo(
      { codigo: EAN, type: 'DISPATCH', quantity: 2, fromWarehouseId: 2, activityId: 77 },
      11,
      EMPRESA,
    );

    expect(crear.mock.calls[0][0]).toMatchObject({
      type: 'DISPATCH',
      productId: 31,
      fromWarehouseId: 2,
      activityId: 77,
      packagingId: 5,
      cantidadCapturada: 2,
      unidadCaptura: 'Caja',
    });
  });

  it('cantidad cero o negativa → 400, sin tocar existencias', async () => {
    const { service, warehouse, prisma } = build();
    prisma.product.findFirst.mockResolvedValue(PRODUCTO);
    const crear = jest.spyOn(warehouse, 'createStockMovement').mockResolvedValue({} as any);
    await expect(
      service.movimientoPorCodigo({ codigo: UPC, type: 'RECEIPT', quantity: 0, toWarehouseId: 2 }, 11, EMPRESA),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(crear).not.toHaveBeenCalled();
  });
});
