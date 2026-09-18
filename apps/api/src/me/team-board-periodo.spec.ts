import { TeamBoardService } from './team-board.service';

/**
 * Una obra de diez días (16–25 sep) sigue en la pizarra cada día hasta terminarse y no sale
 * «Atrasado» antes de su fin; la etapa siguiente (21–30 sep) no aparece antes de empezar.
 */
const AHORA = new Date('2026-09-18T18:00:00.000Z'); // viernes 18, 12:00 en México
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function actividad(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    anNumber: `AN-00${id}`,
    titulo: `Actividad ${id}`,
    estatus: 'En Proceso',
    prioridad: 'MEDIA',
    // Como la dejaba el formulario viejo: la fecha máxima a la hora citada del primer día.
    fechaMaxima: new Date('2026-09-16T15:00:00.000Z'),
    projectId: 7,
    clientId: 11,
    responsableId: 10,
    fechaAsignacion: new Date('2026-09-15T17:00:00.000Z'),
    fechaInicio: new Date('2026-09-16T15:00:00.000Z'),
    fechaFinalizacion: null,
    periodoInicio: dia('2026-09-16'),
    periodoFin: dia('2026-09-25'),
    coreKind: 'proyecto',
    assignmentCharge: 'ejecucion',
    deletedAt: null,
    assignees: [],
    activityEvidences: [
      {
        userId: 10,
        status: 'EVIDENCE_PHOTOS',
        completedAt: null,
        reviewStatus: null,
        entryPhotoUploadedAt: new Date('2026-09-16T15:10:00.000Z'),
        exitPhotoUploadedAt: null,
      },
    ],
    ...over,
  };
}

function fila(act: ReturnType<typeof actividad>) {
  return {
    userId: 10,
    rol: 'LEAD',
    retiradoAt: null,
    horasPlan: '2',
    indicaciones: null,
    asignadoAt: act.fechaAsignacion,
    asignadoPor: { id: 1, nombre: 'David' },
    inicioRealAt: act.id === 1 ? new Date('2026-09-16T15:10:00.000Z') : null,
    activity: act,
  };
}

function build(filas: unknown[]) {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 1, nombre: 'David', email: 'jefe.obra@ejemplo.mx', avatarUrl: null, puesto: null, managerId: null },
        { id: 10, nombre: 'Joan', email: 'joan@ejemplo.mx', avatarUrl: null, puesto: 'Instalador', managerId: 1 },
      ]),
    },
    activityAssignee: { findMany: jest.fn().mockResolvedValue(filas) },
    attendance: { findMany: jest.fn().mockResolvedValue([]) },
    lunchBreak: { findMany: jest.fn().mockResolvedValue([]) },
    locationTracking: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return new TeamBoardService(prisma as never);
}

const viewer = { id: 1, isSuperAdmin: true, email: 'jefe.obra@ejemplo.mx' };

describe('pizarra con actividades de varios días', () => {
  beforeEach(() => jest.useFakeTimers({ now: AHORA }));
  afterEach(() => jest.useRealTimers());

  const obra = actividad(1);
  const siguienteEtapa = actividad(2, {
    estatus: 'Pendiente',
    periodoInicio: dia('2026-09-21'),
    periodoFin: dia('2026-09-30'),
    fechaAsignacion: new Date('2026-09-18T16:00:00.000Z'),
    fechaInicio: new Date('2026-09-21T15:00:00.000Z'),
    fechaMaxima: new Date('2026-10-01T05:59:59.999Z'),
    activityEvidences: [],
  });

  it('hoy: la obra sale con «Día 3 de 10» y activo; la etapa que empieza el lunes no', async () => {
    const service = build([fila(obra), fila(siguienteEtapa)]);
    const board = await service.getBoard(viewer, 1);
    const joan = board.users.find((u) => u.id === 10)!;
    expect(joan.openActivities.map((a) => a.id)).toEqual([1]);
    expect(joan.openActivities[0].periodo?.etiqueta).toBe('Día 3 de 10 · termina vie 25 sep');
    expect(joan.openActivities[0].semaforo).toBe('verde');
    expect(joan.openActivities[0].excedida).toBe(false);
    expect(joan.status).toBe('activo');
    expect(joan.currentLateMinutes).toBeNull();
    expect(joan.currentActivity?.periodo?.dia).toBe(3);
  });

  it('el lunes 21 salen las dos, sin que nadie las vuelva a cargar', async () => {
    const service = build([fila(obra), fila(siguienteEtapa)]);
    const rango = service.resolveRange('2026-09-21', '2026-09-21', AHORA);
    const board = await service.getBoard(viewer, 1, rango);
    const joan = board.users.find((u) => u.id === 10)!;
    expect(joan.openActivities.map((a) => a.id).sort()).toEqual([1, 2]);
  });

  it('pasado su último día y sin cerrar, sí es atrasado', async () => {
    jest.setSystemTime(new Date('2026-09-27T18:00:00.000Z'));
    const service = build([fila(obra)]);
    const board = await service.getBoard(viewer, 1);
    const joan = board.users.find((u) => u.id === 10)!;
    expect(joan.status).toBe('atrasado');
    expect(joan.openActivities[0].periodo?.etiqueta).toBe('Terminaba vie 25 sep · 2 días de atraso');
    expect(joan.openActivities[0].semaforo).toBe('rojo');
  });
});
