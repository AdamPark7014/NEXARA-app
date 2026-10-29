import {
  estadoDeTramo,
  esTipoTrayecto,
  minutosDeTramo,
  modoDe,
  puntoDe,
  TOPE_TRAYECTO_MIN,
  trayectoDto,
  validarInicio,
} from './trayectos';
import { TrayectosService } from './trayectos.service';

const T0 = new Date('2026-10-29T16:00:00Z');
const despues = (min: number) => new Date(T0.getTime() + min * 60_000);

describe('reglas del trayecto', () => {
  it('solo ida o regreso; el modo cae en auto', () => {
    expect(esTipoTrayecto('IDA')).toBe(true);
    expect(esTipoTrayecto('REGRESO')).toBe(true);
    expect(esTipoTrayecto('ida')).toBe(false);
    expect(modoDe('TRANSPORTE')).toBe('TRANSPORTE');
    expect(modoDe('lo que sea')).toBe('AUTO');
    expect(modoDe(undefined, 'TRANSPORTE')).toBe('TRANSPORTE');
  });

  it('un punto válido o nada (sin 0,0 ni fuera de rango)', () => {
    expect(puntoDe(19.04, -98.2)).toEqual({ lat: 19.04, lng: -98.2 });
    expect(puntoDe('19.04', '-98.2')).toEqual({ lat: 19.04, lng: -98.2 });
    expect(puntoDe(0, 0)).toBeNull();
    expect(puntoDe(120, 10)).toBeNull();
    expect(puntoDe(null, 10)).toBeNull();
  });

  it('minutos del tramo: abierto hasta ahora, con tope para el que se dejó corriendo', () => {
    expect(minutosDeTramo(T0, despues(25), despues(90))).toBe(25);
    expect(minutosDeTramo(T0, null, despues(40))).toBe(40);
    expect(minutosDeTramo(T0, null, despues(60 * 24))).toBe(TOPE_TRAYECTO_MIN);
  });

  it('en tiempo hasta la ruta + 25 %; sin estimado o en camino, no se califica', () => {
    // 18 min de ruta + 25 % = 22.5 → 23 min de tolerancia.
    expect(estadoDeTramo(23, 18, true)).toBe('en_tiempo');
    expect(estadoDeTramo(24, 18, true)).toBe('excedido');
    expect(estadoDeTramo(40, null, true)).toBeNull();
    expect(estadoDeTramo(40, 18, false)).toBeNull();
  });

  it('no se empieza otra ida con una abierta', () => {
    expect(validarInicio('IDA', [{ tipo: 'IDA', endedAt: null }])).toContain('Ya vas en camino');
    expect(validarInicio('IDA', [{ tipo: 'IDA', endedAt: T0 }])).toBeNull();
    expect(validarInicio('REGRESO', [{ tipo: 'REGRESO', endedAt: null }])).toBe('Ya vas de regreso.');
    expect(validarInicio('REGRESO', [])).toBeNull();
  });

  it('el DTO trae minutos, estimado y estado', () => {
    const dto = trayectoDto(
      { id: 1, activityId: 9, userId: 3, tipo: 'IDA', modo: 'AUTO', startedAt: T0, endedAt: despues(30), finMotivo: 'INICIO', estimadoMin: 18, estimadoFuente: 'osrm' },
      despues(60),
    );
    expect(dto).toMatchObject({ minutos: 30, estimadoMin: 18, estado: 'excedido', finMotivo: 'INICIO', endedAt: despues(30).toISOString() });
  });
});

describe('TrayectosService', () => {
  function armar(actividad: Record<string, unknown> | null, previos: Array<{ tipo: string; endedAt: Date | null }> = []) {
    const prisma = {
      activity: { findFirst: jest.fn().mockResolvedValue(actividad) },
      activityTrayecto: {
        findMany: jest.fn().mockResolvedValue(previos),
        findFirst: jest.fn(),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 77, endedAt: null, finMotivo: null, ...data })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 77,
          activityId: 9,
          userId: 3,
          tipo: 'IDA',
          modo: 'AUTO',
          startedAt: T0,
          estimadoMin: null,
          estimadoFuente: null,
          ...data,
        })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return { service: new TrayectosService(prisma as never), prisma };
  }
  const act = {
    id: 9,
    companyId: 1,
    estatus: 'En Proceso',
    responsableId: 3,
    creadoPorId: 8,
    destino: null,
    trasladoModo: null,
    assignees: [{ userId: 3 }],
  };

  it('quien la hace inicia la ida; cierra lo que tuviera abierto y sin destino no hay estimado', async () => {
    const { service, prisma } = armar(act);
    const dto = await service.iniciar({ id: 3 }, 1, 9, { tipo: 'IDA', lat: 19.04, lng: -98.2 });
    expect(prisma.activityTrayecto.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 3, endedAt: null }), data: expect.objectContaining({ finMotivo: 'NUEVO' }) }),
    );
    expect(prisma.activityTrayecto.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: 'IDA', modo: 'AUTO', startLat: 19.04, estimadoMin: null }) }),
    );
    expect(dto).toMatchObject({ tipo: 'IDA', estimadoMin: null });
  });

  it('alguien de fuera no registra trayecto; un tipo raro tampoco', async () => {
    await expect(armar(act).service.iniciar({ id: 50 }, 1, 9, { tipo: 'IDA' })).rejects.toThrow('Solo quien la hace');
    await expect(armar(act).service.iniciar({ id: 3 }, 1, 9, { tipo: 'VUELTA' })).rejects.toThrow('ida o el regreso');
    await expect(armar(null).service.iniciar({ id: 3 }, 1, 9, { tipo: 'IDA' })).rejects.toThrow('no encontrada');
  });

  it('no repite una ida abierta', async () => {
    const { service } = armar(act, [{ tipo: 'IDA', endedAt: null }]);
    await expect(service.iniciar({ id: 3 }, 1, 9, { tipo: 'IDA' })).rejects.toThrow('Ya vas en camino');
  });

  it('«Llegué» cierra el tramo abierto con su punto', async () => {
    const { service, prisma } = armar(act);
    prisma.activityTrayecto.findFirst.mockResolvedValue({ id: 77 });
    const dto = await service.terminar({ id: 3 }, 1, 9, { lat: 19.05, lng: -98.21 });
    expect(prisma.activityTrayecto.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 77 }, data: expect.objectContaining({ finMotivo: 'LLEGADA', endLat: 19.05 }) }),
    );
    expect(dto.finMotivo).toBe('LLEGADA');
  });

  it('sin tramo abierto, «Llegué» lo dice', async () => {
    const { service, prisma } = armar(act);
    prisma.activityTrayecto.findFirst.mockResolvedValue(null);
    await expect(service.terminar({ id: 3 }, 1, 9, {})).rejects.toThrow('No tienes un trayecto en curso');
  });

  it('al iniciar la actividad se cierra solo la ida de esa actividad', async () => {
    const { service, prisma } = armar(act);
    await service.cerrarAbiertos({ userId: 3, companyId: null, at: T0, motivo: 'INICIO', activityId: 9, tipo: 'IDA' });
    expect(prisma.activityTrayecto.updateMany).toHaveBeenCalledWith({
      where: { userId: 3, endedAt: null, activityId: 9, tipo: 'IDA' },
      data: { endedAt: T0, finMotivo: 'INICIO' },
    });
  });
});
