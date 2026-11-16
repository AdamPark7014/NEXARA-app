import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BajasService } from './bajas.service.js';

function crear(overrides: Record<string, any> = {}) {
  const prisma: any = {
    user: {
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      findFirst: jest.fn().mockImplementation(async () => dest),
      findMany: jest.fn().mockResolvedValue([{ id: 1, email: 'gerencia@nexara.com.mx', puesto: 'CEO' }]),
    },
    userDeactivationRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 9, userId: 50 }),
    },
    auditLog: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  const users = { updateHrFields: jest.fn().mockResolvedValue({}) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 1 }) };
  Object.assign(prisma, overrides.prisma || {});
  const servicio = new BajasService(prisma, users as any, audit as any, notifications as any);
  return { servicio, prisma, users, audit, notifications };
}

const rh = { id: 10, email: 'tere@nexara.com.mx', roleKey: 'rh', isActive: true, nombre: 'Tere' };
const ceo = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo', isActive: true, nombre: 'Christian' };
const dest = { id: 50, nombre: 'Ana', email: 'ana@nexara.com.mx', roleKey: 'ing_campo', isActive: true };

describe('BajasService', () => {
  it('rh solicita → pendiente y aviso a dirección', async () => {
    const { servicio, prisma, users, notifications } = crear();
    prisma.user.findUnique.mockResolvedValue(rh);
    prisma.user.findFirst.mockResolvedValue(dest);
    prisma.userDeactivationRequest.create.mockResolvedValue({
      id: 9, estado: 'PENDIENTE', modo: 'SOLICITUD', user: dest, solicitadoPor: rh,
    });
    const out = await servicio.solicitar({ id: 10 }, {
      userId: 50, motivo: 'RENUNCIA', fechaBaja: '2026-11-20',
    }, 7);
    expect(out.estado).toBe('PENDIENTE');
    expect(users.updateHrFields).not.toHaveBeenCalled();
    expect(notifications.createNotification).toHaveBeenCalled();
    expect(prisma.userDeactivationRequest.create.mock.calls[0][0].data.estado).toBe('PENDIENTE');
  });

  it('rh con visto bueno sin justificación → 400', async () => {
    const { servicio, prisma } = crear();
    prisma.user.findUnique.mockResolvedValue(rh);
    prisma.user.findFirst.mockResolvedValue(dest);
    await expect(
      servicio.solicitar({ id: 10 }, {
        userId: 50, motivo: 'RENUNCIA', fechaBaja: '2026-11-20',
        yaAutorizadoPorDireccion: true, justificacion: 'corto',
      }, 7),
    ).rejects.toThrow(/justific/i);
  });

  it('aprobar desactiva y pone Baja', async () => {
    const { servicio, prisma, users } = crear();
    prisma.user.findUnique.mockResolvedValue(ceo);
    prisma.userDeactivationRequest.findFirst.mockResolvedValue({
      id: 9, companyId: 7, userId: 50, estado: 'PENDIENTE', solicitadoPorId: 10,
      user: { id: 50, nombre: 'Ana', isActive: true },
    });
    prisma.userDeactivationRequest.update.mockResolvedValue({ id: 9, estado: 'APROBADA' });
    await servicio.aprobar({ id: 1 }, 9, 7);
    expect(users.updateHrFields).toHaveBeenCalledWith(50, { isActive: false, estadoRRHH: 'Baja' }, 7);
  });

  it('revertir reactiva y estadoRRHH Activo', async () => {
    const { servicio, prisma, users } = crear();
    prisma.user.findUnique.mockResolvedValue(ceo);
    prisma.userDeactivationRequest.findFirst.mockResolvedValue({
      id: 9, companyId: 7, userId: 50, estado: 'APROBADA', solicitadoPorId: 10,
      user: { id: 50, nombre: 'Ana' },
    });
    prisma.userDeactivationRequest.update.mockResolvedValue({ id: 9, estado: 'REVERTIDA' });
    await servicio.revertir({ id: 1 }, 9, 7);
    expect(users.updateHrFields).toHaveBeenCalledWith(50, { isActive: true, estadoRRHH: 'Activo' }, 7);
  });

  it('no se puede dar de baja a dirección ni a uno mismo', async () => {
    const { servicio, prisma } = crear();
    prisma.user.findUnique.mockResolvedValue(rh);
    await expect(
      servicio.solicitar({ id: 10 }, { userId: 10, motivo: 'RENUNCIA', fechaBaja: '2026-11-20' }, 7),
    ).rejects.toThrow(/ti mismo/i);
    prisma.user.findFirst.mockResolvedValue({
      id: 1, nombre: 'Christian', email: 'gerencia@nexara.com.mx', roleKey: 'ceo', isActive: true,
    });
    await expect(
      servicio.solicitar({ id: 10 }, { userId: 1, motivo: 'RENUNCIA', fechaBaja: '2026-11-20' }, 7),
    ).rejects.toThrow(/baja|direcci/i);
  });
});


describe('BajasService: aislamiento y decisiones repetidas', () => {
  it('rechaza una empresa ausente antes de consultar usuarios', async () => {
    const { servicio, prisma } = crear();
    await expect(servicio.listar({ id: 10 }, 0)).rejects.toThrow(/empresa/);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it('un rol operativo no puede listar bajas', async () => {
    const { servicio, prisma } = crear();
    prisma.user.findUnique.mockResolvedValue({ ...rh, roleKey: 'ing_campo' });
    await expect(servicio.listar({ id: 10 }, 7)).rejects.toThrow(/Solo RH/);
    expect(prisma.user.findUnique.mock.calls[0][0].where.companyMemberships).toEqual({ some: { companyId: 7 } });
  });
  it('no aplica la cuenta cuando otra petición ya decidió la solicitud', async () => {
    const { servicio, prisma, users } = crear();
    prisma.user.findUnique.mockResolvedValue(ceo);
    prisma.userDeactivationRequest.findFirst.mockResolvedValue({ id: 9, estado: 'PENDIENTE', userId: 50, user: dest });
    prisma.userDeactivationRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(servicio.aprobar({ id: 1 }, 9, 7)).rejects.toThrow(/cambió de estado/);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(users.updateHrFields).not.toHaveBeenCalled();
  });
});

it('registra users/bajas antes de users/:id para que Express no trate bajas como un id', () => {
  const modulo = readFileSync(join(__dirname, '../users.module.ts'), 'utf8');
  const controladores = modulo.match(/controllers:\s*\[([^\]]+)\]/)?.[1] || '';
  expect(controladores.indexOf('BajasController')).toBeGreaterThanOrEqual(0);
  expect(controladores.indexOf('BajasController')).toBeLessThan(controladores.indexOf('UsersController'));
});
