import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HorarioService } from './horario.service';
import { sumaDias } from './horario-de';
import { workDateKey } from '../../common/time/workday';

/** Próximo lunes a partir de mañana: la prueba no depende del día en que corre. */
function lunesFuturo(): string {
  let f = sumaDias(workDateKey(new Date()), 1);
  while (new Date(`${f}T00:00:00Z`).getUTCDay() !== 1) f = sumaDias(f, 1);
  return f;
}

const JEFE = { id: 1, email: 'jefe@ejemplo.test', roleKey: 'coord_operaciones', nombre: 'Luis' };
const PERSONAS = [
  { id: 1, nombre: 'Luis', managerId: null, email: 'jefe@ejemplo.test', roleKey: 'coord_operaciones' },
  { id: 5, nombre: 'Rubén', managerId: 1, email: 'r@ejemplo.test', roleKey: 'tecnico' },
  { id: 6, nombre: 'Ajena', managerId: null, email: 'a@ejemplo.test', roleKey: 'tecnico' },
];

function armar(filas: any[] = []) {
  const prisma: any = {
    user: { findMany: jest.fn(async () => PERSONAS), findUnique: jest.fn(async () => ({ id: 5, horario: null })) },
    horarioDia: {
      findMany: jest.fn(async ({ where }: any) =>
        filas.filter((f) => where.userId.in.includes(f.userId) && f.fecha >= where.fecha.gte && f.fecha <= where.fecha.lte),
      ),
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async ({ create }: any) => create),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    plantillaTurno: { findFirst: jest.fn(async () => null) },
    productividadParametro: { findMany: jest.fn(async () => []) },
    workSchedule: { findMany: jest.fn(async () => []) },
    attendanceDay: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
  };
  return { service: new HorarioService(prisma), prisma };
}

const fila = (userId: number, fecha: string, e: string, s: string) => ({
  userId,
  fecha: new Date(`${fecha}T00:00:00Z`),
  horaEntrada: e,
  horaSalida: s,
  ajustes: [],
});

describe('HorarioService', () => {
  const lunes = lunesFuturo();

  it('al programar mira lo que ya estaba citado: descanso corto contra el día siguiente', async () => {
    const { service, prisma } = armar([fila(5, sumaDias(lunes, 1), '07:00', '15:00')]);
    const body = { userIds: [5], fechas: [lunes], horaEntrada: '22:00', horaSalida: '06:00' };
    const r = await service.programar(JEFE, body, 1);
    expect(r).toMatchObject({ ok: false, requiereConfirmacion: true, creados: 0 });
    expect(r.avisos.descansoCorto[0]).toMatchObject({ userId: 5, nombre: 'Rubén', horasDescanso: 1 });
    expect(prisma.horarioDia.upsert).not.toHaveBeenCalled();
    expect(await service.programar(JEFE, { ...body, forzarSolapes: true }, 1)).toMatchObject({ ok: true, creados: 1 });
  });

  it('suma la extra de la semana con lo ya programado', async () => {
    const { service } = armar([0, 1].map((i) => fila(5, sumaDias(lunes, i), '06:00', '18:00')));
    const r = await service.programar(JEFE, { userIds: [5], fechas: [sumaDias(lunes, 3)], horaEntrada: '08:00', horaSalida: '18:00', soloRevisar: true }, 1);
    expect(r.avisos.extraSobreTope[0]).toMatchObject({ userId: 5, minutosExtraEst: 600, tope: 540 });
  });

  it('sábado y domingo después de la semana: una sola racha, no un aviso por día', async () => {
    const { service } = armar();
    const r = await service.programar(JEFE, { userIds: [5], fechas: [sumaDias(lunes, 5), sumaDias(lunes, 6)], horaEntrada: '10:00', horaSalida: '14:00', soloRevisar: true }, 1);
    expect(r.avisos.masDe6Seguidos).toHaveLength(1);
  });

  it('un turno normal no avisa de problemas viejos que no toca', async () => {
    const { service, prisma } = armar([fila(5, sumaDias(lunes, -3), '22:00', '06:00'), fila(5, sumaDias(lunes, -2), '07:00', '09:00')]);
    const r = await service.programar(JEFE, { userIds: [5], fechas: [sumaDias(lunes, 2)], horaEntrada: '10:00', horaSalida: '18:00' }, 1);
    expect(r).toMatchObject({ ok: true, creados: 1 });
    expect(prisma.horarioDia.upsert).toHaveBeenCalledTimes(1);
  });

  it('nadie se programa a sí mismo ni a quien no es de su gente; el pasado no se toca', async () => {
    const { service } = armar();
    const b = { fechas: [lunes], horaEntrada: '10:00', horaSalida: '18:00' };
    await expect(service.programar(JEFE, { ...b, userIds: [1] }, 1)).rejects.toThrow('a sí mismo');
    await expect(service.programar(JEFE, { ...b, userIds: [6] }, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.programar(JEFE, { ...b, userIds: [99] }, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.programar(JEFE, { ...b, userIds: [5], fechas: ['2020-01-06'] }, 1)).rejects.toThrow('ya pasaron');
    await expect(service.quitar(JEFE, { userId: 6, fecha: lunes }, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('extender va hacia después y terminar antes va hacia antes', async () => {
    const { service } = armar();
    const b = { userId: 5, fecha: lunes };
    await expect(service.extenderORecortar(JEFE, { ...b, hasta: '17:00', tipo: 'extender' }, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.extenderORecortar(JEFE, { ...b, hasta: '19:00', tipo: 'recortar' }, 1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.extenderORecortar(JEFE, { ...b, hasta: '20:00', tipo: 'extender' }, 1)).resolves.toMatchObject({ ok: true });
  });

  it('la lista trae solo a su gente, con descanso y extra prevista', async () => {
    const { service } = armar([fila(5, lunes, '08:00', '18:00'), fila(5, sumaDias(lunes, 5), '09:00', '14:00')]);
    const r = await service.listar(JEFE, { from: lunes, to: sumaDias(lunes, 6) }, 1);
    expect(r.personas.map((p) => p.id)).toEqual([1, 5]);
    const ruben = r.personas[1];
    expect(ruben.puedeProgramar).toBe(true);
    expect(ruben.extraMin).toBe(120 + 300);
    expect(ruben.dias[6]).toMatchObject({ trabaja: false, programado: false });
    expect(r.personas[0].puedeProgramar).toBe(false);
    await expect(service.listar(JEFE, { from: lunes, to: sumaDias(lunes, 60) }, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('«Mi horario» dice quién lo puso', async () => {
    const f = { ...fila(5, lunes, '10:00', '20:00'), motivo: 'Cerrar rack', ajustes: [{ porNombre: 'Luis', tipo: 'extender' }] };
    const r = await armar([f]).service.mio({ id: 5 }, { from: lunes, to: lunes }, 1);
    expect(r.dias[0]).toMatchObject({ programado: true, extraMin: 120, loPuso: 'Luis', ajuste: 'extender' });
  });
});
