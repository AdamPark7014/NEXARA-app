import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { TiemposActividadService } from './tiempos-actividad.service';

/**
 * Adam (29-10-2026): ninguna actividad sin tiempo ni entrega; la autoasignación es fija desde el
 * título; el tiempo, la complejidad y la entrega solo los ajusta un superior de quien la ejecuta.
 */
const JEFE = 1;
const ANA = 2;
const OTRO = 3;

function build(prev: Record<string, unknown>, opciones: { complejidad?: unknown } = {}) {
  const create = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 9, anNumber: 'AN-0009', estatus: 'Pendiente', responsable: { id: ANA, nombre: 'Ana' }, creador: { nombre: 'Ana' }, ...args.data }),
  );
  const update = jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 5, companyId: 1, ...prev, ...args.data }));
  const findFirst = jest.fn((args: { select?: Record<string, unknown> }) =>
    // `loadActivityChain` pide el equipo; `update` pide los campos de antes.
    Promise.resolve(args.select && 'assignees' in args.select ? { ...prev, id: 5, companyId: 1, assignees: [] } : { ...prev, companyId: 1 }),
  );
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ anNumber: 'AN-0008' }]),
    activity: { create, update, findFirst },
    user: {
      findUnique: jest.fn().mockResolvedValue({ isActive: true, nombre: 'Ana' }),
      // Ana reporta al jefe; el otro no está en su cadena.
      findMany: jest.fn().mockResolvedValue([
        { id: JEFE, managerId: null, nombre: 'Jefe' },
        { id: ANA, managerId: JEFE, nombre: 'Ana' },
        { id: OTRO, managerId: null, nombre: 'Otro' },
      ]),
    },
    activityAssignee: { upsert: jest.fn().mockResolvedValue({}) },
    activityEvidence: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const avisos = { notifyActivityAssigned: jest.fn().mockResolvedValue(undefined) };
  const eventos = { publishEntityLifecycle: jest.fn() };
  const complejidad = {
    sugerir: jest.fn().mockResolvedValue({ sugerencia: opciones.complejidad ?? { complejidad: 'BASICA', motivo: 'x', cantidad: 3, destino: null } }),
    tiempos: jest.fn().mockResolvedValue({ total: { muestras: 0, medianaMin: null } }),
  };
  const tiempos = new TiemposActividadService(complejidad as never);
  const service = new ActivitiesService(prisma as never, avisos as never, eventos as never, undefined, tiempos);
  return { service, create, update, complejidad };
}

describe('tiempo y entrega en el alta y en la edición', () => {
  afterEach(() => jest.useRealTimers());

  it('autoasignación: lo que manda el cliente no cuenta; sale del título', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-29T16:00:00Z') });
    const { service, create, complejidad } = build({});
    await service.create(
      {
        titulo: 'Instalar 3 cámaras en recepción',
        coreKind: 'tarea',
        ticketTypeCustom: 'Instalación',
        creadoPorId: ANA,
        responsableId: ANA,
        tiempoEstimadoMin: 600,
        tiempoEstandarMin: 600,
        complejidad: 'CRITICA',
        fechaInicio: '2026-10-29T16:00:00.000Z',
        fechaEntregaEsperada: '2026-10-30T00:00:00.000Z',
      } as never,
      1,
    );
    expect(complejidad.sugerir).toHaveBeenCalledWith(1, expect.objectContaining({ titulo: 'Instalar 3 cámaras en recepción', tipo: 'Instalación' }));
    const data = create.mock.calls[0][0].data;
    // 30 de base + 3 dispositivos × 45.
    expect(data).toMatchObject({ tiempoEstimadoMin: 165, tiempoEstandarMin: 165, complejidad: 'BASICA', unidades: { clave: 'dispositivos', cantidad: 3 } });
    // 10:00 + 2 h 45 min.
    expect(data.fechaEntregaEsperada).toBe('2026-10-29T18:45:00.000Z');
    expect(data.fechaMaxima).toBe('2026-10-29T18:45:00.000Z');
  });

  it('asignada a otro sin tiempo ni entrega: la API los pone (nada indefinido)', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-29T16:00:00Z') });
    const { service, create } = build({}, { complejidad: null });
    await service.create({ titulo: 'Levantar pedido', coreKind: 'tarea', ticketTypeCustom: 'Apoyo', creadoPorId: JEFE, responsableId: ANA } as never, 1);
    const data = create.mock.calls[0][0].data;
    expect(data.tiempoEstimadoMin).toBe(60);
    expect(data.tiempoEstandarMin).toBe(60);
    expect(data.fechaEntregaEsperada).toBe('2026-10-29T17:00:00.000Z');
  });

  it('el estándar distinto al tiempo sin motivo no se guarda', async () => {
    const { service } = build({});
    await expect(
      service.create(
        { titulo: 'Cotizar', coreKind: 'comercial', creadoPorId: JEFE, responsableId: ANA, tiempoEstandarMin: 60, tiempoEstimadoMin: 120 } as never,
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  const asignada = {
    estatus: 'Pendiente',
    responsableId: ANA,
    creadoPorId: JEFE,
    titulo: 'Cotizar',
    tiempoEstimadoMin: 60,
    tiempoEstandarMin: 60,
    fechaInicio: new Date('2026-10-29T16:00:00Z'),
    fechaMaxima: new Date('2026-10-29T17:00:00Z'),
    fechaEntregaEsperada: new Date('2026-10-29T17:00:00Z'),
  };

  it('el superior de quien la ejecuta sí ajusta tiempo y entrega (con motivo)', async () => {
    const { service, update } = build(asignada);
    await service.update(5, { tiempoEstimadoMin: 90, estandarCambiadoMotivo: 'Tiene que esperar al cliente' } as never, { id: JEFE }, 1);
    expect(update.mock.calls[0][0].data).toMatchObject({ tiempoEstimadoMin: 90 });
    await expect(service.update(5, { tiempoEstimadoMin: 90 } as never, { id: JEFE }, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('quien la ejecuta o alguien fuera de su cadena no los cambia', async () => {
    const { service, update } = build(asignada);
    await expect(service.update(5, { tiempoEstimadoMin: 30, estandarCambiadoMotivo: 'Ya casi' } as never, { id: ANA }, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.update(5, { fechaEntregaEsperada: '2026-10-30T00:00:00.000Z' } as never, { id: OTRO }, 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('autoasignada: quien la creó no la ajusta; su jefe sí', async () => {
    const auto = { ...asignada, creadoPorId: ANA };
    const { service, update } = build(auto);
    await expect(service.update(5, { complejidad: 'CRITICA' } as never, { id: ANA }, 1)).rejects.toThrow(/la fija el sistema|lo fija el sistema|fija el sistema/);
    await service.update(5, { complejidad: 'COMPLEJA' } as never, { id: JEFE }, 1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('editar otra cosa (o reenviar lo mismo) no pide ser superior', async () => {
    const { service, update } = build({ ...asignada, creadoPorId: ANA });
    await service.update(
      5,
      { indicaciones: 'Llevar escalera', tiempoEstimadoMin: 60, fechaEntregaEsperada: '2026-10-29T17:00:00.000Z' } as never,
      { id: ANA },
      1,
    );
    expect(update).toHaveBeenCalledTimes(1);
  });
});
