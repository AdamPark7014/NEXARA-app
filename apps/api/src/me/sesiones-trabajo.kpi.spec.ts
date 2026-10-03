import { BadRequestException } from '@nestjs/common';
import { MyActivitiesService } from './my-activities.service';
import { TeamBoardService } from './team-board.service';
import { calculaActividad, kpisDePersona, ventanasLaboradas } from './pizarra-kpi';
import { MENSAJE_TOPE_12H } from '../activities/sessions/sesiones-trabajo';

/**
 * Sesiones de trabajo vistas desde la pizarra, «Mis actividades» y los KPI.
 *
 * Lo que pidió el dueño: que una actividad no cuente tiempo indefinido, que su salida la
 * detenga, y que los KPI digan «horas productivas contra horas trabajadas» —las productivas,
 * dentro de la jornada entre su entrada y su salida.
 *
 * Hora de México (UTC−6). «Ahora» es el jueves 17-09-2026 a las 13:00.
 */
const M = (dia: string, hhmm: string) => new Date(`2026-09-${dia}T${hhmm}:00-06:00`);
const AHORA = M('17', '13:00');

describe('pizarra: tiempo real por sesiones', () => {
  it('una actividad de varios días suma sus sesiones, no las noches', () => {
    const calc = calculaActividad(
      {
        estatus: 'En Proceso',
        inicio: M('14', '09:00'),
        fin: null,
        sesiones: [
          { startedAt: M('14', '09:00'), endedAt: M('14', '18:00'), endReason: 'SALIDA' },
          { startedAt: M('15', '10:00'), endedAt: M('15', '12:00'), endReason: 'PAUSA' },
          { startedAt: M('17', '12:00'), endedAt: null },
        ],
      },
      AHORA,
    );
    // 9 h + 2 h + 1 h. De corrido serían 76 horas.
    expect(calc.minutosReales).toBe(12 * 60);
    expect(calc.tramos).toHaveLength(3);
  });

  it('sin sesiones (dato de antes de la regla) nunca pasa de 12 horas', () => {
    const cerrada = calculaActividad(
      { estatus: 'Finalizada', terminada: true, inicio: M('10', '09:00'), fin: M('15', '18:00') },
      AHORA,
    );
    const abierta = calculaActividad({ estatus: 'En Proceso', inicio: M('10', '09:00'), fin: null }, AHORA);
    expect(cerrada.minutosReales).toBe(720);
    expect(abierta.minutosReales).toBe(720);
  });

  it('lo normal no cambia: una actividad de hoy cuenta de su inicio a ahora', () => {
    const calc = calculaActividad({ estatus: 'En Proceso', inicio: M('17', '10:30'), fin: null }, AHORA);
    expect(calc.minutosReales).toBe(150);
  });
});

describe('KPI de la persona: horas productivas dentro de la jornada', () => {
  const jornadas = [{ entrada: M('17', '09:00'), salida: M('17', '18:00') }];
  const comidas = [{ inicio: M('17', '14:00'), fin: M('17', '15:00') }];
  const ahora = M('17', '20:00');

  it('la jornada son tramos: entrada → salida menos la comida', () => {
    expect(ventanasLaboradas(jornadas, comidas, ahora)).toEqual([
      { inicio: M('17', '09:00').getTime(), fin: M('17', '14:00').getTime() },
      { inicio: M('17', '15:00').getTime(), fin: M('17', '18:00').getTime() },
    ]);
  });

  it('lo trabajado antes de la entrada o después de la salida no es productivo', () => {
    const calc = calculaActividad(
      {
        estatus: 'En Proceso',
        inicio: M('17', '08:00'),
        fin: null,
        // 08:00 → 19:30 (la cerró tarde): 11.5 h de reloj, 8 h dentro de la jornada.
        sesiones: [{ startedAt: M('17', '08:00'), endedAt: M('17', '19:30'), endReason: 'PAUSA' }],
      },
      ahora,
    );
    const kpis = kpisDePersona([calc], 480, ventanasLaboradas(jornadas, comidas, ahora));
    expect(kpis.minutosReales).toBe(690);
    expect(kpis.minutosEnActividad).toBe(480);
    expect(kpis.productividadPct).toBe(100);
  });

  it('dos actividades a la vez no cuentan doble', () => {
    const a = calculaActividad(
      { estatus: 'En Proceso', inicio: M('17', '09:00'), fin: null, sesiones: [{ startedAt: M('17', '09:00'), endedAt: M('17', '11:00') }] },
      ahora,
    );
    const b = calculaActividad(
      { estatus: 'En Proceso', inicio: M('17', '10:00'), fin: null, sesiones: [{ startedAt: M('17', '10:00'), endedAt: M('17', '12:00') }] },
      ahora,
    );
    const kpis = kpisDePersona([a, b], 480, ventanasLaboradas(jornadas, comidas, ahora));
    expect(kpis.minutosEnActividad).toBe(180);
    expect(kpis.productividadPct).toBe(38);
  });

  it('una actividad de días anteriores no infla la productividad de hoy', () => {
    // Antes: 3 días de corrido contra 8 h asistidas daba cientos de por ciento.
    const vieja = calculaActividad({ estatus: 'En Proceso', inicio: M('14', '09:00'), fin: null }, ahora);
    const kpis = kpisDePersona([vieja], 480, ventanasLaboradas(jornadas, comidas, ahora));
    expect(kpis.minutosEnActividad).toBe(0);
    expect(kpis.productividadPct).toBe(0);
  });

  it('sin las ventanas (clientes del contrato anterior) suma como antes', () => {
    const calc = calculaActividad({ estatus: 'En Proceso', inicio: M('17', '10:00'), fin: M('17', '12:00') }, ahora);
    expect(kpisDePersona([calc], 480).minutosEnActividad).toBe(120);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mis actividades
// ─────────────────────────────────────────────────────────────────────────────

const TECNICO = { id: 13, email: 'soporte@nexara.com.mx' };

function actividad(over: Record<string, unknown> = {}) {
  return {
    id: 90,
    anNumber: 'AN-0090',
    titulo: 'Instalar cámaras',
    descripcion: null,
    estatus: 'En Proceso',
    prioridad: 'MEDIA',
    coreKind: 'tarea',
    ticketTypeCustom: null,
    assignmentCharge: 'ejecucion',
    fechaInicio: null,
    fechaMaxima: null,
    fechaEntregaEsperada: null,
    fechaAsignacion: M('14', '08:00'),
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

function filaMia(over: Record<string, unknown> = {}) {
  const activity = actividad();
  return {
    rol: 'TECNICO',
    asignadoAt: activity.fechaAsignacion,
    indicaciones: null,
    ordenEjecucion: null,
    ordenJustificacion: null,
    ordenActualizadoAt: null,
    aceptadaAt: M('14', '09:00'),
    rechazadaAt: null,
    motivoRechazo: null,
    inicioRealAt: M('14', '09:00'),
    finRealAt: null,
    horasPlan: null,
    saltoPrioridad: false,
    asignadoPor: { id: 8, nombre: 'David' },
    activity,
    ...over,
  };
}

function misActividades(sesiones: unknown[], sesionesService?: unknown) {
  const prisma = {
    activityAssignee: {
      findMany: jest.fn().mockResolvedValue([filaMia()]),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    activity: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    activityWorkSession: {
      findMany: jest.fn(async ({ where }: any) => (where.endedAt === null ? [] : sesiones)),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const service = new MyActivitiesService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    { notifyActivityStartedByAssignee: jest.fn() } as any,
    { asertarChecklistCompleto: jest.fn().mockResolvedValue(undefined) } as any,
    sesionesService as any,
  );
  return { service, prisma };
}

describe('Mis actividades: en pausa y reanudar', () => {
  beforeEach(() => jest.useFakeTimers({ now: AHORA }));
  afterEach(() => jest.useRealTimers());

  it('pausada por su jefe: sale «en pausa» con quién y por qué, y sigue «En Proceso»', async () => {
    const { service } = misActividades([
      {
        id: 1,
        activityId: 90,
        userId: 13,
        startedAt: M('17', '09:00'),
        endedAt: M('17', '11:00'),
        endReason: 'PAUSA',
        endedById: 1,
        endedBy: { id: 1, nombre: 'Christian' },
        nota: 'Atiende primero la falla del cliente',
      },
    ]);
    const res = await service.list(TECNICO, 1);
    expect(res.open[0]).toEqual(
      expect.objectContaining({
        estatus: 'En Proceso',
        enCurso: false,
        enPausa: true,
        pausaTipo: 'PAUSA',
        pausadaPor: { id: 1, nombre: 'Christian' },
        motivoPausa: 'Atiende primero la falla del cliente',
        // Sus 2 horas de sesión, no los 3 días desde que la inició.
        minutosReales: 120,
      }),
    );
  });

  it('con la sesión abierta su reloj corre', async () => {
    const { service } = misActividades([
      { id: 1, activityId: 90, userId: 13, startedAt: M('17', '12:00'), endedAt: null },
    ]);
    const [item] = (await service.list(TECNICO, 1)).open;
    expect(item).toEqual(
      expect.objectContaining({ enCurso: true, enPausa: false, minutosReales: 60, sesionAbiertaDesde: M('17', '12:00') }),
    );
  });

  it('iniciada hace días y sin sesiones (antes de la regla): toca reanudarla y no pasa de 12 h', async () => {
    const { service } = misActividades([]);
    const [item] = (await service.list(TECNICO, 1)).open;
    expect(item).toEqual(expect.objectContaining({ enPausa: true, pausaTipo: 'TOPE_12H', minutosReales: 720 }));
  });

  it('«Iniciar» abre la sesión de trabajo', async () => {
    const sesiones = { abrir: jest.fn().mockResolvedValue({ abierta: true }) };
    const { service, prisma } = misActividades([], sesiones);
    prisma.activityAssignee.findFirst.mockResolvedValue({
      id: 50,
      rol: 'TECNICO',
      aceptadaAt: null,
      rechazadaAt: null,
      inicioRealAt: null,
      asignadoPorId: 8,
      activity: { estatus: 'Pendiente', assignmentCharge: 'ejecucion', fechaInicio: null },
    });
    await service.iniciar(TECNICO, 1, 90);
    expect(sesiones.abrir).toHaveBeenCalledWith({ activityId: 90, userId: 13, at: AHORA, companyId: 1 });
  });

  it('quien solo reparte un despacho no abre sesión', async () => {
    const sesiones = { abrir: jest.fn() };
    const { service, prisma } = misActividades([], sesiones);
    prisma.activityAssignee.findFirst.mockResolvedValue({
      id: 50,
      rol: 'LEAD',
      aceptadaAt: null,
      rechazadaAt: null,
      inicioRealAt: null,
      asignadoPorId: 8,
      activity: { estatus: 'Pendiente', assignmentCharge: 'despacho', fechaInicio: null },
    });
    await service.iniciar(TECNICO, 1, 90);
    expect(sesiones.abrir).not.toHaveBeenCalled();
  });

  it('pausar y reanudar pasan a las sesiones con la persona correcta', async () => {
    const sesiones = {
      pausar: jest.fn().mockResolvedValue({ ok: true }),
      reanudar: jest.fn().mockResolvedValue({ ok: true }),
    };
    const { service } = misActividades([], sesiones);
    await service.pausar(TECNICO, 1, 90, 'Voy a comer');
    await service.reanudar(TECNICO, 1, 90);
    await service.pausarDeEquipo({ id: 1, roleKey: 'ceo' }, 1, 13, 90, 'Atiende la falla urgente');
    expect(sesiones.pausar).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userId: 13, activityId: 90, actor: expect.objectContaining({ id: 13 }) }),
    );
    expect(sesiones.reanudar).toHaveBeenCalledWith({ userId: 13, activityId: 90, companyId: 1 });
    expect(sesiones.pausar).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userId: 13, actor: { id: 1, roleKey: 'ceo' }, motivo: 'Atiende la falla urgente' }),
    );
  });

  it('un jefe no pausa «a su equipo» su propia actividad', () => {
    const { service } = misActividades([], { pausar: jest.fn() });
    expect(() => service.pausarDeEquipo({ id: 13 }, 1, 13, 90, 'Atiende la falla urgente')).toThrow(
      BadRequestException,
    );
  });

  it('repartir un despacho con más de 12 horas estimadas se rechaza', async () => {
    const { service, prisma } = misActividades([]);
    const gente = [
      { id: 13, email: TECNICO.email, managerId: null },
      { id: 20, email: 'joan.sanchez@nexara.com.mx', managerId: 13 },
    ];
    (prisma as any).user = {
      findMany: jest.fn(async ({ where }: any) =>
        where?.id?.in ? gente.filter((u) => where.id.in.includes(u.id)) : gente,
      ),
    };
    prisma.activityAssignee.findFirst.mockResolvedValue({ id: 1 });
    const addMember = jest.fn();
    (service as any).team = { addMember };

    await expect(service.dispatch(TECNICO, 1, 90, { userIds: [20], horasPlan: 13 })).rejects.toThrow(
      MENSAJE_TOPE_12H,
    );
    expect(addMember).not.toHaveBeenCalled();

    // Doce horas exactas sí pasan.
    await service.dispatch(TECNICO, 1, 90, { userIds: [20], horasPlan: 12 });
    expect(addMember).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pizarra (Mi equipo)
// ─────────────────────────────────────────────────────────────────────────────

const JEFE = { id: 7, nombre: 'Luis', email: 'direccion.operaciones@nexara.com.mx', avatarUrl: null, puesto: null, managerId: 1 };
const CAROLINA = { id: 13, nombre: 'Carolina', email: 'soporte@nexara.com.mx', avatarUrl: null, puesto: null, managerId: 7 };

function tablero(sesiones: unknown[], checadas: unknown[] = []) {
  const act = {
    id: 5,
    anNumber: 'AN-0005',
    titulo: 'Obra de varios días',
    estatus: 'En Proceso',
    prioridad: 'MEDIA',
    fechaMaxima: null,
    fechaEntregaEsperada: null,
    projectId: null,
    clientId: null,
    responsableId: 13,
    fechaAsignacion: M('14', '08:00'),
    fechaInicio: M('14', '09:00'),
    fechaFinalizacion: null,
    periodoInicio: null,
    periodoFin: null,
    coreKind: 'tarea',
    assignmentCharge: 'ejecucion',
    deletedAt: null,
    assignees: [],
    activityEvidences: [],
  };
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([JEFE, CAROLINA]) },
    activityAssignee: {
      findMany: jest.fn().mockResolvedValue([
        {
          activityId: 5,
          userId: 13,
          rol: 'TECNICO',
          retiradoAt: null,
          horasPlan: null,
          indicaciones: null,
          inicioRealAt: M('14', '09:00'),
          asignadoPor: { id: 7, nombre: 'Luis' },
          activity: act,
        },
      ]),
    },
    activity: { findMany: jest.fn().mockResolvedValue([]) },
    attendance: { findMany: jest.fn().mockResolvedValue(checadas) },
    lunchBreak: { findMany: jest.fn().mockResolvedValue([]) },
    locationTracking: { findMany: jest.fn().mockResolvedValue([]) },
    activityPeerRequest: { count: jest.fn().mockResolvedValue(0) },
    activityWorkSession: {
      findMany: jest.fn(async ({ where }: any) => (where.endedAt === null ? [] : sesiones)),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return new TeamBoardService(prisma as never);
}

describe('Mi equipo: la tarjeta con sesiones', () => {
  beforeEach(() => jest.useFakeTimers({ now: AHORA }));
  afterEach(() => jest.useRealTimers());

  const viewer = { id: 7, email: JEFE.email, roleKey: 'coord_operaciones' };
  const checadasDeHoy = [
    { userId: 13, type: 'entrada', timestamp: M('17', '09:00'), workDate: new Date('2026-09-17T00:00:00.000Z') },
  ];

  it('el tiempo de la actividad y las horas productivas salen de sus sesiones', async () => {
    const service = tablero(
      [
        { id: 1, activityId: 5, userId: 13, startedAt: M('14', '09:00'), endedAt: M('14', '18:00'), endReason: 'SALIDA' },
        { id: 2, activityId: 5, userId: 13, startedAt: M('17', '11:00'), endedAt: null },
      ],
      checadasDeHoy,
    );
    const carolina = (await service.getBoard(viewer, 1)).users.find((u) => u.id === 13)!;
    const abierta = carolina.openActivities[0];
    // 9 h del lunes + 2 h de hoy; de corrido serían 76 h.
    expect(abierta).toEqual(expect.objectContaining({ minutosReales: 660, enCurso: true, enPausa: false }));
    // Hoy lleva 4 h de jornada y 2 h con el reloj corriendo: 50 %, no 1 900 %.
    expect(carolina.kpis).toEqual(
      expect.objectContaining({ minutosAsistidos: 240, minutosEnActividad: 120, productividadPct: 50 }),
    );
  });

  it('pausada por su jefe: la tarjeta lo dice y la persona puede recibir otra', async () => {
    const service = tablero(
      [
        {
          id: 1,
          activityId: 5,
          userId: 13,
          startedAt: M('17', '09:00'),
          endedAt: M('17', '10:00'),
          endReason: 'PAUSA',
          endedById: 7,
          endedBy: { id: 7, nombre: 'Luis' },
          nota: 'Atiende la falla urgente del cliente',
        },
      ],
      checadasDeHoy,
    );
    const carolina = (await service.getBoard(viewer, 1)).users.find((u) => u.id === 13)!;
    expect(carolina.openActivities[0]).toEqual(
      expect.objectContaining({
        estatus: 'En Proceso',
        enCurso: false,
        enPausa: true,
        pausadaPor: { id: 7, nombre: 'Luis' },
        motivoPausa: 'Atiende la falla urgente del cliente',
        minutosReales: 60,
      }),
    );
    expect(carolina.currentActivity).toEqual(expect.objectContaining({ id: 5, enPausa: true }));
  });

  it('el detalle de la persona dice si quien mira puede pausarle (mismo alcance que asignar)', async () => {
    const service = tablero([{ id: 2, activityId: 5, userId: 13, startedAt: M('17', '11:00'), endedAt: null }]);
    expect((await service.getBoardUser(viewer, 1, 13)).puedePausar).toBe(true);
    // Y se decide con el padrón de ESTA empresa, no con los usuarios activos de todos los tenants.
    expect((service as any).prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, companyMemberships: { some: { companyId: 1 } } }),
        select: { id: true, email: true, managerId: true },
      }),
    );
    // Uno mismo no se «pausa como jefe».
    expect((await service.getBoardUser({ id: 13, email: CAROLINA.email, roleKey: 'ingeniero' }, 1, 13)).puedePausar).toBe(
      false,
    );
  });
});

describe('mensaje del tope', () => {
  it('es el que pidió el dueño', () => {
    expect(MENSAJE_TOPE_12H).toBe(
      'Una actividad no puede durar más de 12 horas. Si lleva más días, se reanuda cada día.',
    );
  });
});
