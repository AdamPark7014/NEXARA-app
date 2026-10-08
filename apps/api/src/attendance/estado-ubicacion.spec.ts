import {
  debeRegistrarse,
  estadoPorFalla,
  normalizarEstadoUbicacion,
  registrarEstadoUbicacion,
  tramosSinUbicacion,
} from './estado-ubicacion.js';

/** Hora de México del 08-10-2026 (UTC-6). */
const mx = (hhmm: string, dia = '08') => new Date(`2026-10-${dia}T${hhmm}:00-06:00`);
const DIA = { desde: mx('00:00'), hasta: mx('23:59') };

describe('estado de la ubicación del teléfono (Adam, 08-10)', () => {
  it('normaliza el estado y traduce el diagnóstico de la checada', () => {
    expect(normalizarEstadoUbicacion('apagada')).toBe('APAGADA');
    expect(normalizarEstadoUbicacion('otra')).toBeNull();
    expect(estadoPorFalla('UBICACION_APAGADA')).toBe('APAGADA');
    expect(estadoPorFalla('PERMISO_NEGADO')).toBe('SIN_PERMISO');
    // Sin señal no es «apagada»: el teléfono la tenía prendida.
    expect(estadoPorFalla('SIN_SENAL')).toBeNull();
  });

  it('solo guarda cambios: ENCENDIDA únicamente cierra un tramo abierto', () => {
    const ahora = mx('10:00');
    expect(debeRegistrarse('ENCENDIDA', null, ahora)).toBe(false);
    expect(debeRegistrarse('ENCENDIDA', { estado: 'ENCENDIDA', at: mx('09:00') }, ahora)).toBe(false);
    expect(debeRegistrarse('ENCENDIDA', { estado: 'APAGADA', at: mx('09:00') }, ahora)).toBe(true);
    expect(debeRegistrarse('APAGADA', null, ahora)).toBe(true);
    expect(debeRegistrarse('APAGADA', { estado: 'APAGADA', at: mx('09:00') }, ahora)).toBe(false);
    // El mismo aviso de otro día abre el tramo de hoy.
    expect(debeRegistrarse('APAGADA', { estado: 'APAGADA', at: mx('17:00', '07') }, ahora)).toBe(true);
    expect(debeRegistrarse('SIN_PERMISO', { estado: 'APAGADA', at: mx('09:00') }, ahora)).toBe(true);
  });

  it('arma tramos cerrados con sus minutos', () => {
    const tramos = tramosSinUbicacion(
      [
        { estado: 'APAGADA', at: mx('10:15') },
        { estado: 'ENCENDIDA', at: mx('10:40') },
        { estado: 'SIN_PERMISO', at: mx('12:00') },
        { estado: 'ENCENDIDA', at: mx('12:05') },
      ],
      DIA.desde,
      DIA.hasta,
      mx('18:00'),
    );
    expect(tramos).toEqual([
      { estado: 'APAGADA', desde: mx('10:15').toISOString(), hasta: mx('10:40').toISOString(), minutos: 25 },
      { estado: 'SIN_PERMISO', desde: mx('12:00').toISOString(), hasta: mx('12:05').toISOString(), minutos: 5 },
    ]);
  });

  it('un tramo que sigue abierto cuenta hasta ahora y no tiene fin', () => {
    const [t] = tramosSinUbicacion([{ estado: 'APAGADA', at: mx('10:15') }], DIA.desde, DIA.hasta, mx('11:00'));
    expect(t).toEqual({ estado: 'APAGADA', desde: mx('10:15').toISOString(), hasta: null, minutos: 45 });
  });

  it('si ya venía apagada del día anterior, el tramo empieza al inicio del día', () => {
    const [t] = tramosSinUbicacion(
      [
        { estado: 'APAGADA', at: mx('17:00', '07') },
        { estado: 'ENCENDIDA', at: mx('09:30') },
      ],
      DIA.desde,
      DIA.hasta,
      mx('12:00'),
    );
    expect(t.desde).toBe(DIA.desde.toISOString());
    expect(t.hasta).toBe(mx('09:30').toISOString());
  });

  it('lo que se cerró antes del día no aparece; avisos repetidos no parten el tramo', () => {
    expect(
      tramosSinUbicacion(
        [
          { estado: 'APAGADA', at: mx('17:00', '07') },
          { estado: 'ENCENDIDA', at: mx('18:00', '07') },
        ],
        DIA.desde,
        DIA.hasta,
        mx('12:00'),
      ),
    ).toEqual([]);
    const tramos = tramosSinUbicacion(
      [
        { estado: 'APAGADA', at: mx('10:00') },
        { estado: 'APAGADA', at: mx('10:20') },
        { estado: 'ENCENDIDA', at: mx('10:30') },
      ],
      DIA.desde,
      DIA.hasta,
      mx('12:00'),
    );
    expect(tramos).toHaveLength(1);
    expect(tramos[0].minutos).toBe(30);
  });

  it('registrar: guarda el cambio y nunca lanza', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      locationStatusEvent: {
        findFirst: jest.fn().mockResolvedValue({ estado: 'APAGADA', at: mx('09:00') }),
        create,
      },
    } as any;
    await expect(
      registrarEstadoUbicacion(prisma, { userId: 3, companyId: 1, estado: 'ENCENDIDA', fuente: 'GPS', ahora: mx('09:10') }),
    ).resolves.toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 3, companyId: 1, estado: 'ENCENDIDA', fuente: 'GPS' }),
    });

    const roto = { locationStatusEvent: { findFirst: jest.fn().mockRejectedValue(new Error('sin tabla')) } } as any;
    await expect(
      registrarEstadoUbicacion(roto, { userId: 3, companyId: 1, estado: 'APAGADA', fuente: 'APP' }),
    ).resolves.toBe(false);
  });
});
