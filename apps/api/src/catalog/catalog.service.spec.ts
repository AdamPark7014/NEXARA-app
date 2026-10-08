import { BadRequestException, ConflictException } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import {
  MENSAJE_TIPO_INVALIDO,
  TipoArticuloInvalidoError,
  normalizarTipoArticulo,
  unidadParaTipo,
  validarEmpaqueDeTipo,
} from './tipo-articulo.js';

describe('tipo-articulo', () => {
  it('normaliza el tipo: minúsculas y espacios sí, HERRAMIENTA no', () => {
    expect(normalizarTipoArticulo(' consumible ')).toBe('CONSUMIBLE');
    expect(normalizarTipoArticulo('')).toBeNull();
    expect(normalizarTipoArticulo(null)).toBeNull();
    expect(normalizarTipoArticulo('HERRAMIENTA')).toBeUndefined();
    expect(normalizarTipoArticulo(3)).toBeUndefined();
  });

  it('propone pz o m y no pisa una unidad capturada a mano', () => {
    expect(unidadParaTipo({ tipo: 'CONSUMIBLE' })).toBe('pz');
    expect(unidadParaTipo({ tipo: 'EQUIPO' })).toBe('pz');
    expect(unidadParaTipo({ tipo: 'MEDIDA' })).toBe('m');
    expect(unidadParaTipo({ tipo: 'MEDIDA', unidadMandada: 'rollo' })).toBe('rollo');
    expect(unidadParaTipo({ tipo: 'MEDIDA', unidadActual: 'pz' })).toBe('m');
    expect(unidadParaTipo({ tipo: 'MEDIDA', unidadActual: 'kg' })).toBe('kg');
    expect(unidadParaTipo({ tipo: null })).toBeUndefined();
  });

  it('el empaque cuadra con el tipo', () => {
    expect(validarEmpaqueDeTipo('CONSUMIBLE', { nombre: '  Bote ', capacidad: '100' })).toEqual({
      nombre: 'Bote',
      capacidad: 100,
    });
    expect(validarEmpaqueDeTipo('EQUIPO', null)).toBeNull();
    expect(() => validarEmpaqueDeTipo('EQUIPO', { nombre: 'Caja', capacidad: 10 })).toThrow(/no lleva empaque/);
    expect(() => validarEmpaqueDeTipo(null, { nombre: 'Bote', capacidad: 10 })).toThrow(TipoArticuloInvalidoError);
    expect(() => validarEmpaqueDeTipo('MEDIDA', { nombre: 'Bobina', capacidad: 0 })).toThrow(
      'Indica cuántos metros trae cada bobina.',
    );
  });
});

type Fila = Record<string, any>;

function prismaFalso(opciones: { producto?: Fila | null; empaques?: Fila[]; skuOcupado?: boolean } = {}) {
  const prisma: any = {
    companyProfile: { findFirst: jest.fn() },
    product: {
      findFirst: jest.fn(async (args: any) => {
        // Búsqueda por SKU (alta o cambio de SKU) vs. lectura del producto a editar.
        if (args?.where?.sku) return opciones.skuOcupado ? { id: 99 } : null;
        return opciones.producto ?? null;
      }),
      create: jest.fn(async (args: any) => ({ id: 501, ...args.data })),
      update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
      findUniqueOrThrow: jest.fn(async (args: any) => ({ id: args.where.id, packagings: [] })),
    },
    productPackaging: {
      findMany: jest.fn(async () => opciones.empaques ?? []),
      updateMany: jest.fn(async () => ({ count: 0 })),
      update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
      create: jest.fn(async (args: any) => ({ id: 900, ...args.data })),
    },
    $queryRaw: jest.fn(async () => []),
  };
  prisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(prisma));
  return prisma;
}

describe('CatalogService · alta con tipo', () => {
  it('consumible: guarda el tipo, la unidad pz y el bote como empaque de compra', async () => {
    const prisma = prismaFalso();
    const service = new CatalogService(prisma);
    await service.createProduct({
      companyId: 7,
      sku: 'cin-20n',
      name: ' Cincho negro 20 cm ',
      tipoArticulo: 'CONSUMIBLE',
      empaque: { nombre: 'Bote', capacidad: 100 },
    });
    expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({
      sku: 'CIN-20N',
      name: 'Cincho negro 20 cm',
      tipoArticulo: 'CONSUMIBLE',
      unitName: 'pz',
      companyId: 7,
    });
    const empaque = prisma.productPackaging.create.mock.calls[0][0].data;
    expect(empaque).toMatchObject({ productId: 501, nombre: 'Bote', esDefaultCompra: true, companyId: 7 });
    expect(Number(empaque.piezasPorUnidad)).toBe(100);
    expect(prisma.product.findUniqueOrThrow.mock.calls[0][0].include.packagings).toBeDefined();
  });

  it('por medida sin unidad queda en metros', async () => {
    const prisma = prismaFalso();
    await new CatalogService(prisma).createProduct({ companyId: 7, name: 'UTP Cat6', sku: 'UTP', tipoArticulo: 'MEDIDA' });
    expect(prisma.product.create.mock.calls[0][0].data.unitName).toBe('m');
    expect(prisma.productPackaging.create).not.toHaveBeenCalled();
  });

  it('sin tipo se da de alta como siempre (el lector de almacén no manda tipo)', async () => {
    const prisma = prismaFalso();
    await new CatalogService(prisma).createProduct({ companyId: 7, name: 'Fuente', sku: 'F12' });
    expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({ tipoArticulo: null, unitName: null });
  });

  it('equipo con empaque: 400 claro y no se crea nada', async () => {
    const prisma = prismaFalso();
    await expect(
      new CatalogService(prisma).createProduct({
        companyId: 7,
        name: 'Cámara',
        tipoArticulo: 'EQUIPO',
        empaque: { nombre: 'Caja', capacidad: 10 },
      }),
    ).rejects.toThrow(new BadRequestException('El equipo se cuenta por pieza y no lleva empaque. Quita el empaque o elige «Consumible» o «Por medida».'));
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('herramienta: 400 que manda a Almacén → Herramientas', async () => {
    const prisma = prismaFalso();
    await expect(
      new CatalogService(prisma).createProduct({ companyId: 7, name: 'Taladro', tipoArticulo: 'HERRAMIENTA' }),
    ).rejects.toThrow(MENSAJE_TIPO_INVALIDO);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
});

describe('CatalogService · edición con tipo', () => {
  const producto = (extra: Fila = {}) => ({
    id: 40,
    sku: 'CIN-20N',
    name: 'Cincho',
    unitName: 'pz',
    tipoArticulo: 'CONSUMIBLE',
    specifications: { unit: 'pz' },
    companyId: 7,
    activo: true,
    ...extra,
  });

  it('sin tipo en el cuerpo, el empaque se revisa contra el tipo guardado', async () => {
    const prisma = prismaFalso({ producto: producto({ tipoArticulo: 'EQUIPO' }) });
    await expect(
      new CatalogService(prisma).updateProduct(40, { empaque: { nombre: 'Caja', capacidad: 4 } }, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('un empaque con el mismo nombre se corrige en vez de duplicarse, y queda como el de compra', async () => {
    const prisma = prismaFalso({
      producto: producto(),
      empaques: [
        { id: 5, nombre: 'Bote' },
        { id: 6, nombre: 'Bolsa' },
      ],
    });
    await new CatalogService(prisma).updateProduct(40, { empaque: { nombre: 'bote', capacidad: 50 } }, 7);
    expect(prisma.productPackaging.updateMany).toHaveBeenCalledWith({
      where: { productId: 40, esDefaultCompra: true, id: { not: 5 } },
      data: { esDefaultCompra: false },
    });
    const cambio = prisma.productPackaging.update.mock.calls[0][0];
    expect(cambio.where).toEqual({ id: 5 });
    expect(cambio.data.esDefaultCompra).toBe(true);
    expect(Number(cambio.data.piezasPorUnidad)).toBe(50);
    expect(prisma.productPackaging.create).not.toHaveBeenCalled();
  });

  it('cambiar a por medida propone metros, pero respeta una unidad capturada a mano', async () => {
    const prisma = prismaFalso({ producto: producto() });
    await new CatalogService(prisma).updateProduct(40, { tipoArticulo: 'MEDIDA' }, 7);
    expect(prisma.product.update.mock.calls[0][0].data).toMatchObject({ tipoArticulo: 'MEDIDA', unitName: 'm' });
    expect(prisma.product.update.mock.calls[0][0].data.specifications).toEqual({ unit: 'm' });

    const conKg = prismaFalso({ producto: producto({ unitName: 'kg' }) });
    await new CatalogService(conKg).updateProduct(40, { tipoArticulo: 'MEDIDA' }, 7);
    expect(conKg.product.update.mock.calls[0][0].data.unitName).toBe('kg');
    expect(conKg.product.update.mock.calls[0][0].data.specifications).toBeUndefined();
  });

  it('sin tipoArticulo en el cuerpo no toca el tipo; null lo deja sin tipo', async () => {
    const prisma = prismaFalso({ producto: producto() });
    await new CatalogService(prisma).updateProduct(40, { name: 'Cincho negro' }, 7);
    expect(prisma.product.update.mock.calls[0][0].data.tipoArticulo).toBeUndefined();

    const sinTipo = prismaFalso({ producto: producto() });
    await new CatalogService(sinTipo).updateProduct(40, { tipoArticulo: null }, 7);
    expect(sinTipo.product.update.mock.calls[0][0].data.tipoArticulo).toBeNull();
  });

  it('cambiar el SKU revisa que no lo tenga otro producto', async () => {
    const prisma = prismaFalso({ producto: producto(), skuOcupado: true });
    await expect(new CatalogService(prisma).updateProduct(40, { sku: 'otro-1' }, 7)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const libre = prismaFalso({ producto: producto() });
    await new CatalogService(libre).updateProduct(40, { sku: 'cin-20n' }, 7);
    // El mismo SKU (en otra capitalización) no es cambio.
    expect(libre.product.update.mock.calls[0][0].data.sku).toBeUndefined();
  });
});
