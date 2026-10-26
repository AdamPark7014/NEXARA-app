import { SlaTrackerService, horasResolucionPorActividad, limiteResolucionMs } from './sla-tracker.service.js';

const ASIGNADO = new Date('2026-09-22T12:00:00.000Z');
const H = 3600_000;

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    anNumber: 'AN-1',
    titulo: 'Caso',
    prioridad: 'Alta',
    estatus: 'Finalizada',
    ticketType: 'CORRECTIVO',
    fechaAsignacion: ASIGNADO,
    fechaInicio: new Date(ASIGNADO.getTime() + H),
    fechaFinalizacion: new Date(ASIGNADO.getTime() + 10 * H),
    fechaEntregaEsperada: null,
    periodoInicio: null,
    periodoFin: null,
    responsable: { id: 7, nombre: 'Ana' },
    branchName: null,
    ...over,
  };
}

function serviceFor(tickets: unknown[], visitas: unknown[] = []) {
  const prisma = {
    activity: { findMany: jest.fn().mockResolvedValue(tickets) },
    maintenanceContractVisit: { findMany: jest.fn().mockResolvedValue(visitas) },
  };
  return new SlaTrackerService(prisma as never);
}

describe('limiteResolucionMs', () => {
  it('usa la entrega esperada del caso', () => {
    const entrega = new Date(ASIGNADO.getTime() + 30 * H);
    expect(
      limiteResolucionMs({
        prioridad: 'Alta',
        fechaAsignacion: ASIGNADO,
        fechaEntregaEsperada: entrega,
        slaResolutionHours: 4,
      }),
    ).toBe(entrega.getTime());
  });

  it('sin entrega usa las horas del contrato desde la asignación', () => {
    expect(
      limiteResolucionMs({
        prioridad: 'Baja',
        fechaAsignacion: ASIGNADO,
        fechaEntregaEsperada: null,
        slaResolutionHours: 4,
      }),
    ).toBe(ASIGNADO.getTime() + 4 * H);
  });

  it('sin ninguno cae en la tabla de prioridad', () => {
    expect(limiteResolucionMs({ prioridad: 'Alta', fechaAsignacion: ASIGNADO })).toBe(ASIGNADO.getTime() + 8 * H);
    expect(limiteResolucionMs({ prioridad: 'Media', fechaAsignacion: ASIGNADO, slaResolutionHours: 0 })).toBe(
      ASIGNADO.getTime() + 24 * H,
    );
    expect(limiteResolucionMs({ prioridad: 'Baja', fechaAsignacion: ASIGNADO, slaResolutionHours: null })).toBe(
      ASIGNADO.getTime() + 72 * H,
    );
  });
});

describe('horasResolucionPorActividad', () => {
  it('se queda con la primera hora válida y descarta 0 o vacío', () => {
    const map = horasResolucionPorActividad([
      { activityId: null, contract: { slaResolutionHours: 10 } },
      { activityId: 1, contract: { slaResolutionHours: 0 } },
      { activityId: 2, contract: { slaResolutionHours: 6 } },
      { activityId: 2, contract: { slaResolutionHours: 99 } },
    ]);
    expect(map.has(1)).toBe(false);
    expect(map.get(2)).toBe(6);
  });

  it('el 72 por omisión del contrato no le gana a la prioridad Alta', () => {
    const map = horasResolucionPorActividad([
      { activityId: 3, contract: { slaResolutionHours: 72 } },
      { activityId: 4, contract: { slaResolutionHours: 48 } },
    ]);
    expect(map.has(3)).toBe(false);
    expect(map.get(4)).toBe(48);
    expect(
      limiteResolucionMs({ prioridad: 'Alta', fechaAsignacion: ASIGNADO, slaResolutionHours: map.get(3) ?? null }),
    ).toBe(ASIGNADO.getTime() + 8 * H);
  });
});

describe('SlaTrackerService.getStats', () => {
  it('la entrega esperada manda sobre la tabla y la respuesta sigue en 2 h', async () => {
    const stats = await serviceFor([
      ticket({
        fechaEntregaEsperada: new Date(ASIGNADO.getTime() + 12 * H),
        fechaInicio: new Date(ASIGNADO.getTime() + 3 * H),
      }),
    ]).getStats({});

    expect(stats.resolutionSla).toMatchObject({ onTime: 1, late: 0 });
    expect(stats.responseSla).toMatchObject({ onTime: 0, late: 1 });
    expect(stats.breaches.find((b) => b.type === 'response')?.priority).toBe('Alta');
    expect(stats.defaultSla.resolutionByPriority).toEqual({ ALTA: 8, MEDIA: 24, BAJA: 72 });
  });

  it('marca tarde la resolución si se cerró después de la entrega esperada', async () => {
    const stats = await serviceFor([
      ticket({
        prioridad: 'Baja',
        fechaEntregaEsperada: new Date(ASIGNADO.getTime() + 4 * H),
        fechaFinalizacion: new Date(ASIGNADO.getTime() + 5 * H),
      }),
    ]).getStats({});

    expect(stats.resolutionSla).toMatchObject({ onTime: 0, late: 1 });
    expect(stats.breaches[0]).toMatchObject({ type: 'resolution', priority: 'Baja', hoursLate: 1 });
  });

  it('usa slaResolutionHours del contrato cuando el caso no trae entrega', async () => {
    const stats = await serviceFor(
      [ticket({ id: 9, prioridad: 'Baja', fechaEntregaEsperada: null, fechaFinalizacion: new Date(ASIGNADO.getTime() + 5 * H) })],
      [{ activityId: 9, contract: { slaResolutionHours: 4 } }],
    ).getStats({});

    expect(stats.resolutionSla).toMatchObject({ onTime: 0, late: 1 });
  });

  it('sin entrega ni contrato deja la tabla de prioridad', async () => {
    const aTiempo = await serviceFor([
      ticket({ prioridad: 'Media', fechaFinalizacion: new Date(ASIGNADO.getTime() + 10 * H) }),
    ]).getStats({});
    const tarde = await serviceFor([
      ticket({ prioridad: 'Media', fechaFinalizacion: new Date(ASIGNADO.getTime() + 30 * H) }),
    ]).getStats({});

    expect(aTiempo.resolutionSla).toMatchObject({ onTime: 1, late: 0 });
    expect(tarde.resolutionSla).toMatchObject({ onTime: 0, late: 1 });
    expect(tarde.breaches[0].hoursLate).toBe(6);
  });
});
