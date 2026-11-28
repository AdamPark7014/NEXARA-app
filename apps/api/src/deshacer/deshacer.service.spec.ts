import { ConflictException, ForbiddenException, GoneException } from '@nestjs/common';
import { DeshacerService } from './deshacer.service';
import { avisarSiNoSeDeshizo } from './aviso-diferido';

// Datos ficticios. Base en memoria con solo lo que usa el servicio.
const T0 = new Date('2026-11-27T18:00:00.000Z');
const en = (ms: number) => new Date(T0.getTime() + ms);

function base() {
  const db = {
    users: [
      { id: 1, managerId: null },
      { id: 2, managerId: 1 },
      { id: 3, managerId: 2 },
      { id: 4, managerId: 1 },
    ],
    activities: [
      {
        id: 10, companyId: 7, anNumber: 'AN-0010', estatus: 'Pendiente', cancelledAt: null, deletedAt: null as Date | null,
        deletedById: null as number | null, creadoPorId: 3, fechaAsignacion: new Date('2020-01-01'),
        assignees: [{ asignadoAt: T0 }], _count: { workSessions: 0, activityEvidences: 0 },
      },
      {
        id: 11, companyId: 7, anNumber: 'AN-0011', estatus: 'En Proceso', cancelledAt: null, deletedAt: null as Date | null,
        deletedById: null as number | null, creadoPorId: 3, fechaAsignacion: T0,
        assignees: [{ asignadoAt: T0 }], _count: { workSessions: 1, activityEvidences: 1 },
      },
    ],
    viaticos: [
      { id: 20, usuarioId: 3, asignadoPorId: null, origen: 'SOLICITUD', estatus: 'Pendiente', approvalStep: 0, journalEntryId: null, fechaSolicitud: T0, deletedAt: null as Date | null, actividadId: null as number | null },
      { id: 21, usuarioId: 4, asignadoPorId: 2, origen: 'ASIGNACION', estatus: 'Pendiente', approvalStep: 0, journalEntryId: null, fechaSolicitud: T0, deletedAt: null as Date | null, actividadId: null as number | null },
      { id: 22, usuarioId: 3, asignadoPorId: null, origen: 'SOLICITUD', estatus: 'Aprobado', approvalStep: 2, journalEntryId: null, fechaSolicitud: T0, deletedAt: null as Date | null, actividadId: null as number | null },
    ],
    repartosBorrados: [] as number[],
  };
  const enIds = (where: any) => (x: any) => where.id.in.includes(x.id);
  const prisma: any = {
    user: { findMany: async () => db.users },
    activity: {
      findMany: async ({ where }: any) => db.activities.filter(enIds(where)),
      updateMany: async ({ where, data }: any) => {
        const filas = db.activities.filter((a) => where.id.in.includes(a.id) && a.deletedAt === null);
        filas.forEach((a) => Object.assign(a, data));
        return { count: filas.length };
      },
    },
    viatico: {
      findMany: async ({ where }: any) => db.viaticos.filter(enIds(where)),
      updateMany: async ({ where, data }: any) => {
        const filas = db.viaticos.filter(
          (v) =>
            (where.id ? where.id.in.includes(v.id) : where.actividadId.in.includes(v.actividadId)) &&
            v.deletedAt === null &&
            v.estatus === where.estatus &&
            v.approvalStep === where.approvalStep,
        );
        filas.forEach((v) => Object.assign(v, data));
        return { count: filas.length };
      },
    },
    viaticoReparto: {
      deleteMany: async ({ where }: any) => {
        db.repartosBorrados.push(...where.viaticoId.in);
        return { count: 0 };
      },
    },
  };
  prisma.$transaction = async (fn: any) => fn(prisma);
  const avisos = { notifyActivityCancelled: jest.fn() };
  const realtime = { emitToCompany: jest.fn() };
  const service = new DeshacerService(prisma, realtime as any, avisos as any);
  return { db, service, avisos, realtime };
}

describe('DeshacerService', () => {
  it('quien la asignó la deshace en los primeros segundos, sin avisar a nadie', async () => {
    const { db, service, avisos, realtime } = base();
    const r = await service.deshacer('actividad', [10], { id: 3 }, 7, en(4_000));
    expect(r).toEqual({ ok: true, tipo: 'actividad', ids: [10], como: 'a_tiempo' });
    expect(db.activities[0].deletedAt).toEqual(en(4_000));
    expect(db.activities[0].deletedById).toBe(3);
    expect(avisos.notifyActivityCancelled).not.toHaveBeenCalled();
    expect(realtime.emitToCompany).toHaveBeenCalledWith(7, 'activity:updated', expect.objectContaining({ id: 10, deleted: true }));
  });

  it('usa la hora del equipo, no la fechaAsignacion que manda el cliente', async () => {
    const { service } = base();
    // fechaAsignacion de 2020: si se usara, ya habría pasado el plazo.
    await expect(service.deshacer('actividad', 10, { id: 3 }, 7, en(2_000))).resolves.toMatchObject({ ok: true });
  });

  it('pasado el plazo, quien la asignó ya no puede (410)', async () => {
    const { service } = base();
    await expect(service.deshacer('actividad', [10], { id: 3 }, 7, en(60_000))).rejects.toBeInstanceOf(GoneException);
  });

  it('su jefe sí, y se avisa a quien la tenía', async () => {
    const { db, service, avisos } = base();
    const r = await service.deshacer('actividad', [10], { id: 1 }, 7, en(3_600_000));
    expect(r.como).toBe('superior');
    expect(db.activities[0].deletedById).toBe(1);
    expect(avisos.notifyActivityCancelled).toHaveBeenCalledWith(expect.objectContaining({ activityId: 10, actorId: 1 }));
  });

  it('un compañero de otra rama no (403)', async () => {
    const { service } = base();
    await expect(service.deshacer('actividad', [10], { id: 4 }, 7, en(1_000))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('una empezada no se retira (409) y no se toca nada de la serie', async () => {
    const { db, service } = base();
    await expect(service.deshacer('actividad', [10, 11], { id: 3 }, 7, en(1_000))).rejects.toBeInstanceOf(ConflictException);
    expect(db.activities[0].deletedAt).toBeNull();
  });

  it('doble toque: la segunda vez también responde bien', async () => {
    const { service } = base();
    await service.deshacer('actividad', [10], { id: 3 }, 7, en(1_000));
    await expect(service.deshacer('actividad', [10], { id: 3 }, 7, en(1_500))).resolves.toMatchObject({ ok: true });
  });

  it('viático pedido: quien lo pidió lo deshace a tiempo y se borra su reparto', async () => {
    const { db, service } = base();
    await service.deshacer('viatico', [20], { id: 3 }, 7, en(3_000));
    expect(db.viaticos[0].deletedAt).toEqual(en(3_000));
    expect(db.repartosBorrados).toEqual([20]);
  });

  it('viático asignado: lo deshace quien lo asignó, no el beneficiario', async () => {
    const { service } = base();
    await expect(service.deshacer('viatico', [21], { id: 4 }, 7, en(1_000))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deshacer('viatico', [21], { id: 2 }, 7, en(1_000))).resolves.toMatchObject({ como: 'a_tiempo' });
  });

  it('viático ya aprobado no se deshace (409), ni por un superior', async () => {
    const { service } = base();
    await expect(service.deshacer('viatico', [22], { id: 1 }, 7, en(1_000))).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('avisarSiNoSeDeshizo', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('con espera 0 avisa enseguida', async () => {
    const avisar = jest.fn();
    await avisarSiNoSeDeshizo('x', async () => false, avisar, 0);
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it('pasado el plazo avisa solo si no se deshizo', async () => {
    const avisar = jest.fn();
    let vigente = true;
    await avisarSiNoSeDeshizo('x', async () => vigente, avisar, 7_000);
    expect(avisar).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(7_000);
    expect(avisar).toHaveBeenCalledTimes(1);

    const otro = jest.fn();
    vigente = false;
    await avisarSiNoSeDeshizo('x', async () => vigente, otro, 7_000);
    await jest.advanceTimersByTimeAsync(7_000);
    expect(otro).not.toHaveBeenCalled();
  });
});
