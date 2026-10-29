// Los mocks van antes de los imports: con `isolatedModules` ts-jest no los sube solo, y sin esto
// la prueba del croquis escribía de verdad en `uploads/`.
const mockWriteFile = jest.fn();
const mockGetUploadSubdir = jest.fn(() => '/tmp/uploads/cctv-croquis');
jest.mock('../common/upload-paths', () => ({ getUploadSubdir: (...args: unknown[]) => mockGetUploadSubdir(...(args as [])) }));
jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return { ...real, promises: { ...real.promises, writeFile: (...args: unknown[]) => mockWriteFile(...args) } };
});
const fsMock = { writeFile: mockWriteFile };

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CctvDisenosService, LISTA_DISENOS_MAX, type ActorCctv } from './cctv-disenos.service';
import { ConflictoVersionDiseno, MENSAJE_CONFLICTO_VERSION } from './conflicto-version';
import { leerImagenCroquis } from './croquis-imagen';
import { MENSAJE_SIN_ACCESO_CCTV } from './acceso-cctv';
import { PLANO_MAX_CARACTERES, planoVacio } from './plano-cctv';

/**
 * Diseños de videovigilancia: quién entra, que dos encargados no se pisen (versión), que nada
 * cruce de empresa y que el plano tenga la forma y el tamaño acordados.
 */

const EMPRESA = 1;

const DAVID: ActorCctv = { id: 20, roleKey: 'coord_operaciones', isSuperAdmin: false, email: 'operaciones@nexara.com.mx' };
const JOSE_ANTONIO: ActorCctv = { id: 15, roleKey: 'ing_soporte', isSuperAdmin: false, email: 'jose.ramirez@nexara.com.mx' };
const CAROLINA: ActorCctv = { id: 40, roleKey: 'ing_soporte', isSuperAdmin: false, email: 'soporte@nexara.com.mx' };
const JOAN: ActorCctv = { id: 30, roleKey: 'ing_campo', isSuperAdmin: false, email: 'joan.sanchez@nexara.com.mx' };

const PERSONAS = [
  { id: 20, nombre: 'David Morales' },
  { id: 15, nombre: 'José Antonio Ramírez' },
];

const CREADO = new Date('2026-10-29T15:00:00Z');
const EDITADO = new Date('2026-10-29T16:30:00Z');

function filaDb(extra: Record<string, unknown> = {}) {
  return {
    id: 7,
    nombre: 'Bodega Toks Cholula',
    clienteId: 3,
    cotizacionId: null,
    estado: 'borrador',
    resumen: { camaras: 4, cobertura: 82 },
    version: 2,
    creadoPorId: 20,
    actualizadoPorId: 15,
    createdAt: CREADO,
    updatedAt: EDITADO,
    plano: planoVacio(),
    grabacion: null,
    ...extra,
  };
}

function build(opciones: { reportesDe?: Record<number, number> } = {}) {
  const reportesDe = opciones.reportesDe ?? { 15: 3 };
  const prisma: any = {
    user: {
      count: jest.fn(async ({ where }: any) => reportesDe[where.managerId] ?? 0),
      findMany: jest.fn(async ({ where }: any) => PERSONAS.filter((p) => where.id.in.includes(p.id))),
    },
    salesClient: {
      // Solo el cliente 3 es de la empresa 1.
      findMany: jest.fn(async ({ where }: any) =>
        where.companyId === EMPRESA && (where.id.in as number[]).includes(3) ? [{ id: 3, name: 'Toks' }] : [],
      ),
    },
    cotizacion: {
      findMany: jest.fn(async ({ where }: any) =>
        (where.id.in as number[]).filter((id) => id === 11 && where.companyId === EMPRESA).map((id) => ({ id })),
      ),
    },
    cctvDiseno: {
      findMany: jest.fn().mockResolvedValue([filaDb()]),
      findFirst: jest.fn().mockResolvedValue(filaDb()),
      create: jest.fn().mockResolvedValue({ id: 7 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { service: new CctvDisenosService(prisma), prisma };
}

describe('acceso', () => {
  it('David entra sin que se cuente su gente', async () => {
    const { service, prisma } = build();
    await expect(service.acceso(DAVID)).resolves.toEqual({ puede: true });
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('José Antonio entra por tener gente a cargo; Carolina no; Joan nunca', async () => {
    const { service } = build();
    await expect(service.acceso(JOSE_ANTONIO)).resolves.toEqual({ puede: true });
    await expect(service.acceso(CAROLINA)).resolves.toEqual({ puede: false });
    await expect(service.acceso(JOAN)).resolves.toEqual({ puede: false });
  });

  it('los demás endpoints responden 403 con el motivo', async () => {
    const { service, prisma } = build();
    const intento = service.listar(CAROLINA, EMPRESA);
    await expect(intento).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listar(CAROLINA, EMPRESA)).rejects.toThrow(MENSAJE_SIN_ACCESO_CCTV);
    await expect(service.crear(JOAN, { nombre: 'X' }, EMPRESA)).rejects.toThrow(MENSAJE_SIN_ACCESO_CCTV);
    await expect(service.detalle(JOAN, 7, EMPRESA)).rejects.toThrow(MENSAJE_SIN_ACCESO_CCTV);
    await expect(service.guardar(JOAN, 7, { version: 2 }, EMPRESA)).rejects.toThrow(MENSAJE_SIN_ACCESO_CCTV);
    await expect(service.archivar(JOAN, 7, EMPRESA)).rejects.toThrow(MENSAJE_SIN_ACCESO_CCTV);
    await expect(service.subirCroquis(JOAN, 7, undefined, EMPRESA)).rejects.toThrow(MENSAJE_SIN_ACCESO_CCTV);
    expect(prisma.cctvDiseno.findMany).not.toHaveBeenCalled();
    expect(prisma.cctvDiseno.updateMany).not.toHaveBeenCalled();
  });
});

describe('listar', () => {
  it('lo vivo de la empresa, lo más reciente primero, con nombres y sin el plano', async () => {
    const { service, prisma } = build();
    const r = await service.listar(DAVID, EMPRESA);

    const args = prisma.cctvDiseno.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ companyId: EMPRESA, archivadoAt: null });
    expect(args.orderBy[0]).toEqual({ updatedAt: 'desc' });
    expect(args.take).toBe(LISTA_DISENOS_MAX);
    expect(args.select.plano).toBeUndefined();
    expect(args.select.grabacion).toBeUndefined();

    expect(r.disenos).toEqual([
      {
        id: 7,
        nombre: 'Bodega Toks Cholula',
        clienteId: 3,
        clienteNombre: 'Toks',
        cotizacionId: null,
        estado: 'borrador',
        resumen: { camaras: 4, cobertura: 82 },
        version: 2,
        creadoPor: { id: 20, nombre: 'David Morales' },
        actualizadoPor: { id: 15, nombre: 'José Antonio Ramírez' },
        createdAt: CREADO.toISOString(),
        updatedAt: EDITADO.toISOString(),
      },
    ]);
  });

  it('sin empresa no lista nada (403), nunca una consulta sin filtro', async () => {
    const { service, prisma } = build();
    await expect(service.listar(DAVID, null)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.cctvDiseno.findMany).not.toHaveBeenCalled();
  });
});

describe('detalle', () => {
  it('trae plano y grabación', async () => {
    const { service, prisma } = build();
    const r = await service.detalle(DAVID, 7, EMPRESA);
    expect(prisma.cctvDiseno.findFirst.mock.calls[0][0].where).toEqual({ id: 7, companyId: EMPRESA, archivadoAt: null });
    expect(r.plano).toEqual(planoVacio());
    expect(r.grabacion).toBeNull();
    expect(r.clienteNombre).toBe('Toks');
  });

  it('404 si no existe, es de otra empresa o está archivado', async () => {
    const { service, prisma } = build();
    prisma.cctvDiseno.findFirst.mockResolvedValue(null);
    await expect(service.detalle(DAVID, 99, EMPRESA)).rejects.toThrow(new NotFoundException('Diseño no encontrado'));
  });
});

describe('crear', () => {
  it('sin plano empieza con el plano vacío; el nombre se limpia', async () => {
    const { service, prisma } = build();
    await service.crear(JOSE_ANTONIO, { nombre: '  Bodega   Toks  ', clienteId: 3 }, EMPRESA);
    const { data } = prisma.cctvDiseno.create.mock.calls[0][0];
    expect(data).toEqual({
      companyId: EMPRESA,
      nombre: 'Bodega Toks',
      clienteId: 3,
      cotizacionId: null,
      plano: planoVacio(),
      creadoPorId: 15,
    });
  });

  it('un plano sin sus listas o de otra versión no se guarda', async () => {
    const { service, prisma } = build();
    await expect(service.crear(DAVID, { nombre: 'A', plano: { version: 2 } }, EMPRESA)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const { muros: _muros, ...sinMuros } = planoVacio();
    await expect(service.crear(DAVID, { nombre: 'A', plano: sinMuros }, EMPRESA)).rejects.toThrow(/muros/);
    expect(prisma.cctvDiseno.create).not.toHaveBeenCalled();
  });

  it('nombre en blanco: 400', async () => {
    const { service } = build();
    await expect(service.crear(DAVID, { nombre: '   ' }, EMPRESA)).rejects.toThrow('Escribe un nombre para el diseño.');
  });

  it('un cliente o una cotización de otra empresa no se cuelan', async () => {
    const { service, prisma } = build();
    await expect(service.crear(DAVID, { nombre: 'A', clienteId: 999 }, EMPRESA)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.crear(DAVID, { nombre: 'A', cotizacionId: 12 }, EMPRESA)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.cctvDiseno.create).not.toHaveBeenCalled();
    await expect(service.crear(DAVID, { nombre: 'A', cotizacionId: 11 }, EMPRESA)).resolves.toMatchObject({ id: 7 });
  });
});

describe('guardar (concurrencia optimista)', () => {
  it('un solo updateMany que exige la versión abierta, sube la versión y marca quién', async () => {
    const { service, prisma } = build();
    const plano = { ...planoVacio(), camaras: [{ id: 'c1' }] };
    await service.guardar(
      JOSE_ANTONIO,
      7,
      { version: 2, nombre: 'Bodega 2', estado: 'enviada', plano, resumen: { camaras: 1 }, grabacion: null, clienteId: null },
      EMPRESA,
    );
    expect(prisma.cctvDiseno.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = prisma.cctvDiseno.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 7, companyId: EMPRESA, version: 2, archivadoAt: null });
    expect(data).toEqual({
      version: { increment: 1 },
      actualizadoPorId: 15,
      nombre: 'Bodega 2',
      estado: 'enviada',
      clienteId: null,
      plano,
      grabacion: Prisma.DbNull,
      resumen: { camaras: 1 },
    });
  });

  it('si alguien guardó antes: 409 con su versión, y no se pisa nada', async () => {
    const { service, prisma } = build();
    prisma.cctvDiseno.updateMany.mockResolvedValue({ count: 0 });
    prisma.cctvDiseno.findFirst.mockResolvedValue({ version: 5 });
    const error = await service.guardar(DAVID, 7, { version: 2, nombre: 'Mío' }, EMPRESA).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictoVersionDiseno);
    expect(error.versionActual).toBe(5);
    expect(error.getStatus()).toBe(409);
    expect(error.message).toBe(MENSAJE_CONFLICTO_VERSION);
  });

  it('si ya no existe (o se archivó): 404', async () => {
    const { service, prisma } = build();
    prisma.cctvDiseno.updateMany.mockResolvedValue({ count: 0 });
    prisma.cctvDiseno.findFirst.mockResolvedValue(null);
    await expect(service.guardar(DAVID, 7, { version: 2 }, EMPRESA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un plano de más de 2 millones de caracteres no se guarda', async () => {
    const { service, prisma } = build();
    const enorme = { ...planoVacio(), etiquetas: [{ texto: 'x'.repeat(PLANO_MAX_CARACTERES) }] };
    await expect(service.guardar(DAVID, 7, { version: 2, plano: enorme }, EMPRESA)).rejects.toThrow(
      'El plano es demasiado grande.',
    );
    expect(prisma.cctvDiseno.updateMany).not.toHaveBeenCalled();
  });

  it('el plano no se puede quitar ni el estado inventar', async () => {
    const { service } = build();
    await expect(service.guardar(DAVID, 7, { version: 2, plano: null as any }, EMPRESA)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.guardar(DAVID, 7, { version: 2, estado: 'cerrada' as any }, EMPRESA)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('archivar', () => {
  it('marca archivadoAt (no borra)', async () => {
    const { service, prisma } = build();
    await expect(service.archivar(DAVID, 7, EMPRESA)).resolves.toEqual({ ok: true, id: 7 });
    const { where, data } = prisma.cctvDiseno.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 7, companyId: EMPRESA, archivadoAt: null });
    expect(data.archivadoAt).toBeInstanceOf(Date);
    expect(data.actualizadoPorId).toBe(20);
  });

  it('404 si no está', async () => {
    const { service, prisma } = build();
    prisma.cctvDiseno.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.archivar(DAVID, 7, EMPRESA)).rejects.toThrow('Diseño no encontrado');
  });
});

describe('croquis', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sharp = require('sharp');
  const png = () =>
    sharp({ create: { width: 64, height: 40, channels: 3, background: '#ffffff' } }).png().toBuffer() as Promise<Buffer>;

  beforeEach(() => fsMock.writeFile.mockReset().mockResolvedValue(undefined));

  it('guarda la imagen con nombre propio y devuelve sus medidas', async () => {
    const { service } = build();
    const buffer = await png();
    const r = await service.subirCroquis(
      DAVID,
      7,
      { buffer, mimetype: 'image/png', originalname: 'plano.svg', size: buffer.length },
      EMPRESA,
    );
    expect(r.anchoPx).toBe(64);
    expect(r.altoPx).toBe(40);
    // La extensión sale del formato real, no del nombre que mandó el navegador.
    expect(r.url).toMatch(/^\/uploads\/cctv-croquis\/7-\d+-[0-9a-f]{16}\.png$/);
    expect(mockGetUploadSubdir).toHaveBeenCalledWith(expect.any(String), 'cctv-croquis');
    expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
    expect(String(fsMock.writeFile.mock.calls[0][0])).toMatch(/cctv-croquis[\\/]7-\d+-[0-9a-f]{16}\.png$/);
  });

  it('lo que no es PNG, JPEG o WebP no se guarda, aunque diga image/png', async () => {
    await expect(
      leerImagenCroquis({ buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mimetype: 'image/png' }),
    ).rejects.toThrow('El croquis debe ser una imagen PNG, JPEG o WebP.');
    await expect(leerImagenCroquis({ buffer: await png(), mimetype: 'image/svg+xml' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(leerImagenCroquis({ buffer: Buffer.alloc(0), mimetype: 'image/png' })).rejects.toThrow(
      'Falta la imagen del croquis.',
    );
  });

  it('más de 20 MB: 400', async () => {
    await expect(
      leerImagenCroquis({ buffer: Buffer.alloc(20 * 1024 * 1024 + 1), mimetype: 'image/png' }),
    ).rejects.toThrow('El croquis no puede pasar de 20 MB.');
  });

  it('a un diseño que no existe no se le sube nada', async () => {
    const { service, prisma } = build();
    prisma.cctvDiseno.findFirst.mockResolvedValue(null);
    await expect(
      service.subirCroquis(DAVID, 99, { buffer: await png(), mimetype: 'image/png' }, EMPRESA),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });
});
