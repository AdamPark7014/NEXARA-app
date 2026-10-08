import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusquedaRapidaService, puedeVerAlmacen } from './busqueda-rapida.service.js';

const HERRAMIENTAS = [
  { id: 1, toolName: 'Taladro DeWalt', model: 'DCD771', serialNumber: 'A1', codigoInterno: 'TAL-A1', barcode: 'TAL-A1', status: 'AVAILABLE', panoramicPhotoUrl: '/uploads/tools/t.jpg', updatedAt: new Date('2026-10-01') },
  { id: 2, toolName: 'Taladro DeWalt', model: 'DCD771', serialNumber: 'A2', codigoInterno: 'TAL-A2', barcode: 'TAL-A2', status: 'ASSIGNED', panoramicPhotoUrl: '', updatedAt: new Date('2026-10-03') },
  { id: 3, toolName: 'Escalera tijera', model: '6 pies', serialNumber: 'E1', codigoInterno: 'ESC-E1', barcode: 'ESC-E1', status: 'ASSIGNED', panoramicPhotoUrl: '', updatedAt: new Date('2026-09-01') },
];

const CINCHO = {
  id: 100,
  name: 'Cincho negro 20 cm',
  sku: 'CIN-20N',
  tipoArticulo: 'CONSUMIBLE',
  category: 'Fijación',
  subcategory: null,
  codigoBarras: null,
  upc: null,
  ean: null,
  unitName: 'pz',
  imageUrl: null,
  thumbnailUrl: 'https://img/cincho.jpg',
  specifications: { marca: 'Thorsman' },
  updatedAt: new Date('2026-10-07'),
  brand: null,
  packagings: [{ id: 9, nombre: 'Bote', piezasPorUnidad: new Prisma.Decimal(100), esDefaultCompra: true, codigoBarras: 'BOTE-1' }],
};

function prismaFalso() {
  return {
    toolInventoryItem: { findMany: jest.fn(async () => HERRAMIENTAS) },
    toolKitAssignment: {
      findMany: jest.fn(async () => [
        { inventoryItemId: 2, user: { nombre: 'David', email: 'operaciones@nexara.com.mx' } },
        { inventoryItemId: 3, user: { nombre: null, email: 'jose.ramirez@nexara.com.mx' } },
      ]),
    },
    toolRequest: {
      // El préstamo en uso manda sobre el kit.
      findMany: jest.fn(async () => [{ inventoryItemId: 2, usuario: { nombre: 'José Antonio', email: null } }]),
    },
    product: {
      findMany: jest.fn(async () => [CINCHO]),
      groupBy: jest.fn(async () => [
        { tipoArticulo: 'CONSUMIBLE', _count: { _all: 12 } },
        { tipoArticulo: 'EQUIPO', _count: { _all: 4 } },
        { tipoArticulo: null, _count: { _all: 2 } },
      ]),
    },
    stockLevel: {
      findMany: jest.fn(async () => [
        { productId: 100, quantity: new Prisma.Decimal(300), minStock: new Prisma.Decimal(0), warehouse: { name: 'Bodega' }, location: { code: 'A-2', name: 'Pasillo A' } },
        { productId: 100, quantity: new Prisma.Decimal(40), minStock: new Prisma.Decimal(0), warehouse: { name: 'Bodega' }, location: { code: 'A-2', name: 'Pasillo A' } },
      ]),
    },
    $queryRaw: jest.fn(async () => [{ id: 100 }]),
  } as any;
}

describe('puedeVerAlmacen', () => {
  it('solo con stock.view o superadmin', () => {
    expect(puedeVerAlmacen({ permissions: ['tools.request', 'stock.view'] })).toBe(true);
    expect(puedeVerAlmacen({ permissions: ['tools.request', 'tools.manage'] })).toBe(false);
    expect(puedeVerAlmacen({ permissions: [], isSuperAdmin: true })).toBe(true);
    expect(puedeVerAlmacen(null)).toBe(false);
  });
});

describe('BusquedaRapidaService', () => {
  it('sin empresa no busca', async () => {
    await expect(new BusquedaRapidaService(prismaFalso()).buscar({ q: 'x' }, null)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('sin stock.view solo busca herramientas: ni toca los productos', async () => {
    const prisma = prismaFalso();
    const r = await new BusquedaRapidaService(prisma).buscar(
      { q: 'taladro', usuario: { permissions: ['tools.request'] } },
      7,
    );
    expect(r.incluyeAlmacen).toBe(false);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.product.groupBy).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.toolInventoryItem.findMany.mock.calls[0][0].where).toEqual({
      companyId: 7,
      status: { not: 'RETIRED' },
    });
    expect(r.resultados).toHaveLength(1);
    expect(r.resultados[0]).toMatchObject({
      origen: 'herramienta',
      nombre: 'Taladro DeWalt',
      estado: { texto: '1 disponible · 1 prestada', tono: 'success' },
      imagenUrl: '/uploads/tools/t.jpg',
    });
    expect(r.resultados[0].piezas).toEqual([
      { id: 1, codigo: 'TAL-A1', estado: 'Disponible', quienLaTiene: null },
      { id: 2, codigo: 'TAL-A2', estado: 'Prestada', quienLaTiene: 'José Antonio' },
    ]);
    // Quién la tiene se pregunta solo por las piezas que no están disponibles.
    expect(prisma.toolKitAssignment.findMany.mock.calls[0][0].where.inventoryItemId).toEqual({ in: [2] });
    expect(prisma.toolRequest.findMany.mock.calls[0][0].where).toMatchObject({
      inventoryItemId: { in: [2] },
      status: 'IN_USE',
      companyId: 7,
    });
  });

  it('con texto: la base filtra por empresa con las palabras sin acentos, como parámetros', async () => {
    const prisma = prismaFalso();
    const r = await new BusquedaRapidaService(prisma).buscar(
      { q: 'Cincho  FIJACIÓN', tipo: 'todos', usuario: { permissions: ['stock.view'] } },
      7,
    );
    const consulta = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(consulta.values).toEqual(expect.arrayContaining([7, 'cincho', 'fijacion']));
    expect(consulta.sql).not.toContain('cincho');
    expect(prisma.product.findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 7,
      activo: { not: false },
      itemType: 'PRODUCT',
      id: { in: [100] },
    });
    expect(r.incluyeAlmacen).toBe(true);
    expect(r.conteos).toMatchObject({ TODOS: 1, CONSUMIBLE: 1, HERRAMIENTA: 0 });
    expect(r.resultados[0]).toMatchObject({
      origen: 'articulo',
      id: 100,
      tipo: 'CONSUMIBLE',
      detalle: 'Thorsman · CIN-20N',
      imagenUrl: 'https://img/cincho.jpg',
      existencia: { cantidad: 340, unidad: 'pz', texto: '3 botes + 40 pz (340 pz)', bajoMinimo: false },
      ubicacion: 'Bodega A-2',
      href: '/erp/almacen?producto=100',
    });
    expect(prisma.stockLevel.findMany.mock.calls[0][0].where).toMatchObject({ productId: { in: [100] }, companyId: 7 });
  });

  it('el escáner con el código del bote abre el cincho', async () => {
    const prisma = prismaFalso();
    const r = await new BusquedaRapidaService(prisma).buscar(
      { q: 'bote-1', usuario: { permissions: ['stock.view'] } },
      7,
    );
    expect(r.resultados[0]).toMatchObject({ id: 100, codigoBarras: 'BOTE-1' });
  });

  it('sin texto: lo reciente del tipo pedido y los totales contados en la base', async () => {
    const prisma = prismaFalso();
    const r = await new BusquedaRapidaService(prisma).buscar(
      { q: '', tipo: 'CONSUMIBLE', limite: '10', usuario: { permissions: ['stock.view'] } },
      7,
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.product.findMany.mock.calls[0][0]).toMatchObject({
      where: { companyId: 7, tipoArticulo: 'CONSUMIBLE' },
      take: 10,
    });
    expect(r.conteos).toEqual({ TODOS: 20, HERRAMIENTA: 2, EQUIPO: 4, CONSUMIBLE: 12, MEDIDA: 0, SIN_TIPO: 2 });
    expect(r.resultados.map((x) => x.id)).toEqual([100]);
  });

  it('sin texto y chip Herramientas: no trae productos, pero sí los cuenta', async () => {
    const prisma = prismaFalso();
    const r = await new BusquedaRapidaService(prisma).buscar(
      { tipo: 'HERRAMIENTA', usuario: { permissions: ['stock.view'] } },
      7,
    );
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.product.groupBy).toHaveBeenCalled();
    // La escalera la tiene alguien por kit: sale su correo porque no tiene nombre.
    expect(r.resultados.map((x) => x.nombre)).toEqual(['Taladro DeWalt', 'Escalera tijera']);
    expect(r.resultados[1].piezas?.[0].quienLaTiene).toBe('jose.ramirez@nexara.com.mx');
  });
});
