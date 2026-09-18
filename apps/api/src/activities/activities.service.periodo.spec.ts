import { BadRequestException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

/** Fin del viernes 25 de septiembre en México (UTC-6). */
const FIN_25 = '2026-09-26T05:59:59.999Z';

function build(prev: Record<string, unknown> | null = null) {
  const create = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 1,
      anNumber: 'AN-0042',
      titulo: 'Instalación',
      estatus: 'Pendiente',
      responsableId: 2,
      creadoPorId: 3,
      assignmentCharge: null,
      responsable: { id: 2, nombre: 'Joan' },
      creador: { nombre: 'David' },
      ...args.data,
    }),
  );
  const update = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 5, anNumber: 'AN-0005', titulo: 'Obra', responsableId: 2, companyId: 1, estatus: 'En Proceso', ...args.data }),
  );
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ anNumber: 'AN-0041' }]),
    activity: { create, update, findFirst: jest.fn().mockResolvedValue(prev) },
    activityAssignee: { upsert: jest.fn().mockResolvedValue({}) },
    activityEvidence: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const avisos = {
    notifyActivityAssigned: jest.fn().mockResolvedValue(undefined),
    notifyActivityStarted: jest.fn().mockResolvedValue(undefined),
    notifyActivityMarkedFinished: jest.fn().mockResolvedValue(undefined),
  };
  const eventos = { publishEntityLifecycle: jest.fn() };
  const service = new ActivitiesService(prisma as never, avisos as never, eventos as never);
  return { service, create, update, avisos };
}

const base = { titulo: 'Instalación', creadoPorId: 3, responsableId: 2 };

describe('crear con periodo', () => {
  it('la fecha máxima y la entrega son el fin del último día; el inicio conserva su hora', async () => {
    const { service, create, avisos } = build();
    await service.create(
      {
        ...base,
        // El formulario manda inicio = entrega = máximo; con periodo, el fin manda.
        fechaInicio: '2026-09-16T16:00:00.000Z',
        fechaMaxima: '2026-09-16T16:00:00.000Z',
        fechaEntregaEsperada: '2026-09-16T16:00:00.000Z',
        periodoInicio: '2026-09-16',
        periodoFin: '2026-09-25',
        projectMilestoneId: 101,
      },
      1,
    );
    const data = create.mock.calls[0][0].data;
    expect(data.periodoInicio).toEqual(new Date('2026-09-16T00:00:00.000Z'));
    expect(data.periodoFin).toEqual(new Date('2026-09-25T00:00:00.000Z'));
    expect((data.fechaMaxima as Date).toISOString()).toBe(FIN_25);
    expect((data.fechaEntregaEsperada as Date).toISOString()).toBe(FIN_25);
    expect((data.fechaInicio as Date).toISOString()).toBe('2026-09-16T16:00:00.000Z');
    expect(data.projectMilestoneId).toBe(101);
    // Folio y aviso siguen saliendo como siempre.
    expect(data.anNumber).toBe('AN-0042');
    expect(avisos.notifyActivityAssigned).toHaveBeenCalled();
  });

  it('sin periodo todo queda como antes', async () => {
    const { service, create } = build();
    await service.create({ ...base, fechaMaxima: '2026-09-16T16:00:00.000Z' }, 1);
    const data = create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('periodoInicio');
    expect(data.fechaMaxima).toBe('2026-09-16T16:00:00.000Z');
  });

  it('con un solo extremo del periodo no se crea', async () => {
    const { service, create } = build();
    await expect(service.create({ ...base, periodoInicio: '2026-09-16' }, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe('editar una actividad con periodo', () => {
  const prev = {
    estatus: 'En Proceso',
    responsableId: 2,
    anNumber: 'AN-0005',
    titulo: 'Obra',
    companyId: 1,
    fechaInicio: new Date('2026-09-16T15:00:00.000Z'),
    fechaMaxima: new Date(FIN_25),
    periodoInicio: new Date('2026-09-16T00:00:00.000Z'),
    periodoFin: new Date('2026-09-25T00:00:00.000Z'),
  };

  beforeEach(() => {
    // Día 5 del periodo: el inicio (día 1) ya quedó fuera de la ventana de «ayer».
    jest.useFakeTimers({ now: new Date('2026-09-20T18:00:00.000Z') });
  });
  afterEach(() => jest.useRealTimers());

  it('el formulario viejo reenvía inicio = máximo: no falla ni la da por tarde', async () => {
    const { service, update } = build(prev);
    await service.update(
      5,
      {
        titulo: 'Obra fase 2',
        fechaInicio: '2026-09-16T15:00:00.000Z',
        fechaMaxima: '2026-09-16T15:00:00.000Z',
        fechaEntregaEsperada: '2026-09-16T15:00:00.000Z',
      },
      { id: 3 },
      1,
    );
    const data = update.mock.calls[0][0].data;
    expect(data.titulo).toBe('Obra fase 2');
    expect((data.fechaMaxima as Date).toISOString()).toBe(FIN_25);
    expect((data.fechaEntregaEsperada as Date).toISOString()).toBe(FIN_25);
  });

  it('mover el periodo recalcula el inicio y el fin', async () => {
    const { service, update } = build(prev);
    await service.update(5, { periodoInicio: '2026-09-21', periodoFin: '2026-09-30' }, { id: 3 }, 1);
    const data = update.mock.calls[0][0].data;
    expect(data.periodoInicio).toEqual(new Date('2026-09-21T00:00:00.000Z'));
    expect(data.fechaInicio).toBe('2026-09-21T15:00:00.000Z');
    expect((data.fechaMaxima as Date).toISOString()).toBe('2026-10-01T05:59:59.999Z');
  });

  it('quitar el periodo lo deja en nulo', async () => {
    const { service, update } = build(prev);
    await service.update(5, { periodoInicio: null, periodoFin: null }, { id: 3 }, 1);
    expect(update.mock.calls[0][0].data).toMatchObject({ periodoInicio: null, periodoFin: null });
  });

  it('sin periodo, un inicio viejo nuevo sigue fuera de la ventana', async () => {
    const { service } = build({ ...prev, periodoInicio: null, periodoFin: null, fechaMaxima: null });
    await expect(
      service.update(5, { fechaInicio: '2026-09-10T15:00:00.000Z' }, { id: 3 }, 1),
    ).rejects.toThrow('fuera de la ventana');
  });
});
