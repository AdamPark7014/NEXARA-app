import { TeamBoardService } from './team-board.service';

/**
 * El detalle de un balde del pipeline (`getWorkflowActivities`) tiene que listar exactamente las
 * actividades que `buildWorkflowPipeline` ya contó — si no, el número de la franja y lo que se ve
 * al dar clic se desacoplan.
 */
const AHORA = new Date('2026-09-30T18:00:00.000Z');

function actividad(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    anNumber: `AN-00${id}`,
    titulo: `Actividad ${id}`,
    estatus: 'En Proceso',
    fechaMaxima: new Date('2026-09-29T15:00:00.000Z'),
    fechaAsignacion: new Date('2026-09-28T15:00:00.000Z'),
    fechaFinalizacion: null,
    periodoFin: null,
    cancelledAt: null,
    activityEvidences: [],
    ...over,
  };
}

function fila(userId: number, act: ReturnType<typeof actividad>, inicioRealAt: Date | null = null) {
  return { userId, inicioRealAt, activity: act };
}

function build(filas: unknown[], rechazos: unknown[] = []) {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 1, nombre: 'David', email: 'jefe.obra@ejemplo.mx', avatarUrl: null, puesto: null, managerId: null },
        { id: 10, nombre: 'Joan', email: 'joan@ejemplo.mx', avatarUrl: null, puesto: 'Instalador', managerId: 1 },
      ]),
    },
    activityAssignee: { findMany: jest.fn().mockResolvedValue(filas) },
    activityPeerRequest: { findMany: jest.fn().mockResolvedValue(rechazos), count: jest.fn().mockResolvedValue(rechazos.length) },
  };
  return new TeamBoardService(prisma as never);
}

const viewer = { id: 1, isSuperAdmin: true, email: 'jefe.obra@ejemplo.mx' };

describe('detalle de un balde del pipeline', () => {
  beforeEach(() => jest.useFakeTimers({ now: AHORA }));
  afterEach(() => jest.useRealTimers());

  it('«cerradas» lista solo la actividad cerrada, con quién y su título', async () => {
    const cerrada = actividad(1, { estatus: 'Finalizada', fechaFinalizacion: new Date('2026-09-29T14:00:00.000Z') });
    const abierta = actividad(2, { estatus: 'En Proceso' });
    const service = build([fila(10, cerrada), fila(10, abierta)]);
    const rango = service.resolveRange('2026-09-28', '2026-09-30', AHORA);
    const res = await service.getWorkflowActivities(viewer, 1, 'closed', rango);
    expect(res.bucket).toBe('closed');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.anNumber).toBe('AN-001');
    expect(res.items[0]!.titulo).toBe('Actividad 1');
    expect(res.items[0]!.persona?.nombre).toBe('Joan');
  });

  it('«iniciadas» incluye la cerrada y la que ya arrancó, no la que sigue pendiente', async () => {
    const cerrada = actividad(1, { estatus: 'Finalizada', fechaFinalizacion: new Date('2026-09-29T14:00:00.000Z') });
    const enProceso = actividad(2, { estatus: 'En Proceso' }, );
    const pendiente = actividad(3, { estatus: 'Pendiente' });
    const service = build([fila(10, cerrada), fila(10, enProceso, new Date('2026-09-28T16:00:00.000Z')), fila(10, pendiente)]);
    const rango = service.resolveRange('2026-09-28', '2026-09-30', AHORA);
    const res = await service.getWorkflowActivities(viewer, 1, 'started', rango);
    expect(res.items.map((i) => i.id).sort()).toEqual([1, 2]);
  });

  it('«rechazadas entre compañeros» trae de quién a quién y el motivo', async () => {
    const service = build(
      [],
      [
        {
          id: 50,
          activityId: null,
          title: 'Apoyo con la instalación',
          rejectReason: 'Ya tengo otra cita',
          updatedAt: new Date('2026-09-29T12:00:00.000Z'),
          fromUser: { id: 1, nombre: 'David', avatarUrl: null, puesto: null },
          toUser: { id: 10, nombre: 'Joan', avatarUrl: null, puesto: 'Instalador' },
        },
      ],
    );
    const rango = service.resolveRange('2026-09-28', '2026-09-30', AHORA);
    const res = await service.getWorkflowActivities(viewer, 1, 'peerRejected', rango);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.titulo).toBe('Apoyo con la instalación');
    expect(res.items[0]!.detalle).toBe('De David a Joan · Ya tengo otra cita');
  });
});
