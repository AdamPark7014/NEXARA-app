import { ANILLO_CORRIDAS, MAX_TAREAS_LATIDO, latido, latidoEncendido, reiniciarLatido } from './latido-tareas';

const T0 = Date.UTC(2026, 10, 28, 12, 0, 0);

function estadoDe(nombre: string) {
  return latido.instantanea().find((e) => e.nombre === nombre);
}

describe('latido de tareas', () => {
  const antes = process.env.PULSO_LATIDO;

  beforeEach(() => {
    delete process.env.PULSO_LATIDO;
    reiniciarLatido(T0);
  });

  afterAll(() => {
    if (antes === undefined) delete process.env.PULSO_LATIDO;
    else process.env.PULSO_LATIDO = antes;
  });

  it('una corrida buena deja inicio, fin, duración y resultado ok', () => {
    latido.inicio('t', T0);
    expect(estadoDe('t')?.enCursoDesde).toBe(T0);
    latido.fin('t', 'ok', 250, undefined, T0 + 250);

    const e = estadoDe('t')!;
    expect(e).toMatchObject({
      corridas: 1,
      fallos: 0,
      fallosSeguidos: 0,
      ultimoInicio: T0,
      ultimoFin: T0 + 250,
      ultimoOk: T0 + 250,
      ultimoResultado: 'ok',
      duracionUltimaMs: 250,
      duracionMaxMs: 250,
      enCursoDesde: null,
      sucio: true,
    });
  });

  it('un error suma fallos y fallos seguidos; una corrida buena los regresa a 0 pero conserva el último error', () => {
    latido.inicio('t', T0);
    latido.fin('t', 'error', 10, 'se cayó', T0 + 10);
    latido.inicio('t', T0 + 100);
    latido.fin('t', 'error', 10, 'se cayó otra vez', T0 + 110);
    expect(estadoDe('t')).toMatchObject({ fallos: 2, fallosSeguidos: 2, ultimoResultado: 'error', ultimoError: 'se cayó otra vez' });

    latido.inicio('t', T0 + 200);
    latido.fin('t', 'ok', 5, undefined, T0 + 205);
    expect(estadoDe('t')).toMatchObject({ fallos: 2, fallosSeguidos: 0, ultimoResultado: 'ok', ultimoError: 'se cayó otra vez' });
  });

  it('la duración máxima solo sube', () => {
    for (const ms of [100, 900, 300]) {
      latido.inicio('t', T0);
      latido.fin('t', 'ok', ms, undefined, T0 + ms);
    }
    expect(estadoDe('t')).toMatchObject({ duracionUltimaMs: 300, duracionMaxMs: 900 });
  });

  it('una vuelta saltada se cuenta aparte y no cuenta como corrida', () => {
    latido.inicio('t', T0);
    latido.saltada('t');
    latido.saltada('t');
    const e = estadoDe('t')!;
    expect(e.saltadas).toBe(2);
    expect(e.corridas).toBe(0);
    expect(e.ultimoResultado).toBe('saltada');
    expect(e.enCursoDesde).toBe(T0);
    expect(e.recientes).toHaveLength(0);
  });

  it('el anillo guarda solo las últimas 10 corridas, la más vieja primero', () => {
    for (let i = 0; i < 14; i++) {
      latido.inicio('t', T0 + i * 1000);
      latido.fin('t', i % 2 ? 'error' : 'ok', i, i % 2 ? `e${i}` : undefined, T0 + i * 1000 + i);
    }
    const e = estadoDe('t')!;
    expect(e.corridas).toBe(14);
    expect(e.recientes).toHaveLength(ANILLO_CORRIDAS);
    expect(e.recientes[0]!.ms).toBe(4);
    expect(e.recientes[9]!.ms).toBe(13);
    expect(e.recientes[9]).toMatchObject({ resultado: 'error', error: 'e13' });
    expect(e.recientes[8]).not.toHaveProperty('error');
  });

  it('instantanea devuelve copias: tocar el resultado no cambia la memoria', () => {
    latido.inicio('t', T0);
    latido.fin('t', 'ok', 1, undefined, T0 + 1);
    const copia = latido.instantanea();
    copia[0]!.corridas = 999;
    copia[0]!.recientes.push({ inicio: 0, ms: 0, resultado: 'ok' });
    expect(estadoDe('t')).toMatchObject({ corridas: 1 });
    expect(estadoDe('t')!.recientes).toHaveLength(1);
  });

  it('instantanea sale ordenada por nombre', () => {
    for (const n of ['zeta', 'alfa', 'medio']) latido.inicio(n, T0);
    expect(latido.instantanea().map((e) => e.nombre)).toEqual(['alfa', 'medio', 'zeta']);
  });

  it('con PULSO_LATIDO=0 no registra nada (ni inicio, ni fin, ni saltada)', () => {
    process.env.PULSO_LATIDO = '0';
    expect(latidoEncendido()).toBe(false);
    latido.inicio('t', T0);
    latido.fin('t', 'ok', 1);
    latido.saltada('t');
    expect(latido.instantanea()).toEqual([]);
    process.env.PULSO_LATIDO = '1';
    expect(latidoEncendido()).toBe(true);
    latido.inicio('t', T0);
    expect(latido.instantanea()).toHaveLength(1);
  });

  it('tiene tope de tareas distintas en memoria', () => {
    for (let i = 0; i < MAX_TAREAS_LATIDO + 20; i++) latido.inicio(`dinamica-${i}`, T0);
    expect(latido.instantanea()).toHaveLength(MAX_TAREAS_LATIDO);
    // Las que ya estaban siguen registrándose.
    latido.fin('dinamica-0', 'ok', 1, undefined, T0 + 1);
    expect(estadoDe('dinamica-0')?.corridas).toBe(1);
  });

  it('hidratar devuelve el historial guardado, sin sobrescribir lo que ya corrió en este proceso', () => {
    latido.inicio('ya-corrio', T0);
    latido.fin('ya-corrio', 'ok', 1, undefined, T0 + 1);

    const n = latido.hidratar([
      { nombre: 'ya-corrio', corridas: 500, ultimoInicio: new Date(T0 - 1e9) },
      {
        nombre: 'diaria',
        corridas: 30,
        fallos: 2,
        saltadas: 1,
        ultimoInicio: new Date(T0 - 3_600_000),
        ultimoFin: new Date(T0 - 3_599_000),
        ultimoOk: T0 - 3_599_000,
        ultimoResultado: 'ok',
        ultimoError: 'viejo',
        duracionUltimaMs: 1000,
        duracionMaxMs: 4000,
        fallosSeguidos: 0,
        avisadoAt: null,
      },
      { nombre: 'rara', corridas: -3, ultimoResultado: 'inventado', ultimoInicio: 'no es fecha' as unknown as number },
    ]);

    expect(n).toBe(2);
    expect(estadoDe('ya-corrio')?.corridas).toBe(1);
    expect(estadoDe('diaria')).toMatchObject({
      corridas: 30,
      fallos: 2,
      saltadas: 1,
      ultimoInicio: T0 - 3_600_000,
      ultimoOk: T0 - 3_599_000,
      ultimoResultado: 'ok',
      duracionMaxMs: 4000,
      enCursoDesde: null,
      sucio: false,
    });
    expect(estadoDe('rara')).toMatchObject({ corridas: 0, ultimoResultado: null, ultimoInicio: null });
  });

  it('marcarAvisada y marcarLimpias', () => {
    latido.inicio('t', T0);
    expect(estadoDe('t')?.sucio).toBe(true);
    latido.marcarLimpias(['t', 'no-existe']);
    expect(estadoDe('t')?.sucio).toBe(false);
    expect(latido.marcarAvisada('t', T0 + 5)).toBe(true);
    expect(estadoDe('t')).toMatchObject({ avisadoAt: T0 + 5, sucio: true });
  });

  it('marcarAvisada crea el estado de una tarea que nunca corrió (vacío, solo con el aviso)', () => {
    expect(estadoDe('nunca-corrio')).toBeUndefined();
    expect(latido.marcarAvisada('nunca-corrio', T0 + 7)).toBe(true);
    expect(estadoDe('nunca-corrio')).toMatchObject({
      avisadoAt: T0 + 7,
      sucio: true,
      corridas: 0,
      ultimoInicio: null,
      ultimoResultado: null,
      recientes: [],
    });
    // Y cuando por fin corre, sigue siendo el mismo estado: el aviso se conserva hasta que el vigilante lo limpie.
    latido.inicio('nunca-corrio', T0 + 100);
    latido.fin('nunca-corrio', 'ok', 5, undefined, T0 + 105);
    expect(estadoDe('nunca-corrio')).toMatchObject({ avisadoAt: T0 + 7, corridas: 1, ultimoResultado: 'ok' });
  });

  it('marcarAvisada devuelve false (sin lanzar) si no hay lugar: tope de nombres lleno', () => {
    for (let i = 0; i < MAX_TAREAS_LATIDO; i += 1) latido.inicio(`t${i}`, T0);
    expect(() => latido.marcarAvisada('uno-mas', T0)).not.toThrow();
    expect(latido.marcarAvisada('uno-mas', T0)).toBe(false);
    expect(estadoDe('uno-mas')).toBeUndefined();
    // Las que ya tenían estado se siguen pudiendo marcar.
    expect(latido.marcarAvisada('t0', T0 + 1)).toBe(true);
  });

  it('con PULSO_LATIDO=0 marcarAvisada no crea estados, pero sí marca los que ya existían', () => {
    latido.inicio('antes', T0);
    process.env.PULSO_LATIDO = '0';
    expect(latido.marcarAvisada('nueva', T0)).toBe(false);
    expect(estadoDe('nueva')).toBeUndefined();
    expect(latido.marcarAvisada('antes', T0 + 1)).toBe(true);
    expect(estadoDe('antes')?.avisadoAt).toBe(T0 + 1);
  });

  it('limpiarAviso vuelve a armar el aviso de una tarea recuperada', () => {
    latido.inicio('t', T0);
    latido.marcarAvisada('t', T0 + 5);
    latido.marcarLimpias(['t']);
    latido.limpiarAviso('t');
    expect(estadoDe('t')).toMatchObject({ avisadoAt: null, sucio: true });
    expect(() => latido.limpiarAviso('no-existe')).not.toThrow();
    expect(estadoDe('no-existe')).toBeUndefined();
  });

  it('arranqueMs es el instante del último reinicio', () => {
    reiniciarLatido(12345);
    expect(latido.arranqueMs()).toBe(12345);
  });
});
