import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CANCEL_FORBIDDEN,
  canCancelActivity,
  canReassignFrom,
  chainExecutorIds,
  cleanMotivo,
  isSuperiorInChain,
  type ActivityChain,
} from './activity-superiors.js';
import { ActivitiesService } from './activities.service.js';

/**
 * Organigrama de prueba: Christian (1) → Luis (2) → Antonio (3) → Alejandro (4).
 * Carolina (5) reporta a Antonio. David (6) es jefe de otra área. Adam (9) es la cuenta de desarrollo.
 */
const CHRISTIAN = { id: 1, email: 'gerencia@nexara.com.mx' };
const CLAUDIA = { id: 8, email: 'claudia.bernal@nexara.com.mx' };
const ADAM = { id: 9, email: 'developer@nexara.com.mx' };
const LUIS = { id: 2, email: 'direccion.operaciones@nexara.com.mx' };
const ANTONIO = { id: 3, email: 'jose.ramirez@nexara.com.mx' };
const ALEJANDRO = { id: 4, email: 'alejandro.gonzalez@nexara.com.mx' };
const CAROLINA = { id: 5, email: 'soporte@nexara.com.mx' };
const DAVID = { id: 6, email: 'operaciones@nexara.com.mx' };

const MANAGER_OF: Record<number, number | null> = { 1: null, 2: 1, 3: 2, 4: 3, 5: 3, 6: 1 };

function jefes(id: number): Set<number> {
  const out = new Set<number>();
  let cur = MANAGER_OF[id] ?? null;
  while (cur != null && !out.has(cur)) {
    out.add(cur);
    cur = MANAGER_OF[cur] ?? null;
  }
  return out;
}

const t0 = new Date('2026-09-17T15:00:00Z');
const later = (min: number) => new Date(t0.getTime() + min * 60_000);

/** Despacho: Luis (responsable) la reparte a Antonio, que la pasa a Alejandro. Creó David. */
function despacho(over: Partial<ActivityChain> = {}): ActivityChain {
  const members = [
    { userId: 2, rol: 'LEAD', asignadoAt: t0 },
    { userId: 3, rol: 'LEAD', asignadoAt: later(10) },
    { userId: 4, rol: 'TECNICO', asignadoAt: later(20) },
  ];
  return {
    id: 10,
    companyId: 7,
    titulo: 'Mantenimiento de CCTV',
    estatus: 'En Proceso',
    responsableId: 2,
    creadoPorId: 6,
    assignmentCharge: 'despacho',
    members,
    managersOf: new Map([1, 2, 3, 4, 5, 6].map((id) => [id, jefes(id)])),
    nombres: new Map(),
    ...over,
  };
}

/** Ejecución directa: Alejandro la hace él mismo; la creó Antonio. */
function ejecucion(over: Partial<ActivityChain> = {}): ActivityChain {
  return despacho({
    responsableId: 4,
    creadoPorId: 3,
    assignmentCharge: 'ejecucion',
    members: [{ userId: 4, rol: 'LEAD', asignadoAt: t0 }],
    ...over,
  });
}

describe('superiores en la cadena de una actividad', () => {
  it('en despacho solo ejecuta quien no reparte', () => {
    expect(chainExecutorIds(despacho())).toEqual([4]);
    expect(chainExecutorIds(ejecucion())).toEqual([4]);
  });

  it('Christian, su equivalente y la cuenta de desarrollo pueden cancelar cualquier actividad', () => {
    expect(canCancelActivity(CHRISTIAN, despacho())).toBe(true);
    expect(canCancelActivity(CLAUDIA, despacho())).toBe(true);
    expect(canCancelActivity(ADAM, ejecucion())).toBe(true);
  });

  it('los jefes por organigrama de quien la ejecuta pueden cancelar', () => {
    expect(canCancelActivity(ANTONIO, ejecucion())).toBe(true);
    expect(canCancelActivity(LUIS, ejecucion())).toBe(true);
  });

  it('el encargado que la repartió (LEAD anterior) puede cancelar aunque no sea su jefe directo', () => {
    const chain = despacho({ managersOf: new Map() });
    expect(canCancelActivity(ANTONIO, chain)).toBe(true);
    expect(canCancelActivity(LUIS, chain)).toBe(true);
  });

  it('quien la creó o es responsable sin ejecutarla es superior', () => {
    expect(isSuperiorInChain(DAVID, despacho(), 4)).toBe(true);
    expect(canCancelActivity(DAVID, despacho())).toBe(true);
  });

  it('quien la ejecuta no puede cancelar su propia actividad', () => {
    expect(canCancelActivity(ALEJANDRO, ejecucion())).toBe(false);
    expect(canCancelActivity(ALEJANDRO, despacho())).toBe(false);
  });

  it('un compañero o un jefe de otra área no puede cancelar', () => {
    expect(canCancelActivity(CAROLINA, ejecucion())).toBe(false);
    expect(canCancelActivity(DAVID, ejecucion())).toBe(false);
    expect(canCancelActivity(undefined, ejecucion())).toBe(false);
  });

  it('con varios ejecutores hay que ser superior de todos', () => {
    const chain = despacho({
      members: [
        { userId: 2, rol: 'LEAD', asignadoAt: t0 },
        { userId: 4, rol: 'TECNICO', asignadoAt: later(20) },
        { userId: 6, rol: 'TECNICO', asignadoAt: later(20) },
      ],
      creadoPorId: 1,
    });
    // Antonio es jefe de Alejandro pero no de David.
    expect(canCancelActivity(ANTONIO, chain)).toBe(false);
    expect(canCancelActivity(LUIS, chain)).toBe(true);
  });

  it('pasar a otro compañero exige ser superior de la persona reemplazada', () => {
    expect(canReassignFrom(ANTONIO, despacho(), 4)).toBe(true);
    expect(canReassignFrom(ALEJANDRO, despacho(), 4)).toBe(false);
    expect(canReassignFrom(CAROLINA, despacho(), 4)).toBe(false);
    // Nadie reemplaza a quien no está en la actividad.
    expect(canReassignFrom(CHRISTIAN, despacho(), 5)).toBe(false);
  });

  it('el motivo es obligatorio y de al menos 10 caracteres', () => {
    expect(cleanMotivo('corto')).toBeNull();
    expect(cleanMotivo('          ')).toBeNull();
    expect(cleanMotivo(undefined)).toBeNull();
    expect(cleanMotivo('  El cliente   pospuso la visita ')).toBe('El cliente pospuso la visita');
  });
});

function buildActivitiesService(activity: Record<string, unknown>) {
  const prisma = {
    activity: {
      findFirst: jest.fn().mockResolvedValue(activity),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...activity, ...data })),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(
        Object.entries(MANAGER_OF).map(([id, managerId]) => ({ id: Number(id), managerId, nombre: `U${id}` })),
      ),
    },
    evidence: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const hierarchy = {
    notifyActivityCancelled: jest.fn().mockResolvedValue(undefined),
    notifyActivityMarkedFinished: jest.fn().mockResolvedValue(undefined),
    notifyActivityStarted: jest.fn().mockResolvedValue(undefined),
  };
  const domainEvents = { publishEntityLifecycle: jest.fn() };
  const service = new ActivitiesService(prisma as any, hierarchy as any, domainEvents as any);
  return { service, prisma, hierarchy };
}

const ACTIVIDAD = {
  id: 10,
  companyId: 7,
  titulo: 'Mantenimiento de CCTV',
  estatus: 'En Proceso',
  responsableId: 4,
  creadoPorId: 3,
  assignmentCharge: 'ejecucion',
  anNumber: 'AN-0010',
  assignees: [{ userId: 4, rol: 'LEAD', asignadoAt: t0 }],
};

describe('ActivitiesService · cancelar', () => {
  it('un superior cancela con motivo: queda documentado y se avisa', async () => {
    const { service, prisma, hierarchy } = buildActivitiesService(ACTIVIDAD);
    await service.cancel(10, 'El cliente pospuso la visita', LUIS, 7);

    const data = prisma.activity.update.mock.calls[0][0].data;
    expect(data.estatus).toBe('Cancelada');
    expect(data.cancelReason).toBe('El cliente pospuso la visita');
    expect(data.cancelledById).toBe(LUIS.id);
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(hierarchy.notifyActivityCancelled).toHaveBeenCalledWith({
      activityId: 10,
      actorId: LUIS.id,
      motivo: 'El cliente pospuso la visita',
    });
  });

  it('sin motivo suficiente responde 400 y no toca la actividad', async () => {
    const { service, prisma } = buildActivitiesService(ACTIVIDAD);
    await expect(service.cancel(10, 'no va', LUIS, 7)).rejects.toThrow(BadRequestException);
    expect(prisma.activity.update).not.toHaveBeenCalled();
  });

  it('quien la ejecuta recibe 403 al cancelar', async () => {
    const { service, prisma } = buildActivitiesService(ACTIVIDAD);
    await expect(service.cancel(10, 'Ya no me dio tiempo hoy', ALEJANDRO, 7)).rejects.toThrow(
      new ForbiddenException(CANCEL_FORBIDDEN),
    );
    expect(prisma.activity.update).not.toHaveBeenCalled();
  });

  it('el PATCH genérico con estatus «Cancelada» aplica la misma regla (no se puede saltar)', async () => {
    const { service, prisma } = buildActivitiesService(ACTIVIDAD);
    await expect(service.update(10, { estatus: 'Cancelada' } as any, CAROLINA, 7)).rejects.toThrow(ForbiddenException);
    await expect(service.update(10, { estatus: 'cancelado' } as any, LUIS, 7)).rejects.toThrow(BadRequestException);
    expect(prisma.activity.update).not.toHaveBeenCalled();

    await service.update(10, { estatus: 'Cancelada', cancelReason: 'Se duplicó con otra orden' } as any, LUIS, 7);
    expect(prisma.activity.update.mock.calls[0][0].data.cancelReason).toBe('Se duplicó con otra orden');
  });

  it('el motivo no se puede escribir fuera de una cancelación', async () => {
    const { service, prisma } = buildActivitiesService(ACTIVIDAD);
    await service.update(10, { descripcion: 'Nueva', cancelReason: 'inventado por PATCH' } as any, LUIS, 7);
    expect(prisma.activity.update.mock.calls[0][0].data).toEqual({ descripcion: 'Nueva' });
  });

  it('reabrir una cancelada también es solo de superiores', async () => {
    const { service } = buildActivitiesService({ ...ACTIVIDAD, estatus: 'Cancelada' });
    await expect(service.update(10, { estatus: 'En Proceso' } as any, ALEJANDRO, 7)).rejects.toThrow(ForbiddenException);
  });
});
