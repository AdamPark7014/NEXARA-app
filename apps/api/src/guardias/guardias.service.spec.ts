import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GuardiasService } from './guardias.service.js';
import { esSabadoODomingo } from './guardias-reglas.js';

/**
 * Quién calendariza guardias: dirección a cualquiera; un encargado, solo a la gente que puede
 * asignarle actividades (la misma regla de alcance). Solo sábado o domingo, de hoy en
 * adelante y nunca a alguien dado de baja.
 */

/** Jueves 1 de octubre de 2026, 12:00 en México. */
const JUEVES = new Date('2026-10-01T18:00:00Z');
const SABADO = '2026-10-03';
const DOMINGO = '2026-10-04';

const CEO = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo' };
const DAVID = { id: 20, email: 'operaciones@nexara.com.mx', roleKey: 'ingeniero' };
const JOAN = { id: 30, email: 'joan.sanchez@nexara.com.mx', roleKey: 'tecnico' };

const PADRON = [
  { id: 1, email: 'gerencia@nexara.com.mx', managerId: null, nombre: 'Christian', puesto: 'CEO', avatarUrl: null },
  { id: 20, email: 'operaciones@nexara.com.mx', managerId: 1, nombre: 'David', puesto: 'Encargado', avatarUrl: null },
  { id: 30, email: 'joan.sanchez@nexara.com.mx', managerId: 20, nombre: 'Joan', puesto: 'Instalador', avatarUrl: null },
  { id: 40, email: 'soporte@nexara.com.mx', managerId: 1, nombre: 'Carolina', puesto: 'Soporte', avatarUrl: null },
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
  it('dirección programa a cualquiera, de su empresa, y la persona se entera', async () => {
    const { service, prisma, notifications } = build();
    const g = await service.programar(CEO, { userId: 40, fecha: SABADO, nota: '  Guardia de  soporte ' }, 7);

    expect(prisma.guardia.create.mock.calls[0][0].data).toEqual({
      companyId: 7,
      userId: 40,
      fecha: new Date('2026-10-03T00:00:00.000Z'),
      nota: 'Guardia de soporte',
      creadoPorId: 1,
    });
    expect(g).toMatchObject({ userId: 40, fecha: SABADO, puedeQuitar: true });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 40, companyId: 7, title: expect.stringMatching(/guardia/) }),
    );
  });

  it('un encargado programa a su gente', async () => {
    const { service, prisma } = build();
    await service.programar(DAVID, { userId: 30, fecha: DOMINGO }, 7);
    expect(prisma.guardia.create).toHaveBeenCalled();
  });

  it('pero no a gente fuera de su alcance ni a sí mismo', async () => {
    const { service, prisma } = build();
    await expect(service.programar(DAVID, { userId: 40, fecha: SABADO }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.programar(DAVID, { userId: 20, fecha: SABADO }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.guardia.create).not.toHaveBeenCalled();
  });

  it('quien no tiene gente a su cargo no programa a nadie', async () => {
    const { service } = build();
    await expect(service.programar(JOAN, { userId: 40, fecha: SABADO }, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('entre semana no: las guardias son solo sábado o domingo', async () => {
    const { service, prisma } = build();
    await expect(service.programar(CEO, { userId: 30, fecha: '2026-10-02' }, 7)).rejects.toThrow(
      'Las guardias son solo en sábado o domingo',
    );
    await expect(service.programar(CEO, { userId: 30, fecha: '2026-02-30' }, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.guardia.create).not.toHaveBeenCalled();
  });

  it('un fin de semana que ya pasó tampoco', async () => {
    const { service } = build();
    await expect(service.programar(CEO, { userId: 30, fecha: '2026-09-27' }, 7)).rejects.toThrow(/ya pasó/);
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
    await expect(service.programar(CEO, { userId: 30, fecha: SABADO }, 7)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ver y quitar guardias', () => {
  it('dirección ve todas las de su empresa y puede programar a todos', async () => {
    const { service, prisma } = build();
    const r = await service.listar(CEO, { desde: SABADO, hasta: DOMINGO }, 7);
    const where = prisma.guardia.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: 7 });
    expect(where.userId).toBeUndefined();
    expect(r.puedeProgramar).toBe(true);
    // Las cuentas de dirección/plataforma no checan: no salen para programar.
    expect(r.personas.map((p) => p.id)).toEqual([20, 30, 40]);
  });

  it('un encargado ve las de su gente y las suyas', async () => {
    const { service, prisma } = build();
    const r = await service.listar(DAVID, {}, 7);
    expect(prisma.guardia.findMany.mock.calls[0][0].where.userId).toEqual({ in: [20, 30] });
    expect(r.personas.map((p) => p.id)).toEqual([30]);
    expect(r.desde).toBe('2026-10-01');
  });

  it('los demás solo ven las suyas y no programan', async () => {
    const { service, prisma } = build();
    prisma.guardia.findMany.mockResolvedValue([
      { id: 3, userId: 30, fecha: new Date('2026-10-03T00:00:00Z'), nota: null, createdAt: JUEVES, user: PADRON[2], creadoPor: null },
    ]);
    const r = await service.listar(JOAN, {}, 7);
    expect(prisma.guardia.findMany.mock.calls[0][0].where.userId).toEqual({ in: [30] });
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

  it('un encargado quita la guardia de su gente (acotado a su empresa), no la de otros', async () => {
    const { service, prisma } = build();
    prisma.guardia.findFirst.mockResolvedValue({ id: 3, userId: 30, fecha: new Date('2026-10-03T00:00:00Z') });
    await expect(service.quitar(DAVID, 3, 7)).resolves.toEqual({ removed: true, id: 3 });
    expect(prisma.guardia.deleteMany).toHaveBeenCalledWith({ where: { id: 3, companyId: 7 } });

    prisma.guardia.findFirst.mockResolvedValue({ id: 4, userId: 40, fecha: new Date('2026-10-03T00:00:00Z') });
    await expect(service.quitar(DAVID, 4, 7)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
