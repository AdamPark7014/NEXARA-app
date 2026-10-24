import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GuardiasService } from './guardias.service.js';
import { esSabadoODomingo } from './guardias-reglas.js';

/**
 * Quién programa guardias: el organigrama de Adam, no el `managerId`.
 * Christian (superadmin) a cualquiera. David solo a sus tres instaladores.
 * José solo a su equipo de soporte. Iván no está en ninguno. Luis, aunque
 * su rol sea de coordinación, no programa a nadie.
 */

/** Jueves 1 de octubre de 2026, 12:00 en México. */
const JUEVES = new Date('2026-10-01T18:00:00Z');
const SABADO = '2026-10-03';
const DOMINGO = '2026-10-04';

const CEO = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' };
const DAVID = { id: 8, email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const JOSE = { id: 39, email: 'jose.ramirez@nexara.com.mx', roleKey: 'enc_soporte' };
const LUIS = { id: 7, email: 'direccion.operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const IVAN = { id: 10, email: 'administracion.ventas@nexara.com.mx', roleKey: 'ing_campo' };
const SUPER = { id: 99, email: 'rrhh@nexara.com.mx', roleKey: 'administrativo', isSuperAdmin: true };

const PADRON = [
  { id: 1, email: 'gerencia@nexara.com.mx', managerId: null, nombre: 'Christian Eduardo Del Pozo Sánchez', puesto: 'Director General', avatarUrl: null },
  { id: 8, email: 'operaciones@nexara.com.mx', managerId: 1, nombre: 'David Morales Zenón', puesto: 'Encargado de instalación', avatarUrl: null },
  { id: 57, email: 'salvador.hernandez@nexara.com.mx', managerId: 8, nombre: 'Salvador Hernández Páramo', puesto: 'Técnico Instalador', avatarUrl: null },
  { id: 16, email: 'israel.ramos@nexara.com.mx', managerId: 8, nombre: 'Israel Ramos Lima', puesto: 'Técnico Instalador', avatarUrl: null },
  { id: 58, email: 'erick.juarez@nexara.com.mx', managerId: 8, nombre: 'Erick Ernesto Juárez Muñoz', puesto: 'Técnico Instalador', avatarUrl: null },
  { id: 39, email: 'jose.ramirez@nexara.com.mx', managerId: 1, nombre: 'José Antonio Ramírez Salazar', puesto: 'Encargado de soporte', avatarUrl: null },
  { id: 15, email: 'alejandro.gonzalez@nexara.com.mx', managerId: 39, nombre: 'Alejandro González Bustamante', puesto: 'Ingeniero de Soporte', avatarUrl: null },
  { id: 13, email: 'soporte@nexara.com.mx', managerId: 39, nombre: 'Carolina Juárez Álvarez', puesto: 'Ingeniero de Soporte', avatarUrl: null },
  { id: 40, email: 'roberto.vivanco@nexara.com.mx', managerId: 39, nombre: 'Roberto Paul Vivanco López', puesto: 'Ingeniero de Soporte', avatarUrl: null },
  { id: 10, email: 'administracion.ventas@nexara.com.mx', managerId: 39, nombre: 'Iván Camargo Cañete', puesto: 'Técnico Instalador', avatarUrl: null },
  { id: 3, email: 'infraestructura@nexara.com.mx', managerId: 1, nombre: 'Josué Teodulo Cervantes Arellano', puesto: 'Encargado de Obra', avatarUrl: null },
  { id: 5, email: 'soluciones@nexara.com.mx', managerId: 1, nombre: 'Mónica García Guzmán', puesto: 'Administrativo', avatarUrl: null },
  { id: 38, email: 'daniela.hernandez@nexara.com.mx', managerId: 1, nombre: 'Daniela Hernández Cruz', puesto: 'Encargada comercial', avatarUrl: null },
  { id: 41, email: 'finanzas@nexara.com.mx', managerId: 1, nombre: 'Paulina Tlapaltotoli Álvarez', puesto: 'Contador(a) General', avatarUrl: null },
  { id: 7, email: 'direccion.operaciones@nexara.com.mx', managerId: 1, nombre: 'Luis Joel Aguilar Castillo', puesto: 'Encargado de servicios', avatarUrl: null },
];

function build() {
  const prisma: any = {
    user: {
      findMany: jest.fn().mockResolvedValue(PADRON),
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id === 50) return { id: 50, email: 'baja@nexara.com.mx', isActive: false };
        const u = PADRON.find((p) => p.id === where.id);
        return u ? { id: u.id, email: u.email, isActive: true } : null;
      }),
    },
    guardia: {
      create: jest.fn(async ({ data }: any) => ({
        id: 9,
        userId: data.userId,
        fecha: data.fecha,
        nota: data.nota,
        createdAt: new Date(),
        user: PADRON.find((p) => p.id === data.userId),
        creadoPor: { id: data.creadoPorId, nombre: 'Quien programa' },
      })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const notifications = { createNotification: jest.fn().mockResolvedValue(undefined) };
  const service = new GuardiasService(prisma, notifications as any);
  return { service, prisma, notifications };
}

beforeEach(() => jest.useFakeTimers().setSystemTime(JUEVES));
afterEach(() => jest.useRealTimers());

describe('sábado o domingo', () => {
  it('solo esos dos días; fechas que no existen tampoco', () => {
    expect(esSabadoODomingo(SABADO)).toBe(true);
    expect(esSabadoODomingo(DOMINGO)).toBe(true);
    expect(esSabadoODomingo('2026-10-02')).toBe(false);
    expect(esSabadoODomingo('2026-10-05')).toBe(false);
    expect(esSabadoODomingo('2026-02-30')).toBe(false);
    expect(esSabadoODomingo('3/10/2026')).toBe(false);
  });
});

describe('programar guardias', () => {
  it('Christian programa a cualquiera de su empresa, también a quien no tiene equipo, y la persona se entera', async () => {
    const { service, prisma, notifications } = build();
    const g = await service.programar(CEO, { userId: 57, fecha: SABADO, nota: '  Guardia de  instalación ' }, 7);

    expect(prisma.guardia.create.mock.calls[0][0].data).toEqual({
      companyId: 7,
      userId: 57,
      fecha: new Date('2026-10-03T00:00:00.000Z'),
      nota: 'Guardia de instalación',
      creadoPorId: 1,
    });
    expect(g).toMatchObject({ userId: 57, fecha: SABADO, puedeQuitar: true });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 57, companyId: 7, title: expect.stringMatching(/guardia/) }),
    );

    await service.programar(CEO, { userId: 10, fecha: DOMINGO }, 7);
    expect(prisma.guardia.create).toHaveBeenCalledTimes(2);
  });

  it('un superadmin que no es el correo de gerencia también programa a cualquiera', async () => {
    const { service, prisma } = build();
    await service.programar(SUPER, { userId: 10, fecha: SABADO }, 7);
    expect(prisma.guardia.create).toHaveBeenCalled();
  });

  it('David solo programa a sus tres instaladores', async () => {
    const { service, prisma } = build();
    await service.programar(DAVID, { userId: 57, fecha: DOMINGO }, 7);
    await service.programar(DAVID, { userId: 16, fecha: SABADO }, 7);
    await service.programar(DAVID, { userId: 58, fecha: DOMINGO }, 7);
    expect(prisma.guardia.create).toHaveBeenCalledTimes(3);
  });

  it('David no programa soporte, a Iván, a quien reporta directo a Christian ni a sí mismo', async () => {
    const { service, prisma } = build();
    for (const userId of [15, 10, 7, 5, 8]) {
      await expect(service.programar(DAVID, { userId, fecha: SABADO }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(prisma.guardia.create).not.toHaveBeenCalled();
  });

  it('José solo programa a Alejandro, Carolina y Roberto', async () => {
    const { service, prisma } = build();
    await service.programar(JOSE, { userId: 15, fecha: SABADO }, 7);
    await service.programar(JOSE, { userId: 13, fecha: DOMINGO }, 7);
    await service.programar(JOSE, { userId: 40, fecha: SABADO }, 7);
    expect(prisma.guardia.create).toHaveBeenCalledTimes(3);
    for (const userId of [10, 57, 39]) {
      await expect(service.programar(JOSE, { userId, fecha: SABADO }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('Luis no programa a nadie aunque su rol sea de coordinación', async () => {
    const { service } = build();
    await expect(service.programar(LUIS, { userId: 57, fecha: SABADO }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.programar(IVAN, { userId: 57, fecha: SABADO }, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('entre semana no: las guardias son solo sábado o domingo', async () => {
    const { service, prisma } = build();
    await expect(service.programar(CEO, { userId: 57, fecha: '2026-10-02' }, 7)).rejects.toThrow(
      'Las guardias son solo en sábado o domingo',
    );
    await expect(service.programar(CEO, { userId: 57, fecha: '2026-02-30' }, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.guardia.create).not.toHaveBeenCalled();
  });

  it('un fin de semana que ya pasó tampoco', async () => {
    const { service } = build();
    await expect(service.programar(CEO, { userId: 57, fecha: '2026-09-27' }, 7)).rejects.toThrow(/ya pasó/);
  });

  it('a alguien dado de baja no', async () => {
    const { service, prisma } = build();
    await expect(service.programar(CEO, { userId: 50, fecha: SABADO }, 7)).rejects.toThrow(/dada de baja/);
    expect(prisma.guardia.create).not.toHaveBeenCalled();
  });

  it('dos veces el mismo día: lo dice en vez de tronar', async () => {
    const { service, prisma } = build();
    prisma.guardia.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(service.programar(CEO, { userId: 57, fecha: SABADO }, 7)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ver y quitar guardias', () => {
  it('dirección ve todas las de su empresa y puede programar a todos menos a la cuenta de plataforma', async () => {
    const { service, prisma } = build();
    const r = await service.listar(CEO, { desde: SABADO, hasta: DOMINGO }, 7);
    const where = prisma.guardia.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: 7 });
    expect(where.userId).toBeUndefined();
    expect(r.puedeProgramar).toBe(true);
    expect(r.personas.map((p) => p.id)).toEqual([8, 57, 16, 58, 39, 15, 13, 40, 10, 3, 5, 38, 41, 7]);
  });

  it('David ve las de sus instaladores y la suya, y solo programa a esos tres', async () => {
    const { service, prisma } = build();
    const r = await service.listar(DAVID, {}, 7);
    expect(prisma.guardia.findMany.mock.calls[0][0].where.userId).toEqual({ in: [8, 57, 16, 58] });
    expect(r.personas.map((p) => p.id)).toEqual([57, 16, 58]);
    expect(r.desde).toBe('2026-10-01');
  });

  it('José ve a su equipo de soporte y no a Iván', async () => {
    const { service, prisma } = build();
    const r = await service.listar(JOSE, {}, 7);
    expect(prisma.guardia.findMany.mock.calls[0][0].where.userId).toEqual({ in: [39, 15, 13, 40] });
    expect(r.personas.map((p) => p.id)).toEqual([15, 13, 40]);
  });

  it('los demás solo ven las suyas y no programan', async () => {
    const { service, prisma } = build();
    prisma.guardia.findMany.mockResolvedValue([
      {
        id: 3,
        userId: 10,
        fecha: new Date('2026-10-03T00:00:00Z'),
        nota: null,
        createdAt: JUEVES,
        user: PADRON.find((p) => p.id === 10),
        creadoPor: null,
      },
    ]);
    const r = await service.listar(IVAN, {}, 7);
    expect(prisma.guardia.findMany.mock.calls[0][0].where.userId).toEqual({ in: [10] });
    expect(r.puedeProgramar).toBe(false);
    expect(r.items).toEqual([expect.objectContaining({ fecha: SABADO, puedeQuitar: false })]);
  });

  it('un rango al revés o de más de un trimestre se rechaza', async () => {
    const { service } = build();
    await expect(service.listar(CEO, { desde: DOMINGO, hasta: SABADO }, 7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listar(CEO, { desde: '2026-10-01', hasta: '2027-03-01' }, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('David quita la guardia de su instalador, no la de soporte', async () => {
    const { service, prisma } = build();
    prisma.guardia.findFirst.mockResolvedValue({ id: 3, userId: 57, fecha: new Date('2026-10-03T00:00:00Z') });
    await expect(service.quitar(DAVID, 3, 7)).resolves.toEqual({ removed: true, id: 3 });
    expect(prisma.guardia.deleteMany).toHaveBeenCalledWith({ where: { id: 3, companyId: 7 } });

    prisma.guardia.findFirst.mockResolvedValue({ id: 4, userId: 15, fecha: new Date('2026-10-03T00:00:00Z') });
    await expect(service.quitar(DAVID, 4, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
