import { ActivityNonComplianceService } from './activity-non-compliance.service';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service';
import { DOMAIN_EVENTS } from '../domain-events/domain-event.types';

// México no cambia de horario: 28-10-2026 18:02 en México = 29-10 00:02 UTC.
const MX = (iso: string) => new Date(`${iso}-06:00`);

/** AN-0341 del 28-10: «montaje» de Alejandro (15), citada a las 14:00, sin foto de salida. */
function actividad(over: Record<string, unknown> = {}) {
  return {
    id: 375,
    companyId: 1,
    titulo: 'montaje',
    estatus: 'En Proceso',
    responsableId: 15,
    assignmentCharge: null,
    fechaAsignacion: MX('2026-10-28T13:00:00'),
    fechaInicio: MX('2026-10-28T14:00:00'),
    fechaMaxima: MX('2026-10-28T14:00:00'),
    fechaEntregaEsperada: MX('2026-10-28T14:00:00'),
    periodoInicio: null,
    periodoFin: null,
    cierreAvisadoAt: null,
    assignees: [],
    activityEvidences: [{ userId: 15, status: 'EVIDENCE_PHOTOS', completedAt: null, entryPhotoUploadedAt: MX('2026-10-28T14:19:00') }],
    ...over,
  };
}

function armar(filas: any[], salidas: Array<{ userId: number; timestamp: Date }> = []) {
  const registros: any[] = [];
  const prisma: any = {
    activity: {
      findMany: jest.fn().mockResolvedValue(filas),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    attendance: { findMany: jest.fn().mockResolvedValue(salidas) },
    activityNonCompliance: { create: jest.fn(async ({ data }: any) => registros.push(data)) },
    activityWorkSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const avisos = { notifyActivityNonCompliance: jest.fn().mockResolvedValue(undefined) };
  const bus = new DomainEventBusService();
  const service = new ActivityNonComplianceService(prisma, avisos as any, {} as any, bus);
  service.onModuleInit();
  return { service, prisma, registros, avisos, bus };
}

describe('cierre de jornada al checar salida (regla de Adam, 28-10)', () => {
  it('no hay cron: la actividad solo se cierra cuando quien la tiene checa su salida', async () => {
    const { service, prisma, registros } = armar([actividad()]);
    expect(typeof (service as any).revisarCierres).toBe('undefined');

    const r = await service.alChecarSalida({ userId: 15, companyId: 1, at: MX('2026-10-28T18:02:00') });
    expect(r.cerradas).toBe(1);
    expect(prisma.activity.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estatus: 'No cumplida' } }),
    );
    expect(registros).toEqual([
      expect.objectContaining({
        activityId: 375,
        origen: 'CIERRE_JORNADA',
        pendientesIds: [15],
        limite: MX('2026-10-28T18:02:00'),
        registradoAt: MX('2026-10-28T18:02:00'),
      }),
    ]);
  });

  it('llega por el bus de eventos que publica asistencia', async () => {
    const { prisma, bus } = armar([actividad()]);
    bus.publish(DOMAIN_EVENTS.ATTENDANCE_CHECKOUT, { userId: 15, companyId: 1, at: MX('2026-10-28T18:02:00') });
    await new Promise((r) => setImmediate(r));
    expect(prisma.activity.findMany).toHaveBeenCalled();
    expect(prisma.activity.updateMany).toHaveBeenCalled();
  });

  it('en equipo no se cierra mientras otro que no la entregó siga en jornada', async () => {
    const equipo = actividad({
      assignmentCharge: 'TEAM',
      assignees: [
        { userId: 15, rol: 'EJECUTOR', asignadoAt: MX('2026-10-28T13:00:00'), inicioRealAt: null, finRealAt: null },
        { userId: 58, rol: 'EJECUTOR', asignadoAt: MX('2026-10-28T13:00:00'), inicioRealAt: null, finRealAt: null },
      ],
    });
    const solo = armar([equipo]);
    await expect(solo.service.alChecarSalida({ userId: 15, companyId: 1, at: MX('2026-10-28T18:02:00') })).resolves.toEqual({
      cerradas: 0,
    });
    expect(solo.prisma.activity.updateMany).not.toHaveBeenCalled();

    const ambos = armar([equipo], [{ userId: 58, timestamp: MX('2026-10-28T18:05:00') }]);
    await ambos.service.alChecarSalida({ userId: 15, companyId: 1, at: MX('2026-10-28T18:07:00') });
    expect(ambos.registros[0]?.pendientesIds?.sort()).toEqual([15, 58]);
    // Solo cuentan salidas propias: ni la automática de las 23:30 ni la de un jefe.
    expect(ambos.prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'salida', cierreAutomatico: false, registradaPorId: null }),
      }),
    );
  });

  it('lo que vence mañana no se cierra con la salida de hoy', async () => {
    const manana = MX('2026-10-29T10:00:00');
    const { service, prisma } = armar([
      actividad({ fechaInicio: manana, fechaMaxima: manana, fechaEntregaEsperada: manana }),
    ]);
    await service.alChecarSalida({ userId: 15, companyId: 1, at: MX('2026-10-28T18:02:00') });
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });
});
