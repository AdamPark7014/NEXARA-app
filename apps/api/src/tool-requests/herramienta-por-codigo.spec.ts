import { ConflictException, NotFoundException } from '@nestjs/common';
import { ToolRequestsService } from './tool-requests.service.js';
import { TOOLS_MANAGE_EMAILS } from './tools-access.js';
import { codigoDeEtiqueta, normalizarCodigoEtiqueta } from './tool-nomenclature.js';

/**
 * Herramientas por etiqueta.
 *
 * La etiqueta lleva la nomenclatura interna que ya existía (`MUL-12345`), no una
 * numeración nueva. Estas pruebas cuidan que el lector encuentre la herramienta de la
 * etiqueta —también las que se dieron de alta antes de tener código— y que el código
 * de recolección no lo vea quien no entrega.
 */

const EMPRESA = 7;
const ENCARGADO = { id: 1, email: TOOLS_MANAGE_EMAILS[1], permissions: ['tools.manage'] };
const TECNICO = { id: 3, email: 'jose.ramirez@nexara.com.mx', permissions: ['tools.view'] };

const MULTIMETRO = {
  id: 42,
  toolName: 'Multímetro Fluke 87V',
  model: '87V',
  serialNumber: '12345',
  codigoInterno: 'MUL-12345',
  barcode: 'MUL-12345',
  status: 'AVAILABLE',
  panoramicPhotoUrl: '/uploads/tools/a.jpg',
  serialPhotoUrl: '/uploads/tools/b.jpg',
  companyId: EMPRESA,
};

function build(over: { items?: any[][]; prestamo?: any; kit?: any } = {}) {
  const findMany = jest.fn();
  for (const lote of over.items ?? [[MULTIMETRO]]) findMany.mockResolvedValueOnce(lote);
  findMany.mockResolvedValue([]);

  const prisma = {
    toolInventoryItem: {
      findMany,
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn(async ({ data }: any) => ({ id: 77, ...data })),
      findFirst: jest.fn(),
    },
    toolRequest: { findFirst: jest.fn().mockResolvedValue(over.prestamo ?? null) },
    toolKitAssignment: {
      findFirst: jest.fn().mockResolvedValue(over.kit ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const service = new ToolRequestsService(prisma as any, {} as any);
  return { service, prisma };
}

describe('código de la etiqueta', () => {
  it('es la nomenclatura que ya existía; solo se calcula si falta', () => {
    expect(codigoDeEtiqueta(MULTIMETRO)).toBe('MUL-12345');
    expect(codigoDeEtiqueta({ ...MULTIMETRO, barcode: null })).toBe('MUL-12345');
    expect(
      codigoDeEtiqueta({ toolName: 'Taladro Bosch', serialNumber: 'sn 99/a', barcode: null, codigoInterno: null }),
    ).toBe('TAL-SN-99-A');
    // Un código de barras propio (el del fabricante) manda sobre el interno.
    expect(codigoDeEtiqueta({ ...MULTIMETRO, barcode: 'FLK-0001' })).toBe('FLK-0001');
  });

  it('lo que entrega el lector se limpia y se compara en mayúsculas', () => {
    expect(normalizarCodigoEtiqueta('  mul-12345\r\n')).toBe('MUL-12345');
    expect(normalizarCodigoEtiqueta(null)).toBe('');
  });
});

describe('buscarHerramientaPorCodigo', () => {
  it('encuentra la herramienta por código interno, de barras o serie, sin importar mayúsculas', async () => {
    const { service, prisma } = build();

    const r = await service.buscarHerramientaPorCodigo(' mul-12345\n', ENCARGADO, EMPRESA);

    const where = prisma.toolInventoryItem.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(EMPRESA);
    expect(where.OR).toEqual([
      { barcode: { equals: 'MUL-12345', mode: 'insensitive' } },
      { codigoInterno: { equals: 'MUL-12345', mode: 'insensitive' } },
      { serialNumber: { equals: 'MUL-12345', mode: 'insensitive' } },
    ]);
    expect(r).toMatchObject({
      codigo: 'MUL-12345',
      item: { id: 42, toolName: 'Multímetro Fluke 87V', status: 'AVAILABLE', codigoInterno: 'MUL-12345' },
      prestamo: null,
      kit: null,
      esMia: false,
    });
  });

  it('dice quién la tiene: préstamo de una actividad', async () => {
    const { service } = build({
      prestamo: {
        id: 5,
        status: 'IN_USE',
        usuarioId: 3,
        usuario: { id: 3, nombre: 'José Antonio', email: TECNICO.email },
        activity: { id: 9, anNumber: 'AN-0009', titulo: 'Instalación CCTV' },
        expectedReturnDate: new Date('2026-10-05T18:00:00Z'),
        pickupCode: 'A3F7KD',
        pickupExpiresAt: null,
      },
    });

    const r = await service.buscarHerramientaPorCodigo('MUL-12345', ENCARGADO, EMPRESA);

    expect(r.prestamo).toMatchObject({
      id: 5,
      status: 'IN_USE',
      usuario: { nombre: 'José Antonio' },
      activity: { anNumber: 'AN-0009' },
      pickupCode: 'A3F7KD',
      vencido: false,
    });
  });

  it('quien no entrega no ve el código de recolección, pero sí que es suya', async () => {
    const { service } = build({
      prestamo: {
        id: 5,
        status: 'APPROVED',
        usuarioId: TECNICO.id,
        usuario: { id: TECNICO.id, nombre: 'José Antonio', email: TECNICO.email },
        activity: null,
        expectedReturnDate: new Date(),
        pickupCode: 'A3F7KD',
        pickupExpiresAt: new Date(Date.now() - 60_000),
      },
    });

    const r = await service.buscarHerramientaPorCodigo('MUL-12345', TECNICO, EMPRESA);

    expect(r.prestamo?.pickupCode).toBeNull();
    expect(r.prestamo?.vencido).toBe(true);
    expect(r.esMia).toBe(true);
  });

  it('dice en qué kit está', async () => {
    const { service } = build({
      kit: {
        id: 12,
        userId: 3,
        assignmentType: 'KIT',
        assignedAt: new Date('2026-09-01T15:00:00Z'),
        user: { id: 3, nombre: 'José Antonio', email: TECNICO.email },
      },
    });
    const r = await service.buscarHerramientaPorCodigo('MUL-12345', ENCARGADO, EMPRESA);
    expect(r.kit).toMatchObject({ id: 12, assignmentType: 'KIT', user: { nombre: 'José Antonio' } });
  });

  it('una herramienta sin código guardado se encuentra por el calculado, y se le guarda', async () => {
    const vieja = { ...MULTIMETRO, id: 50, toolName: 'Taladro Bosch', serialNumber: 'B-778', codigoInterno: null, barcode: null };
    const otra = { ...vieja, id: 51, serialNumber: 'B-900' };
    const { service, prisma } = build({ items: [[], [vieja, otra]] });

    const r = await service.buscarHerramientaPorCodigo('TAL-B-778', ENCARGADO, EMPRESA);

    expect(r.item).toMatchObject({ id: 50, codigoInterno: 'TAL-B-778', barcode: 'TAL-B-778' });
    expect(prisma.toolInventoryItem.update).toHaveBeenCalledTimes(1);
    expect(prisma.toolInventoryItem.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { codigoInterno: 'TAL-B-778', barcode: 'TAL-B-778' },
    });
  });

  it('entre una retirada y su reemplazo gana la que sigue viva', async () => {
    const retirada = { ...MULTIMETRO, id: 40, status: 'RETIRED' };
    const { service } = build({ items: [[retirada, MULTIMETRO]] });
    const r = await service.buscarHerramientaPorCodigo('MUL-12345', ENCARGADO, EMPRESA);
    expect(r.item.id).toBe(42);
  });

  it('dos herramientas vivas con el mismo código: lo dice, no elige al azar', async () => {
    const { service } = build({ items: [[MULTIMETRO, { ...MULTIMETRO, id: 43 }]] });
    await expect(
      service.buscarHerramientaPorCodigo('MUL-12345', ENCARGADO, EMPRESA),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('etiqueta desconocida → 404; código vacío → 400', async () => {
    const { service } = build({ items: [[], []] });
    await expect(
      service.buscarHerramientaPorCodigo('XXX-000', ENCARGADO, EMPRESA),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.buscarHerramientaPorCodigo(' ', ENCARGADO, EMPRESA)).rejects.toThrow(
      /Escanea la etiqueta/,
    );
  });
});

describe('códigos que faltaban', () => {
  it('el inventario completa y guarda el código de las herramientas que no lo tenían', async () => {
    const sinCodigo = { ...MULTIMETRO, id: 60, codigoInterno: null, barcode: null };
    const { service, prisma } = build({ items: [[MULTIMETRO, sinCodigo]] });

    const lista = await service.getInventory(undefined, false, EMPRESA);

    expect(lista.map((i: any) => i.codigoInterno)).toEqual(['MUL-12345', 'MUL-12345']);
    // Solo se escribe la que no tenía: la otra no se toca.
    expect(prisma.toolInventoryItem.update).toHaveBeenCalledTimes(1);
    expect(prisma.toolInventoryItem.update.mock.calls[0][0].where).toEqual({ id: 60 });
  });

  it('el buscador del inventario también busca por el código de la etiqueta', async () => {
    const { service, prisma } = build();
    await service.getInventory('MUL-12345', false, EMPRESA);
    const or = prisma.toolInventoryItem.findMany.mock.calls[0][0].where.OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { codigoInterno: { contains: 'MUL-12345', mode: 'insensitive' } },
        { barcode: { contains: 'MUL-12345', mode: 'insensitive' } },
      ]),
    );
  });

  it('un reemplazo entra con su propio código, listo para etiquetar', async () => {
    const { service, prisma } = build();
    prisma.toolInventoryItem.findFirst.mockResolvedValue({ ...MULTIMETRO });

    await service.replaceInventoryItem(
      42,
      {
        toolName: 'Multímetro Fluke 87V',
        model: '87V',
        serialNumber: '98765',
        panoramicPhotoUrl: '/a.jpg',
        serialPhotoUrl: '/b.jpg',
      },
      1,
      EMPRESA,
    );

    expect(prisma.toolInventoryItem.create.mock.calls[0][0].data).toMatchObject({
      serialNumber: '98765',
      codigoInterno: 'MUL-98765',
      barcode: 'MUL-98765',
    });
  });
});
