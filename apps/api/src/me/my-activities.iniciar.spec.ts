import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MyActivitiesService } from './my-activities.service.js';
import { MENSAJE_SIN_RECHAZO } from '../activities/actividad-tiempos.js';

/**
 * Regla del dueño (18-09): «El asignado de realizar una tarea/actividad no tiene opción
 * de aceptar o rechazar las actividades asignadas, únicamente iniciarlas».
 */
const VIEWER = { id: 3, email: 'tecnico@nexara.com.mx' };

function fila(over: Record<string, unknown> = {}) {
  return {
    id: 50,
    rol: 'TECNICO',
    aceptadaAt: null,
    rechazadaAt: null,
    inicioRealAt: null,
    asignadoPorId: 4,
    activity: { estatus: 'Pendiente', assignmentCharge: 'ejecucion', fechaInicio: null },
    ...over,
  };
}

function build(row: unknown) {
  const prisma = {
    activityAssignee: {
      findFirst: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({}),
    },
    activity: { update: jest.fn().mockResolvedValue({}) },
  };
  const notificationHierarchy = { notifyActivityStartedByAssignee: jest.fn() };
  const service = new MyActivitiesService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    notificationHierarchy as any,
  );
  return { service, prisma, notificationHierarchy };
}

describe('iniciar actividad', () => {
  it('marca el inicio real, vale como aceptación y la pasa a En Proceso', async () => {
    const { service, prisma, notificationHierarchy } = build(fila());
    const res = await service.iniciar(VIEWER, 7, 10);

    const data = prisma.activityAssignee.update.mock.calls[0][0].data;
    expect(data.inicioRealAt).toBeInstanceOf(Date);
    expect(data.aceptadaAt).toEqual(data.inicioRealAt);
    expect(res.inicioRealAt).toEqual(data.inicioRealAt);
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { estatus: 'En Proceso', fechaInicio: data.inicioRealAt },
    });
    expect(notificationHierarchy.notifyActivityStartedByAssignee).toHaveBeenCalledWith(
      expect.objectContaining({ activityId: 10, userId: 3, asignadoPorId: 4 }),
    );
  });

  it('otra vez no mueve la hora ni vuelve a avisar', async () => {
    const inicio = new Date('2026-09-18T15:00:00.000Z');
    const { service, prisma, notificationHierarchy } = build(
      fila({ aceptadaAt: inicio, inicioRealAt: inicio, activity: { estatus: 'En Proceso', assignmentCharge: 'ejecucion', fechaInicio: inicio } }),
    );
    const res = await service.iniciar(VIEWER, 7, 10);
    expect(res.inicioRealAt).toEqual(inicio);
    expect(prisma.activityAssignee.update).not.toHaveBeenCalled();
    expect(prisma.activity.update).not.toHaveBeenCalled();
    expect(notificationHierarchy.notifyActivityStartedByAssignee).not.toHaveBeenCalled();
  });

  it('aceptar (apps instaladas) hace lo mismo que iniciar', async () => {
    const { service, prisma } = build(fila());
    await service.aceptar(VIEWER, 7, 10);
    expect(prisma.activityAssignee.update.mock.calls[0][0].data.inicioRealAt).toBeInstanceOf(Date);
  });

  it('quien solo reparte un despacho no la pone En Proceso', async () => {
    const { service, prisma, notificationHierarchy } = build(
      fila({ rol: 'LEAD', activity: { estatus: 'Pendiente', assignmentCharge: 'despacho', fechaInicio: null } }),
    );
    const res = await service.iniciar(VIEWER, 7, 10);
    expect(res.inicioRealAt).toBeNull();
    expect(prisma.activityAssignee.update.mock.calls[0][0].data).not.toHaveProperty('inicioRealAt');
    expect(prisma.activity.update).not.toHaveBeenCalled();
    expect(notificationHierarchy.notifyActivityStartedByAssignee).not.toHaveBeenCalled();
  });

  it('si no es suya no inicia nada', async () => {
    const { service } = build(null);
    await expect(service.iniciar(VIEWER, 7, 10)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('rechazar', () => {
  it('ya no existe para quien la recibe: 403 con mensaje claro', () => {
    const { service } = build(fila());
    expect(() => service.rechazar()).toThrow(ForbiddenException);
    expect(() => service.rechazar()).toThrow(MENSAJE_SIN_RECHAZO);
  });
});
