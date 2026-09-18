import {
  aceptacionDe,
  cambiosAlIniciar,
  debeAutoAceptar,
  estaExcedida,
  horasPlanValidas,
  minutosPlan,
  minutosReales,
  normalizarPrioridad,
  rangoPrioridad,
  semaforoDe,
  tiemposDto,
} from './actividad-tiempos';

const AHORA = new Date('2026-09-18T18:00:00.000Z');
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000);

describe('prioridad normalizada', () => {
  it('acepta los textos viejos', () => {
    expect(normalizarPrioridad('Alta')).toBe('ALTA');
    expect(normalizarPrioridad('urgente')).toBe('ALTA');
    expect(normalizarPrioridad('P1')).toBe('ALTA');
    expect(normalizarPrioridad(' baja ')).toBe('BAJA');
    expect(normalizarPrioridad('Media')).toBe('MEDIA');
  });

  it('lo desconocido o vacío queda en MEDIA', () => {
    expect(normalizarPrioridad(null)).toBe('MEDIA');
    expect(normalizarPrioridad('')).toBe('MEDIA');
    expect(normalizarPrioridad('cuando se pueda')).toBe('MEDIA');
  });

  it('ordena ALTA antes que MEDIA y BAJA', () => {
    expect(rangoPrioridad('URGENTE')).toBeLessThan(rangoPrioridad(null));
    expect(rangoPrioridad(null)).toBeLessThan(rangoPrioridad('Baja'));
  });
});

describe('minutos planeados y reales', () => {
  it('horasPlan a minutos (Decimal llega como texto)', () => {
    expect(minutosPlan('2.5')).toBe(150);
    expect(minutosPlan(2)).toBe(120);
    expect(minutosPlan(null)).toBeNull();
    expect(minutosPlan(0)).toBeNull();
  });

  it('sin iniciar no hay minutos reales (no es cero)', () => {
    expect(minutosReales(null, null, AHORA)).toBeNull();
  });

  it('en curso cuenta hasta ahora; terminada, hasta el fin real', () => {
    expect(minutosReales(hace(35), null, AHORA)).toBe(35);
    expect(minutosReales(hace(155), hace(20), AHORA)).toBe(135);
  });

  it('excedida solo con plan y tiempo real por encima', () => {
    expect(estaExcedida(120, 155)).toBe(true);
    expect(estaExcedida(120, 120)).toBe(false);
    expect(estaExcedida(null, 500)).toBe(false);
    expect(estaExcedida(120, null)).toBe(false);
  });
});

describe('aceptación', () => {
  it('sin marcas está pendiente', () => {
    expect(aceptacionDe({})).toBe('PENDIENTE');
    expect(aceptacionDe({ aceptadaAt: AHORA })).toBe('ACEPTADA');
    expect(aceptacionDe({ rechazadaAt: AHORA })).toBe('RECHAZADA');
  });

  it('la foto de entrada acepta sola solo si no estaba aceptada', () => {
    expect(debeAutoAceptar({})).toBe(true);
    expect(debeAutoAceptar({ aceptadaAt: hace(60) })).toBe(false);
  });
});

describe('iniciar actividad (el asignado no acepta ni rechaza, solo inicia)', () => {
  it('la primera vez marca el inicio real y vale como aceptación', () => {
    const c = cambiosAlIniciar({}, { ahora: AHORA });
    expect(c.data).toEqual({ aceptadaAt: AHORA, inicioRealAt: AHORA });
    expect(c.recienIniciada).toBe(true);
    expect(c.inicioRealAt).toEqual(AHORA);
  });

  it('tocarlo otra vez no mueve la hora de inicio', () => {
    const c = cambiosAlIniciar({ aceptadaAt: hace(40), inicioRealAt: hace(30) }, { ahora: AHORA });
    expect(c.data).toEqual({});
    expect(c.recienIniciada).toBe(false);
    expect(c.inicioRealAt).toEqual(hace(30));
    expect(c.aceptadaAt).toEqual(hace(40));
  });

  it('aceptada con el botón viejo pero sin iniciar: ahora sí marca el inicio', () => {
    const c = cambiosAlIniciar({ aceptadaAt: hace(90) }, { ahora: AHORA });
    expect(c.data).toEqual({ inicioRealAt: AHORA });
    expect(c.recienIniciada).toBe(true);
  });

  it('un rechazo de antes de la regla se limpia al iniciar', () => {
    const c = cambiosAlIniciar({ rechazadaAt: hace(120) }, { ahora: AHORA });
    expect(c.data).toEqual({
      aceptadaAt: AHORA,
      rechazadaAt: null,
      motivoRechazo: null,
      inicioRealAt: AHORA,
    });
  });

  it('quien solo reparte un despacho no la ejecuta: sin inicio real', () => {
    const c = cambiosAlIniciar({}, { despachador: true, ahora: AHORA });
    expect(c.data).toEqual({ aceptadaAt: AHORA });
    expect(c.recienIniciada).toBe(false);
    expect(c.inicioRealAt).toBeNull();
  });
});

describe('semáforo', () => {
  it('rojo: prioridad ALTA sin iniciar', () => {
    expect(semaforoDe({ prioridad: 'Alta', ahora: AHORA })).toBe('rojo');
  });

  it('rojo: pasó su fecha máxima', () => {
    expect(semaforoDe({ prioridad: 'Baja', fechaMaxima: hace(60), ahora: AHORA })).toBe('rojo');
  });

  it('rojo: excedió el plan aunque siga en curso', () => {
    expect(
      semaforoDe({ prioridad: 'Baja', inicioRealAt: hace(155), minutosPlan: 120, minutosReales: 155, ahora: AHORA }),
    ).toBe('rojo');
  });

  it('amarillo: prioridad MEDIA sin iniciar', () => {
    expect(semaforoDe({ prioridad: null, ahora: AHORA })).toBe('amarillo');
  });

  it('amarillo: en curso con más del 80 % del plan consumido', () => {
    expect(
      semaforoDe({ prioridad: 'Baja', inicioRealAt: hace(100), minutosPlan: 120, minutosReales: 100, ahora: AHORA }),
    ).toBe('amarillo');
  });

  it('verde: BAJA sin iniciar, o en curso con tiempo de sobra', () => {
    expect(semaforoDe({ prioridad: 'Baja', ahora: AHORA })).toBe('verde');
    expect(
      semaforoDe({ prioridad: 'Alta', inicioRealAt: hace(30), minutosPlan: 120, minutosReales: 30, ahora: AHORA }),
    ).toBe('verde');
  });

  it('verde: terminada dentro del plan aunque la fecha máxima ya pasara', () => {
    expect(
      semaforoDe({
        prioridad: 'Alta',
        fechaMaxima: hace(300),
        inicioRealAt: hace(200),
        finRealAt: hace(120),
        minutosPlan: 120,
        minutosReales: 80,
        ahora: AHORA,
      }),
    ).toBe('verde');
  });
});

describe('tiemposDto', () => {
  it('arma la vista que consumen las apps', () => {
    const dto = tiemposDto(
      { aceptadaAt: hace(200), inicioRealAt: hace(155), horasPlan: '2', saltoPrioridad: true },
      { prioridad: 'urgente', fechaMaxima: null, estatus: 'En Proceso' },
      AHORA,
    );
    expect(dto).toMatchObject({
      aceptacion: 'ACEPTADA',
      prioridad: 'ALTA',
      minutosPlan: 120,
      minutosReales: 155,
      excedida: true,
      semaforo: 'rojo',
      saltoPrioridad: true,
    });
  });

  it('rechazada conserva el motivo y no cuenta tiempo', () => {
    const dto = tiemposDto(
      { rechazadaAt: hace(10), motivoRechazo: 'Estoy en otra emergencia en Plaza Dorada' },
      { prioridad: 'Media', estatus: 'Pendiente' },
      AHORA,
    );
    expect(dto.aceptacion).toBe('RECHAZADA');
    expect(dto.motivoRechazo).toContain('emergencia');
    expect(dto.minutosReales).toBeNull();
    expect(dto.semaforo).toBe('amarillo');
  });
});

describe('horasPlan al asignar', () => {
  it('redondea a dos decimales y descarta lo inválido', () => {
    expect(horasPlanValidas('2.333')).toBe(2.33);
    expect(horasPlanValidas(0)).toBeNull();
    expect(horasPlanValidas('')).toBeNull();
    expect(horasPlanValidas('mañana')).toBeNull();
    expect(horasPlanValidas(5000)).toBe(999.99);
  });
});
