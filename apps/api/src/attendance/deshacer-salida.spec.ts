import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { dentroDeVentanaPropia, mensajeSalidaDeshecha, VENTANA_DESHACER_MS } from './deshacer-salida.js';
import { ROLES, type RoleKey } from '../common/rbac/roles.v2.js';
import { checkUrlAccess } from '../common/rbac/url-matrix.js';

const AHORA = new Date();
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000);
const ANA = 3;
const EMPRESA = 7;

function build(o: { salidaAt?: Date; cierres?: any[]; sesiones?: any[]; movida?: boolean; corriendo?: number; jefeDe?: number[] } = {}) {
  const salidaAt = o.salidaAt ?? hace(4);
  const checada = {
    id: 44,
    userId: ANA,
    type: 'salida',
    timestamp: salidaAt,
    photoUrl: '/fotos/a.jpg',
    correcciones: [],
  };
  const tx: any = {
    activity: { updateMany: jest.fn().mockResolvedValue({ count: o.movida ? 0 : 1 }) },
    activityNonCompliance: { delete: jest.fn().mockResolvedValue({}) },
    activityWorkSession: {
      findMany: jest.fn().mockResolvedValue(o.sesiones ?? []),
      count: jest.fn().mockResolvedValue(o.corriendo ?? 0),
      update: jest.fn().mockResolvedValue({}),
    },
    salidaDeshecha: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    attendance: { delete: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    attendance: {
      findFirst: jest.fn().mockResolvedValue(checada),
      findMany: jest.fn().mockResolvedValue([{ type: 'entrada', timestamp: hace(300) }]),
    },
    attendanceDay: { upsert: jest.fn().mockResolvedValue({}) },
    activityNonCompliance: { findMany: jest.fn().mockResolvedValue(o.cierres ?? []) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: ANA, nombre: 'Ana' }),
      findMany: jest.fn().mockResolvedValue([
        { id: ANA, email: 'ana@x', managerId: 8 },
        { id: 8, email: 'jefe@x', managerId: null },
        { id: 9, email: 'otro@x', managerId: null },
      ]),
    },
    salidaDeshecha: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const notifyAttendanceFlagged = jest.fn().mockResolvedValue(undefined);
  const service = new AttendanceService(
    prisma,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    { notifyAttendanceChange: jest.fn(), notifyAttendanceFlagged } as any,
  );
  return { service, prisma, tx, notifyAttendanceFlagged, checada };
}

const CIERRE = {
  id: 70,
  activityId: 500,
  estatusPrevio: 'En Proceso',
  causa: 'CIERRE_JORNADA',
  limite: hace(60),
  registradoAt: hace(4),
  activity: { id: 500, anNumber: 'AN-0500', estatus: 'No cumplida' },
};

describe('las rutas', () => {
  const PERSONAL = (Object.values(ROLES) as RoleKey[]).filter((r) => r !== ROLES.CLIENTE);
  // Dirección no checa asistencia: solo deshace la de los demás.
  const CHECAN = PERSONAL.filter((r) => r !== ROLES.CEO && r !== ROLES.DIR_ADMIN);

  it.each(PERSONAL)('%s llega a la de otra persona; quién puede lo decide el servicio', (rol) => {
    expect(checkUrlAccess(rol, '/api/attendance/44/deshacer-salida', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/attendance/salidas-deshechas', 'GET').allowed).toBe(true);
  });

  it.each(CHECAN)('%s llega a la suya', (rol) => {
    expect(checkUrlAccess(rol, '/api/attendance/salida/riesgo', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/attendance/salida/deshacer', 'POST').allowed).toBe(true);
  });

  it('un cliente no llega', () => {
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/attendance/44/deshacer-salida', 'POST').allowed).toBe(false);
  });
});

describe('reglas', () => {
  it('10 minutos, ni uno más', () => {
    expect(dentroDeVentanaPropia(hace(10), AHORA)).toBe(true);
    expect(dentroDeVentanaPropia(new Date(AHORA.getTime() - VENTANA_DESHACER_MS - 1), AHORA)).toBe(false);
    expect(dentroDeVentanaPropia(new Date(AHORA.getTime() + 1000), AHORA)).toBe(false);
  });

  it('el aviso a sus jefes dice qué regresó', () => {
    expect(mensajeSalidaDeshecha({ hora: '16:14', folios: ['AN-1'] })).toBe('Salida de las 16:14 · AN-1 ya no queda «No cumplida»');
    expect(mensajeSalidaDeshecha({ hora: '16:14', folios: ['AN-1', 'AN-2'], motivo: 'Se equivocó' })).toBe(
      'Salida de las 16:14 · AN-1, AN-2 ya no quedan «No cumplida» · Se equivocó',
    );
    expect(mensajeSalidaDeshecha({ hora: '16:14', folios: [] })).toBe('Salida de las 16:14');
  });
});

describe('la propia persona', () => {
  it('borra la checada, guarda la copia y deja la jornada abierta', async () => {
    const { service, prisma, tx } = build();
    const r = await service.deshacerMiSalida(ANA, EMPRESA);
    expect(tx.attendance.delete).toHaveBeenCalledWith({ where: { id: 44 } });
    const copia = tx.salidaDeshecha.create.mock.calls[0][0].data;
    expect(copia).toMatchObject({ userId: ANA, attendanceId: 44, porId: ANA, motivo: null, companyId: EMPRESA });
    expect(copia.datos.photoUrl).toBe('/fotos/a.jpg');
    expect(prisma.attendanceDay.upsert.mock.calls[0][0].update).toMatchObject({ isOpen: true, totalMinutes: 0 });
    expect(r.message).toBe('Tu jornada sigue abierta');
  });

  it('regresa lo que quedó «No cumplida» y dice cuál', async () => {
    const { service, tx, notifyAttendanceFlagged } = build({ cierres: [CIERRE] });
    const r = await service.deshacerMiSalida(ANA, EMPRESA);
    expect(tx.activity.updateMany.mock.calls[0][0].data).toEqual({ estatus: 'En Proceso' });
    expect(tx.activityNonCompliance.delete).toHaveBeenCalledWith({ where: { id: 70 } });
    expect(r.noCumplidasRegresadas).toEqual(['AN-0500']);
    expect(tx.salidaDeshecha.create.mock.calls[0][0].data.noCumplidas[0]).toMatchObject({
      actividadId: 500,
      estatusPrevio: 'En Proceso',
    });
    expect(notifyAttendanceFlagged.mock.calls[0][0].mensaje).toContain('AN-0500 ya no queda');
    expect(notifyAttendanceFlagged.mock.calls[0][0].avisarPersona).toBe(false);
  });

  it('si alguien ya la movió de «No cumplida», se queda donde la dejó', async () => {
    const { service, tx } = build({ cierres: [CIERRE], movida: true });
    const r = await service.deshacerMiSalida(ANA, EMPRESA);
    expect(tx.activityNonCompliance.delete).not.toHaveBeenCalled();
    expect(r.noCumplidasRegresadas).toEqual([]);
  });

  it('sus relojes vuelven a correr, salvo si ya hay uno corriendo', async () => {
    const a = build({ sesiones: [{ id: 5, activityId: 500 }] });
    expect((await a.service.deshacerMiSalida(ANA, EMPRESA)).relojesReabiertos).toBe(1);
    expect(a.tx.activityWorkSession.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { endedAt: null, endReason: null } });
    const b = build({ sesiones: [{ id: 5, activityId: 500 }], corriendo: 1 });
    expect((await b.service.deshacerMiSalida(ANA, EMPRESA)).relojesReabiertos).toBe(0);
  });

  it('pasados los 10 minutos ya no puede', async () => {
    const { service, tx } = build({ salidaAt: hace(11) });
    await expect(service.deshacerMiSalida(ANA, EMPRESA)).rejects.toThrow('pídele a tu jefe');
    expect(tx.attendance.delete).not.toHaveBeenCalled();
  });

  it('sin salida de hoy lo dice', async () => {
    const { service, prisma } = build();
    prisma.attendance.findFirst.mockResolvedValue(null);
    await expect(service.deshacerMiSalida(ANA, EMPRESA)).rejects.toThrow(BadRequestException);
  });

  it('sin empresa no entra', async () => {
    const { service } = build();
    await expect(service.deshacerMiSalida(ANA, null)).rejects.toThrow(ForbiddenException);
  });
});

describe('su jefe', () => {
  const JEFE = { id: 8, email: 'jefe@x', roleKey: 'coord_operaciones', permissions: [] };

  it('con motivo la deshace y le avisa a la persona; los relojes no se reabren', async () => {
    const { service, tx, notifyAttendanceFlagged } = build({ salidaAt: hace(120), sesiones: [{ id: 5, activityId: 500 }] });
    await service.deshacerSalidaDe(JEFE, 44, { motivo: 'Marcó por error y siguió trabajando' }, EMPRESA);
    expect(tx.activityWorkSession.update).not.toHaveBeenCalled();
    expect(tx.salidaDeshecha.create.mock.calls[0][0].data).toMatchObject({ porId: 8, motivo: 'Marcó por error y siguió trabajando' });
    expect(notifyAttendanceFlagged.mock.calls[0][0]).toMatchObject({ titulo: 'Deshicieron tu salida', avisarPersona: true });
  });

  it('sin motivo no', async () => {
    const { service } = build();
    await expect(service.deshacerSalidaDe(JEFE, 44, { motivo: 'corto' }, EMPRESA)).rejects.toThrow('El motivo es obligatorio');
  });

  it('quien no es su jefe no', async () => {
    const { service, tx } = build();
    await expect(
      service.deshacerSalidaDe({ id: 9, email: 'otro@x', roleKey: 'ing_campo', permissions: [] }, 44, { motivo: 'Marcó por error y siguió' }, EMPRESA),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.attendance.delete).not.toHaveBeenCalled();
  });

  it('otro día queda la corrección de hora', async () => {
    const { service } = build({ salidaAt: new Date(AHORA.getTime() - 30 * 3_600_000) });
    await expect(service.deshacerSalidaDe(JEFE, 44, { motivo: 'Marcó por error y siguió' }, EMPRESA)).rejects.toThrow('mismo día');
  });

  it('una entrada no se deshace por aquí', async () => {
    const { service, prisma } = build();
    prisma.attendance.findFirst.mockResolvedValue({ id: 44, userId: ANA, type: 'entrada', timestamp: hace(1) });
    await expect(service.deshacerSalidaDe(JEFE, 44, { motivo: 'Marcó por error y siguió' }, EMPRESA)).rejects.toThrow('Salida no encontrada');
  });
});

describe('la bitácora', () => {
  it('solo quien alcanza a la persona', async () => {
    const { service, prisma } = build();
    await expect(
      service.salidasDeshechas({ id: 9, email: 'otro@x', roleKey: 'ing_campo', permissions: [] }, { userId: ANA, fecha: '2026-11-10' }, EMPRESA),
    ).rejects.toThrow(ForbiddenException);
    await service.salidasDeshechas({ id: ANA, email: 'ana@x', permissions: [] }, { userId: ANA, fecha: '2026-11-10' }, EMPRESA);
    expect(prisma.salidaDeshecha.findMany).toHaveBeenCalled();
  });

  it('valida la fecha', async () => {
    const { service } = build();
    await expect(service.salidasDeshechas({ id: ANA, permissions: [] }, { userId: ANA, fecha: 'ayer' }, EMPRESA)).rejects.toThrow('fecha');
  });
});
