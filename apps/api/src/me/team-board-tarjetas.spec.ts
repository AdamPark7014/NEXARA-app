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
    user: { findMany: jest.fn().mockResolvedValue([LUIS, CAROLINA]) },
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

  describe('«libre» dura 15 minutos después de terminar', () => {
    async function carolinaQueTermino(hace: number, asistencias: unknown[] = []) {
      const cerrada = actividad({
        id: 5,
        anNumber: 'AN-0005',
        titulo: 'Ya terminó',
        responsableId: 13,
        estatus: 'Finalizada',
        fechaMaxima: new Date('2026-09-28T20:00:00.000Z'),
        fechaFinalizacion: new Date(AHORA.getTime() - hace * 60_000),
      });
      const service = build([fila(cerrada, { userId: 13, rol: 'TECNICO' })], [], asistencias);
      const board = await service.getBoard(
        { id: 7, email: LUIS.email, roleKey: 'coord_operaciones' },
        1,
      );
      return board.users.find((u) => u.id === 13)!;
    }

    it('terminó hace 10 min: libre, con lo que terminó', async () => {
      const carolina = await carolinaQueTermino(10);
      expect(carolina.status).toBe('libre');
      expect(carolina.lastFinished).toEqual(expect.objectContaining({ anNumber: 'AN-0005' }));
    });

    it('terminó hace 30 min: sin nada asignado, y se sabe qué fue lo último', async () => {
      const carolina = await carolinaQueTermino(30);
      expect(carolina.status).toBe('sin_actividad');
      expect(carolina.lastFinished).toEqual(expect.objectContaining({ anNumber: 'AN-0005', lateMinutes: 0 }));
      // Hoy no checó: no hay «desde cuándo está sin nada» en la oficina.
      expect(carolina.entradaHoyAt).toBeNull();
      expect(carolina.idleSinceAt).toBeNull();
    });

    // AHORA = 12:00 en México. Carolina entró 10:00 (16:00 UTC).
    const entrada = (iso: string) => ({ userId: 13, type: 'entrada', timestamp: new Date(iso), workDate: null });
    const salida = (iso: string) => ({ userId: 13, type: 'salida', timestamp: new Date(iso), workDate: null });

    it('entró y terminó después: sin nada desde que terminó', async () => {
      const carolina = await carolinaQueTermino(30, [entrada('2026-09-28T16:00:00.000Z')]);
      expect(carolina.status).toBe('sin_actividad');
      expect(carolina.entradaHoyAt).toEqual(new Date('2026-09-28T16:00:00.000Z'));
      expect(carolina.salidaHoyAt).toBeNull();
      expect(carolina.idleSinceAt).toEqual(new Date(AHORA.getTime() - 30 * 60_000));
    });

    it('lo último lo terminó antes de entrar: sin nada desde que llegó', async () => {
      const carolina = await carolinaQueTermino(180, [entrada('2026-09-28T16:00:00.000Z')]);
      expect(carolina.idleSinceAt).toEqual(new Date('2026-09-28T16:00:00.000Z'));
      expect(carolina.lastFinished).toEqual(expect.objectContaining({ anNumber: 'AN-0005' }));
    });

    it('ya salió: no está «sin nada», se fue', async () => {
      const carolina = await carolinaQueTermino(180, [
        entrada('2026-09-28T16:00:00.000Z'),
        salida('2026-09-28T17:30:00.000Z'),
      ]);
      expect(carolina.salidaHoyAt).toEqual(new Date('2026-09-28T17:30:00.000Z'));
      expect(carolina.idleSinceAt).toBeNull();
    });
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
