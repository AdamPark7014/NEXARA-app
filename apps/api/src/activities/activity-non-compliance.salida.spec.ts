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
    attendanceDay: { findMany: jest.fn().mockResolvedValue([]) },
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

describe('cierre de jornada al checar salida (regla de Adam, 20-11)', () => {
  it('la actividad se cierra cuando quien la tiene checa su salida', async () => {
    const { service, prisma, registros } = armar([actividad()]);

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
    // Cuentan todas las salidas del día (propia, automática o de un jefe).
    expect(ambos.prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'salida' }),
      }),
    );
    expect(ambos.prisma.attendance.findMany.mock.calls[0][0].where.cierreAutomatico).toBeUndefined();
    expect(ambos.prisma.attendance.findMany.mock.calls[0][0].where.registradaPorId).toBeUndefined();
  });

  it('lo que vence mañana no se cierra con la salida de hoy', async () => {
    const manana = MX('2026-10-29T10:00:00');
    const { service, prisma } = armar([
      actividad({ fechaInicio: manana, fechaMaxima: manana, fechaEntregaEsperada: manana }),
    ]);
    await service.alChecarSalida({ userId: 15, companyId: 1, at: MX('2026-10-28T18:02:00') });
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });

  it('cierre automático (marca automatica) cierra lo vencido de esa persona', async () => {
    const { service, prisma, registros } = armar([actividad()]);
    const r = await service.alChecarSalida({
      userId: 15,
      companyId: 1,
      at: MX('2026-10-28T23:30:00'),
      automatica: true,
    });
    expect(r.cerradas).toBe(1);
    expect(registros[0]).toMatchObject({ origen: 'CIERRE_JORNADA', activityId: 375 });
    expect(prisma.activity.updateMany).toHaveBeenCalled();
  });

  it('salida registrada por un jefe (porJefe) también cierra', async () => {
    const { service, registros } = armar([actividad()]);
    const r = await service.alChecarSalida({
      userId: 15,
      companyId: 1,
      at: MX('2026-10-28T18:10:00'),
      porJefe: true,
    });
    expect(r.cerradas).toBe(1);
    expect(registros[0]?.origen).toBe('CIERRE_JORNADA');
  });

  it('pausada que vence hoy + salida → No cumplida', async () => {
    const { service, registros } = armar([
      actividad({ estatus: 'En Proceso' }), // pausa no cambia estatus
    ]);
    await service.alChecarSalida({ userId: 15, companyId: 1, at: MX('2026-10-28T18:02:00') });
    expect(registros).toHaveLength(1);
  });

  it('pausada de periodo vigente + salida → sigue abierta', async () => {
    const fin = MX('2026-10-30T18:00:00');
    const { service, prisma } = armar([
      actividad({
        periodoInicio: MX('2026-10-27T00:00:00'),
        periodoFin: fin,
        fechaMaxima: fin,
        fechaEntregaEsperada: fin,
      }),
    ]);
    await service.alChecarSalida({ userId: 15, companyId: 1, at: MX('2026-10-28T18:02:00') });
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });

  it('barrido: sin checada con vencida ayer → No cumplida; con jornada abierta no; Por Validar no; idempotente', async () => {
    const vencida = actividad({
      id: 400,
      fechaInicio: MX('2026-10-27T10:00:00'),
      fechaMaxima: MX('2026-10-27T10:00:00'),
      fechaEntregaEsperada: MX('2026-10-27T10:00:00'),
      fechaAsignacion: MX('2026-10-27T08:00:00'),
    });
    const porValidar = actividad({ id: 401, estatus: 'Por Validar' });
    const manana = MX('2026-10-29T10:00:00');
    const vigente = actividad({
      id: 402,
      fechaInicio: manana,
      fechaMaxima: manana,
      fechaEntregaEsperada: manana,
    });
    const equipo = actividad({
      id: 403,
      assignmentCharge: 'TEAM',
      assignees: [
        { userId: 15, rol: 'EJECUTOR', asignadoAt: MX('2026-10-27T08:00:00'), inicioRealAt: null, finRealAt: null },
        { userId: 58, rol: 'EJECUTOR', asignadoAt: MX('2026-10-27T08:00:00'), inicioRealAt: null, finRealAt: null },
      ],
      fechaInicio: MX('2026-10-27T10:00:00'),
      fechaMaxima: MX('2026-10-27T10:00:00'),
      fechaEntregaEsperada: MX('2026-10-27T10:00:00'),
      fechaAsignacion: MX('2026-10-27T08:00:00'),
    });

    const base = armar([vencida, porValidar, vigente, equipo]);
    base.prisma.attendanceDay.findMany.mockResolvedValue([]); // nadie con jornada abierta
    const r1 = await base.service.barridoNocturno(MX('2026-10-28T23:40:00'));
    expect(r1.cerradas).toBe(2);
    expect(base.registros.map((x) => x.activityId).sort()).toEqual([400, 403]);

    // Con jornada abierta del ejecutor: no cierra esa
    const conAbierta = armar([vencida]);
    conAbierta.prisma.attendanceDay.findMany.mockResolvedValue([{ userId: 15 }]);
    const r2 = await conAbierta.service.barridoNocturno(MX('2026-10-28T23:40:00'));
    expect(r2.cerradas).toBe(0);

    // Equipo: uno aún con jornada abierta → no
    const eq = armar([equipo]);
    eq.prisma.attendanceDay.findMany.mockResolvedValue([{ userId: 58 }]);
    expect((await eq.service.barridoNocturno(MX('2026-10-28T23:40:00'))).cerradas).toBe(0);

    // Idempotente: segunda pasada no duplica (updateMany count 0)
    const otra = armar([vencida]);
    otra.prisma.activity.updateMany.mockResolvedValue({ count: 0 });
    const r3 = await otra.service.barridoNocturno(MX('2026-10-28T23:40:00'));
    expect(r3.cerradas).toBe(0);
    expect(otra.registros).toHaveLength(0);
  });

  it('al checar entrada: lo que venció antes se cierra aunque su jornada ya esté abierta; lo de hoy no', async () => {
    const vencida = actividad({
      id: 500,
      fechaInicio: MX('2026-10-27T10:00:00'),
      fechaMaxima: MX('2026-10-27T10:00:00'),
      fechaEntregaEsperada: MX('2026-10-27T10:00:00'),
      fechaAsignacion: MX('2026-10-27T08:00:00'),
    });
    const hoy = MX('2026-10-28T17:00:00');
    const deHoy = actividad({ id: 501, fechaInicio: hoy, fechaMaxima: hoy, fechaEntregaEsperada: hoy });
    const { service, prisma, registros } = armar([vencida, deHoy]);
    prisma.attendanceDay.findMany.mockResolvedValue([{ userId: 15 }]); // acaba de abrir la suya
    const r = await service.alChecarEntrada({ userId: 15, companyId: 1, at: MX('2026-10-28T10:02:00') });
    expect(r.cerradas).toBe(1);
    expect(registros.map((x) => x.activityId)).toEqual([500]);
    // Solo busca lo de esa persona y de su empresa.
    const where = prisma.activity.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(1);
    expect(JSON.stringify(where.AND)).toContain('"responsableId":15');
  });

  it('al checar entrada: en equipo no se cierra si un compañero sigue con jornada abierta', async () => {
    const equipo = actividad({
      id: 503,
      assignmentCharge: 'TEAM',
      assignees: [
        { userId: 15, rol: 'EJECUTOR', asignadoAt: MX('2026-10-27T08:00:00'), inicioRealAt: null, finRealAt: null },
        { userId: 58, rol: 'EJECUTOR', asignadoAt: MX('2026-10-27T08:00:00'), inicioRealAt: null, finRealAt: null },
      ],
      fechaInicio: MX('2026-10-27T10:00:00'),
      fechaMaxima: MX('2026-10-27T10:00:00'),
      fechaEntregaEsperada: MX('2026-10-27T10:00:00'),
      fechaAsignacion: MX('2026-10-27T08:00:00'),
    });
    const conCompa = armar([equipo]);
    conCompa.prisma.attendanceDay.findMany.mockResolvedValue([{ userId: 15 }, { userId: 58 }]);
    expect((await conCompa.service.alChecarEntrada({ userId: 15, companyId: 1, at: MX('2026-10-28T10:02:00') })).cerradas).toBe(0);
    const solo = armar([equipo]);
    solo.prisma.attendanceDay.findMany.mockResolvedValue([{ userId: 15 }]);
    expect((await solo.service.alChecarEntrada({ userId: 15, companyId: 1, at: MX('2026-10-28T10:02:00') })).cerradas).toBe(1);
  });
});
