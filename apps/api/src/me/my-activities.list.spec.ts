import { ForbiddenException } from '@nestjs/common';
import { MyActivitiesService } from './my-activities.service.js';

/**
 * La cola de «Mis actividades» (web y apps, GET /me/activities) es lo asignado
 * a esa persona. No se esconde por tipo ni por el departamento de quien la dejó,
 * y no incluye el trabajo de alguien más.
 */
const LUIS = { id: 7, email: 'direccion.operaciones@nexara.com.mx' };
const TECNICO = { id: 13, email: 'soporte@nexara.com.mx' };
const DAVID = { id: 8, email: 'operaciones@nexara.com.mx' };

function actividad(over: Record<string, unknown> = {}) {
  return {
    id: 90,
    anNumber: 'AN-0090',
    titulo: 'Apoyo de otro departamento',
    descripcion: null,
    estatus: 'Pendiente',
    prioridad: 'MEDIA',
    coreKind: 'tarea',
    ticketTypeCustom: null,
    assignmentCharge: 'ejecucion',
    fechaInicio: null,
    fechaMaxima: null,
    fechaAsignacion: new Date('2026-09-28T15:00:00.000Z'),
    fechaFinalizacion: null,
    periodoInicio: null,
    periodoFin: null,
    tiempoEstimadoMin: null,
    tiempoMaximoMin: null,
    creadoPorId: 8,
    creador: { id: 8, nombre: 'David' },
    project: null,
    client: null,
    activityEvidences: [],
    scheduleChanges: [],
    assignees: [],
    ...over,
  };
}

function fila(activity: ReturnType<typeof actividad>, over: Record<string, unknown> = {}) {
  return {
    rol: 'LEAD',
    asignadoAt: activity.fechaAsignacion,
    indicaciones: null,
    ordenEjecucion: null,
    ordenJustificacion: null,
    ordenActualizadoAt: null,
    aceptadaAt: null,
    rechazadaAt: null,
    motivoRechazo: null,
    inicioRealAt: null,
    finRealAt: null,
    horasPlan: null,
    saltoPrioridad: false,
    asignadoPor: { id: 8, nombre: 'David' },
    activity,
    ...over,
  };
}

function build(assigneeRows: unknown[], huerfanas: unknown[] = []) {
  const prisma = {
    activityAssignee: { findMany: jest.fn().mockResolvedValue(assigneeRows) },
    activity: { findMany: jest.fn().mockResolvedValue(huerfanas) },
  };
  const service = new MyActivitiesService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma };
}

describe('Mis actividades: lo asignado se ve', () => {
  it('Luis ve una tarea que le dejó otro departamento, no solo servicios', async () => {
    const tarea = actividad({ id: 90, coreKind: 'tarea', titulo: 'Mantenimiento preventivo' });
    const { service, prisma } = build([fila(tarea)]);

    const res = await service.list(LUIS, 1);

    expect(res.open.map((a) => a.id)).toEqual([90]);
    expect(res.open[0]).toEqual(
      expect.objectContaining({
        titulo: 'Mantenimiento preventivo',
        coreKind: 'tarea',
        autoAsignada: false,
      }),
    );
    expect(res.open).toHaveLength(1);
    expect(res.seguimiento).toHaveLength(0);
    expect(res.doneToday).toHaveLength(0);

    const where = prisma.activityAssignee.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(LUIS.id);
    expect(where.companyId).toBe(1);
    expect(where.retiradoAt).toBeNull();
    expect(where.activity).toEqual({ deletedAt: null });
    expect(JSON.stringify(where)).not.toContain('coreKind');
  });

  it('un miembro del equipo ve la actividad aunque no sea el responsable', async () => {
    const servicio = actividad({
      id: 44,
      coreKind: 'servicio',
      titulo: 'Visita en sitio',
      assignmentCharge: 'ejecucion',
      creadoPorId: 39,
      creador: { id: 39, nombre: 'Antonio' },
    });
    const { service, prisma } = build([
      fila(servicio, { rol: 'TECNICO', asignadoPor: { id: 39, nombre: 'Antonio' } }),
    ]);

    const res = await service.list(TECNICO, 1);

    expect(res.open.map((a) => a.id)).toEqual([44]);
    expect(res.open[0].rol).toBe('TECNICO');
    expect(prisma.activityAssignee.findMany.mock.calls[0][0].where.userId).toBe(TECNICO.id);
    expect(prisma.activity.findMany.mock.calls[0][0].where.responsableId).toBe(TECNICO.id);
  });

  it('el responsable sin fila de equipo igual la ve, y no revive una de la que lo sacaron', async () => {
    const suelta = actividad({
      id: 12,
      coreKind: null,
      titulo: 'Preventivo de contrato',
      assignmentCharge: null,
      creadoPorId: 1,
      creador: { id: 1, nombre: 'Christian' },
    });
    const { service, prisma } = build([], [suelta]);

    const res = await service.list(LUIS, 1);

    expect(res.open.map((a) => ({ id: a.id, titulo: a.titulo }))).toEqual([
      { id: 12, titulo: 'Preventivo de contrato' },
    ]);
    const where = prisma.activity.findMany.mock.calls[0][0].where;
    expect(where.responsableId).toBe(LUIS.id);
    expect(where.companyId).toBe(1);
    expect(where.deletedAt).toBeNull();
    expect(where.assignees).toEqual({ none: { userId: LUIS.id } });
  });

  it('no consulta ni devuelve actividades de otra persona ni de otra empresa', async () => {
    const { service, prisma } = build([]);

    const res = await service.list(LUIS, 4);

    expect(res.open).toEqual([]);
    const equipo = prisma.activityAssignee.findMany.mock.calls[0][0].where;
    const propias = prisma.activity.findMany.mock.calls[0][0].where;
    expect(equipo.userId).toBe(LUIS.id);
    expect(equipo.companyId).toBe(4);
    expect(propias.responsableId).toBe(LUIS.id);
    expect(propias.companyId).toBe(4);
    expect(propias.assignees).toEqual({ none: { userId: LUIS.id } });
  });

  it('la autoasignación de Luis entra en Por hacer, aunque no sea un servicio', async () => {
    const mia = actividad({
      id: 3,
      coreKind: 'tarea',
      titulo: 'La dejé para mí',
      creadoPorId: LUIS.id,
      creador: { id: LUIS.id, nombre: 'Luis' },
      assignmentCharge: 'ejecucion',
    });
    const { service } = build([fila(mia, { asignadoPor: { id: LUIS.id, nombre: 'Luis' } })]);

    const res = await service.list(LUIS, 1);

    expect(res.open).toEqual([
      expect.objectContaining({ id: 3, titulo: 'La dejé para mí', autoAsignada: true, rol: 'LEAD' }),
    ]);
    expect(res.seguimiento).toHaveLength(0);
  });

  it('un ingeniero que se asigna el trabajo también lo ve, y no el de los demás', async () => {
    const mia = actividad({
      id: 4,
      coreKind: 'servicio',
      titulo: 'Mi visita',
      creadoPorId: TECNICO.id,
      creador: { id: TECNICO.id, nombre: 'Carolina' },
      assignmentCharge: 'ejecucion',
    });
    const { service, prisma } = build([
      fila(mia, { rol: 'LEAD', asignadoPor: { id: TECNICO.id, nombre: 'Carolina' } }),
    ]);

    const res = await service.list(TECNICO, 1);

    expect(res.open).toEqual([
      expect.objectContaining({ id: 4, autoAsignada: true, rol: 'LEAD', coreKind: 'servicio' }),
    ]);
    expect(prisma.activityAssignee.findMany.mock.calls[0][0].where.userId).toBe(TECNICO.id);
    expect(prisma.activity.findMany.mock.calls[0][0].where.responsableId).toBe(TECNICO.id);
  });

  it('David autoasignado como responsable, sin fila de equipo, entra en Por hacer', async () => {
    const mia = actividad({
      id: 5,
      coreKind: 'proyecto',
      titulo: 'Mi proyecto',
      creadoPorId: DAVID.id,
      creador: { id: DAVID.id, nombre: 'David' },
      assignmentCharge: 'ejecucion',
    });
    const { service } = build([], [mia]);

    const res = await service.list(DAVID, 1);

    expect(res.open).toEqual([
      expect.objectContaining({ id: 5, autoAsignada: true, rol: 'LEAD', coreKind: 'proyecto' }),
    ]);
  });
});

describe('autoasignar', () => {
  it('deja la actividad en ejecución a nombre de quien la crea', async () => {
    const activities = { create: jest.fn().mockResolvedValue({ id: 3 }) };
    const service = new MyActivitiesService(
      {} as any,
      activities as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.selfCreate(LUIS, 1, { titulo: 'La dejé para mí', coreKind: 'tarea' } as any);

    expect(activities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'La dejé para mí',
        coreKind: 'tarea',
        responsableId: LUIS.id,
        creadoPorId: LUIS.id,
        assignmentCharge: 'ejecucion',
      }),
      1,
    );
  });

  it('un empleado sin encargo de área no se autoasigna por esta vía', async () => {
    const activities = { create: jest.fn() };
    const service = new MyActivitiesService(
      {} as any,
      activities as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.selfCreate(TECNICO, 1, { titulo: 'No' } as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(activities.create).not.toHaveBeenCalled();
  });
});
