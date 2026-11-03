import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

const inicio = new Date('2026-11-02T16:00:00Z');
const fin = new Date('2026-11-02T22:10:00Z');

function build(actividad: Record<string, unknown> | null, yaDicho: { id: number } | null = null) {
  const create = jest.fn(async () => ({}));
  const update = jest.fn(async () => ({}));
  const prisma = {
    activity: { findFirst: jest.fn(async () => actividad) },
    activityWorkSession: { findMany: jest.fn(async () => [{ userId: 7, activityId: 5, startedAt: inicio, endedAt: fin }]) },
    actividadTiempoDicho: { findFirst: jest.fn(async () => yaDicho), create, update },
  };
  const service = new ActivitiesService(prisma as never, {} as never, {} as never);
  return { service, create, update };
}

const terminada = { id: 5, companyId: 1, responsableId: 7, estatus: 'Por Validar', periodoInicio: null, periodoFin: null, fechaFinalizacion: null };

describe('decir cuánto tomó de verdad', () => {
  it('guarda lo que dice quien la ejecutó, con lo que decía el reloj', async () => {
    const { service, create } = build(terminada);
    await expect(service.decirTiempo(5, 120, { id: 7 }, 1)).resolves.toEqual({ tiempoDichoMin: 120, preguntarTiempo: false });
    expect(create).toHaveBeenCalledWith({ data: { companyId: 1, activityId: 5, userId: 7, minutos: 120, relojMin: 370 } });
  });

  it('contestar otra vez corrige, no duplica', async () => {
    const { service, create, update } = build(terminada, { id: 9 });
    await service.decirTiempo(5, 90, { id: 7 }, 1);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: 9 }, data: { minutos: 90, relojMin: 370, userId: 7 } });
  });

  it('solo quien la ejecutó', async () => {
    const { service, create } = build(terminada);
    await expect(service.decirTiempo(5, 120, { id: 8 }, 1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.decirTiempo(5, 120, undefined, 1)).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('otra empresa no la encuentra', async () => {
    const { service } = build({ ...terminada, companyId: 2 });
    await expect(service.decirTiempo(5, 120, { id: 7 }, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin terminar o con un número que no es tiempo, no', async () => {
    const { service, create } = build({ ...terminada, estatus: 'En Proceso' });
    await expect(service.decirTiempo(5, 120, { id: 7 }, 1)).rejects.toBeInstanceOf(BadRequestException);
    const otro = build(terminada);
    for (const malo of [0, -5, 'x', undefined, 6001]) {
      await expect(otro.service.decirTiempo(5, malo, { id: 7 }, 1)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(create).not.toHaveBeenCalled();
    expect(otro.create).not.toHaveBeenCalled();
  });
});
