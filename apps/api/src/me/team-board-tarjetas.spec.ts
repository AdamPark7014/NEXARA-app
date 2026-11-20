import { TeamBoardService } from './team-board.service';

/**
 * Mi equipo: la tarjeta lista lo asignado a esa persona (responsable, equipo,
 * autoasignada o de otro departamento), con folio. Una cerrada no ocupa el lugar
 * de las pendientes.
 */
const AHORA = new Date('2026-09-28T18:00:00.000Z');

const LUIS = {
  id: 7,
  nombre: 'Luis Joel Aguilar Castillo',
  email: 'direccion.operaciones@nexara.com.mx',
  avatarUrl: null,
  puesto: 'Coordinador de servicios',
  managerId: 1,
};
const CAROLINA = {
  id: 13,
  nombre: 'Carolina',
  email: 'soporte@nexara.com.mx',
  avatarUrl: null,
  puesto: 'Ingeniero de soporte',
  managerId: 7,
};

function actividad(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    anNumber: 'AN-0001',
    titulo: 'Actualizar archivo SLA',
    estatus: 'Pendiente',
    prioridad: 'MEDIA',
    fechaMaxima: new Date('2026-09-27T18:00:00.000Z'),
    projectId: null,
    clientId: null,
    responsableId: 7,
    fechaAsignacion: new Date('2026-09-20T15:00:00.000Z'),
    fechaInicio: new Date('2026-09-20T15:00:00.000Z'),
    fechaFinalizacion: null,
    periodoInicio: null,
    periodoFin: null,
    coreKind: 'tarea',
    assignmentCharge: 'ejecucion',
    deletedAt: null,
    assignees: [],
    activityEvidences: [],
    ...over,
  };
}

function fila(act: ReturnType<typeof actividad>, over: Record<string, unknown> = {}) {
  return {
    userId: act.responsableId,
    rol: 'LEAD',
    retiradoAt: null,
    horasPlan: null,
    indicaciones: null,
    asignadoPor: { id: 7, nombre: 'Luis' },
    activity: act,
    ...over,
  };
}

function build(filas: unknown[], huerfanas: unknown[] = [], asistencias: unknown[] = []) {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([LUIS, CAROLINA, {
      ...CAROLINA, id: 69, nombre: 'Tere', email: 'tere.garcia@nexara.com.mx', roleKey: 'rh',
    }]) },
    activityAssignee: { findMany: jest.fn().mockResolvedValue(filas) },
    activity: { findMany: jest.fn().mockResolvedValue(huerfanas) },
    attendance: { findMany: jest.fn().mockResolvedValue(asistencias) },
    lunchBreak: { findMany: jest.fn().mockResolvedValue([]) },
    locationTracking: { findMany: jest.fn().mockResolvedValue([]) },
    activityPeerRequest: { count: jest.fn().mockResolvedValue(0) },
  };
  return new TeamBoardService(prisma as never);
}

describe('tarjetas de Mi equipo', () => {
  beforeEach(() => jest.useFakeTimers({ now: AHORA }));
  afterEach(() => jest.useRealTimers());

  it('lista folio y título de lo asignado, también si no es un servicio, y omite la cerrada', async () => {
    const sla = actividad({ id: 1, anNumber: 'AN-0001', titulo: 'Actualizar archivo SLA' });
    const visita = actividad({
      id: 2,
      anNumber: 'AN-0002',
      titulo: 'Visita de otro departamento',
      estatus: 'En Proceso',
      coreKind: 'servicio',
      fechaMaxima: new Date('2026-10-02T18:00:00.000Z'),
    });
    const cerrada = actividad({
      id: 3,
      anNumber: 'AN-0003',
      titulo: 'Ya se cerró',
      estatus: 'Finalizada',
      fechaFinalizacion: new Date('2026-09-28T16:00:00.000Z'),
    });
    const service = build([
      fila(sla),
      fila(visita, { inicioRealAt: new Date('2026-09-28T15:00:00.000Z') }),
      fila(cerrada),
      fila(visita, { userId: 13, rol: 'TECNICO' }),
    ]);

    const board = await service.getBoard(
      { id: 7, email: LUIS.email, roleKey: 'coord_operaciones' },
      1,
    );
    const luis = board.users.find((u) => u.id === 7)!;
    expect(board.users.map((u) => u.id)).not.toContain(69);
    expect(luis.openActivities.map((a) => a.anNumber)).toEqual(['AN-0001', 'AN-0002']);
    expect(luis.openActivities[0]).toEqual(
      expect.objectContaining({ titulo: 'Actualizar archivo SLA', atrasada: true, estatus: 'Pendiente' }),
    );
    expect(luis.openActivities[1]).toEqual(
      expect.objectContaining({ titulo: 'Visita de otro departamento', atrasada: false }),
    );
    expect(luis.openActivities.map((a) => a.anNumber)).not.toContain('AN-0003');

    const carolina = board.users.find((u) => u.id === 13)!;
    expect(carolina.openActivities.map((a) => a.anNumber)).toEqual(['AN-0002']);
  });

  it('el responsable sin fila de equipo igual sale en su tarjeta', async () => {
    const suelta = actividad({
      id: 4,
      anNumber: 'AN-0004',
      titulo: 'Preventivo sin fila',
      responsableId: 13,
      coreKind: 'tarea',
      creador: { id: 8, nombre: 'David' },
      assignees: [],
    });
    const service = build([], [suelta]);
    const board = await service.getBoard(
      { id: 7, email: LUIS.email, roleKey: 'coord_operaciones' },
      1,
    );
    const carolina = board.users.find((u) => u.id === 13)!;
    expect(carolina.openActivities.map((a) => ({ folio: a.anNumber, titulo: a.titulo }))).toEqual([
      { folio: 'AN-0004', titulo: 'Preventivo sin fila' },
    ]);
  });

  describe('Libre y Última solo con entregas de hoy', () => {
    const entrada = (iso: string) => ({ userId: 13, type: 'entrada', timestamp: new Date(iso), workDate: null });
    const salida = (iso: string) => ({ userId: 13, type: 'salida', timestamp: new Date(iso), workDate: null });

    async function carolinaCierreAdmin(hace: number, asistencias: unknown[] = []) {
      const cerrada = actividad({
        id: 5,
        anNumber: 'AN-0005',
        titulo: 'Ya terminó',
        responsableId: 13,
        estatus: 'Finalizada',
        fechaMaxima: new Date('2026-09-28T20:00:00.000Z'),
        fechaFinalizacion: new Date(AHORA.getTime() - hace * 60_000),
        // Sin evidencia COMPLETED: cierre administrativo / por dirección.
        activityEvidences: [],
      });
      const service = build([fila(cerrada, { userId: 13, rol: 'TECNICO' })], [], asistencias);
      const board = await service.getBoard(
        { id: 7, email: LUIS.email, roleKey: 'coord_operaciones' },
        1,
      );
      return board.users.find((u) => u.id === 13)!;
    }

    async function carolinaEntrego(hace: number, asistencias: unknown[] = []) {
      const fin = new Date(AHORA.getTime() - hace * 60_000);
      const cerrada = actividad({
        id: 5,
        anNumber: 'AN-0005',
        titulo: 'Ya terminó',
        responsableId: 13,
        estatus: 'Finalizada',
        fechaMaxima: new Date('2026-09-28T20:00:00.000Z'),
        fechaFinalizacion: fin,
        activityEvidences: [
          { userId: 13, status: 'COMPLETED', completedAt: fin, reviewStatus: 'APPROVED' },
        ],
      });
      const service = build(
        [fila(cerrada, { userId: 13, rol: 'TECNICO', finRealAt: fin })],
        [],
        asistencias,
      );
      const board = await service.getBoard(
        { id: 7, email: LUIS.email, roleKey: 'coord_operaciones' },
        1,
      );
      return board.users.find((u) => u.id === 13)!;
    }

    it('cierre administrativo hoy (sin entrega): sin nada asignado, no libre ni Última', async () => {
      const carolina = await carolinaCierreAdmin(10);
      expect(carolina.status).toBe('sin_actividad');
      expect(carolina.lastFinished).toBeNull();
    });

    it('entregó hace 10 min y no tiene más: libre, con lo que entregó', async () => {
      const carolina = await carolinaEntrego(10);
      expect(carolina.status).toBe('libre');
      expect(carolina.lastFinished).toEqual(expect.objectContaining({ anNumber: 'AN-0005' }));
    });

    it('entregó hace 30 min y no tiene más: sigue libre (es de hoy)', async () => {
      const carolina = await carolinaEntrego(30);
      expect(carolina.status).toBe('libre');
      expect(carolina.lastFinished).toEqual(expect.objectContaining({ anNumber: 'AN-0005', lateMinutes: 0 }));
    });

    it('hoy le cerraron una de hace dos días sin entrega suya: sin nada asignado', async () => {
      const haceDosDias = new Date('2026-09-26T18:00:00.000Z');
      const vieja = actividad({
        id: 58,
        anNumber: 'AN-0582',
        titulo: 'Revisión cámaras Guardería',
        responsableId: 13,
        estatus: 'Finalizada',
        fechaAsignacion: haceDosDias,
        fechaInicio: haceDosDias,
        fechaMaxima: new Date('2026-09-27T18:00:00.000Z'),
        fechaFinalizacion: AHORA, // la cerró dirección hoy
        activityEvidences: [],
      });
      const service = build([fila(vieja, { userId: 13, rol: 'TECNICO' })]);
      const board = await service.getBoard(
        { id: 7, email: LUIS.email, roleKey: 'coord_operaciones' },
        1,
      );
      const carolina = board.users.find((u) => u.id === 13)!;
      expect(carolina.status).toBe('sin_actividad');
      expect(carolina.lastFinished).toBeNull();
    });

    it('entró y solo tiene cierre admin: sin nada desde que llegó', async () => {
      const carolina = await carolinaCierreAdmin(30, [entrada('2026-09-28T16:00:00.000Z')]);
      expect(carolina.status).toBe('sin_actividad');
      expect(carolina.entradaHoyAt).toEqual(new Date('2026-09-28T16:00:00.000Z'));
      expect(carolina.idleSinceAt).toEqual(new Date('2026-09-28T16:00:00.000Z'));
    });

    it('ya salió tras cierre admin: se fue, sin idle', async () => {
      const carolina = await carolinaCierreAdmin(180, [
        entrada('2026-09-28T16:00:00.000Z'),
        salida('2026-09-28T17:30:00.000Z'),
      ]);
      expect(carolina.salidaHoyAt).toEqual(new Date('2026-09-28T17:30:00.000Z'));
      expect(carolina.idleSinceAt).toBeNull();
    });
  });

  it('periodo vigente (AN-0639): no atrasada ni status atrasado', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-20T20:00:00.000Z') });
    const migracion = actividad({
      id: 639,
      anNumber: 'AN-0639',
      titulo: 'Migración de Site en instalaciones de CDMX',
      responsableId: 13,
      estatus: 'Pendiente',
      fechaAsignacion: new Date('2026-11-19T15:00:00.000Z'),
      fechaInicio: new Date('2026-11-19T16:00:00.000Z'),
      fechaMaxima: new Date('2026-11-24T05:59:59.999Z'),
      periodoInicio: new Date('2026-11-19T06:00:00.000Z'),
      periodoFin: new Date('2026-11-23T06:00:00.000Z'),
      tiempoEstimadoMin: 60,
    });
    const service = build([fila(migracion, { userId: 13, rol: 'TECNICO' })]);
    const board = await service.getBoard({ id: 7, email: LUIS.email, roleKey: 'coord_operaciones' }, 1);
    const carolina = board.users.find((u) => u.id === 13)!;
    expect(carolina.openActivities[0]).toEqual(
      expect.objectContaining({ anNumber: 'AN-0639', atrasada: false, semaforo: 'verde' }),
    );
    expect(carolina.status).not.toBe('atrasado');
    jest.useFakeTimers({ now: AHORA });
  });

  it('varias abiertas: si una está atrasada, la persona es atrasado (Israel)', async () => {
    const atrasada = actividad({
      id: 668,
      anNumber: 'AN-0668',
      titulo: 'Levantamiento CCTV',
      responsableId: 13,
      estatus: 'Pendiente',
      fechaInicio: new Date('2026-09-28T12:00:00.000Z'),
      fechaMaxima: new Date('2026-09-28T12:00:00.000Z'),
      fechaAsignacion: new Date('2026-09-28T11:00:00.000Z'),
    });
    const enCurso = actividad({
      id: 637,
      anNumber: 'AN-0637',
      titulo: 'Otra en curso',
      responsableId: 13,
      estatus: 'En Proceso',
      fechaInicio: new Date('2026-09-28T15:00:00.000Z'),
      fechaMaxima: new Date('2026-09-28T22:00:00.000Z'),
      fechaAsignacion: new Date('2026-09-28T14:00:00.000Z'),
    });
    const service = build([
      fila(atrasada, { userId: 13, rol: 'TECNICO' }),
      fila(enCurso, {
        userId: 13,
        rol: 'TECNICO',
        inicioRealAt: new Date('2026-09-28T15:30:00.000Z'),
      }),
    ]);
    const board = await service.getBoard({ id: 7, email: LUIS.email, roleKey: 'coord_operaciones' }, 1);
    const carolina = board.users.find((u) => u.id === 13)!;
    expect(carolina.openActivities.some((a) => a.atrasada)).toBe(true);
    expect(carolina.status).toBe('atrasado');
    expect(carolina.currentActivity?.anNumber).toBe('AN-0668');
  });

  it('atrasado dice por qué: no la ha iniciado y ya pasó su hora', async () => {
    const sinIniciar = actividad({
      id: 6,
      anNumber: 'AN-0006',
      titulo: 'Revisar NVR',
      responsableId: 13,
      // Citada a las 09:00 de México de hoy; son las 12:00 y no la ha iniciado.
      fechaInicio: new Date('2026-09-28T15:00:00.000Z'),
      fechaMaxima: new Date('2026-09-28T15:00:00.000Z'),
      fechaAsignacion: new Date('2026-09-28T14:00:00.000Z'),
    });
    const service = build([fila(sinIniciar, { userId: 13, rol: 'TECNICO' })]);
    const board = await service.getBoard({ id: 7, email: LUIS.email, roleKey: 'coord_operaciones' }, 1);
    const carolina = board.users.find((u) => u.id === 13)!;
    expect(carolina.status).toBe('atrasado');
    expect(carolina.currentLateReason).toBe('inicio');
    expect(carolina.currentLateMinutes).toBe(180);
  });
});
