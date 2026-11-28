import { GRACIA_ARRANQUE_MAX_MS, LIMITE_MINIMO_MS, evaluarTareas, graciaArranqueMs, limiteMs, periodoMs } from './evaluar-tareas';
import type { EstadoTarea } from './latido-tareas';
import { TAREAS_CATALOGO, type TareaCatalogo } from './tareas-catalogo';

const MIN = 60_000;
const HORA = 60 * MIN;
const ARRANQUE = Date.UTC(2026, 10, 20, 0, 0, 0);
/** Mucho después del arranque: nada se juzga «sin datos» por estar recién arrancado. */
const AHORA = ARRANQUE + 10 * 24 * HORA;

const CAT: Record<string, TareaCatalogo> = {
  cada5: { cron: '*/5 * * * *', zona: 'UTC', grupo: 't', que: 'cada 5 min', critica: true },
  diaria: { cron: '0 8 * * *', zona: 'MX', grupo: 't', que: 'diaria' },
  habiles: { cron: '0 8 * * 1-5', zona: 'MX', grupo: 't', que: 'de lunes a viernes' },
  cierre: { cron: '30 23 * * *', zona: 'MX', grupo: 't', que: 'cierre', factor: 1.5 },
};

function estado(nombre: string, extra: Partial<EstadoTarea> = {}): EstadoTarea {
  return {
    nombre,
    corridas: 1,
    fallos: 0,
    saltadas: 0,
    ultimoInicio: AHORA - MIN,
    ultimoFin: AHORA - MIN + 1000,
    ultimoOk: AHORA - MIN + 1000,
    ultimoResultado: 'ok',
    ultimoError: null,
    duracionUltimaMs: 1000,
    duracionMaxMs: 1000,
    fallosSeguidos: 0,
    enCursoDesde: null,
    avisadoAt: null,
    sucio: false,
    recientes: [],
    ...extra,
  };
}

function una(nombre: string, e: EstadoTarea | undefined, ahora = AHORA, arranque = ARRANQUE) {
  const r = evaluarTareas(e ? [e] : [], { [nombre]: CAT[nombre]! }, ahora, arranque);
  return r[0]!;
}

describe('periodo y límite', () => {
  it('el periodo es el hueco máximo del cron, en ms', () => {
    expect(periodoMs('*/5 * * * *')).toBe(5 * MIN);
    expect(periodoMs('0 8 * * 1-5')).toBe(72 * HORA);
  });

  it('el límite es factor × periodo, con 3 minutos como mínimo', () => {
    expect(limiteMs({ cron: '*/5 * * * *' })).toBe(10 * MIN);
    expect(limiteMs({ cron: '* * * * *' })).toBe(LIMITE_MINIMO_MS); // 2 × 1 min = 2 min → sube a 3
    expect(limiteMs({ cron: '30 23 * * *', factor: 1.5 })).toBe(36 * HORA);
  });
});

describe('evaluarTareas', () => {
  it('una tarea que late a tiempo está ok', () => {
    expect(una('cada5', estado('cada5', { ultimoInicio: AHORA - 4 * MIN }))).toMatchObject({ estado: 'ok', critica: true });
  });

  it('sin estado y dentro de su margen desde el arranque: sin_datos (nunca rojo)', () => {
    const r = una('diaria', undefined, ARRANQUE + 5 * HORA);
    expect(r.estado).toBe('sin_datos');
  });

  it('sin estado y pasado su límite desde el arranque: atrasada', () => {
    const r = una('cada5', undefined, ARRANQUE + 11 * MIN);
    expect(r.estado).toBe('atrasada');
    expect(una('cada5', undefined, ARRANQUE + 10 * MIN).estado).toBe('sin_datos'); // justo en el límite todavía no
  });

  it('ultimoInicio más viejo que 2 periodos: atrasada; justo en 2 periodos: ok', () => {
    expect(una('cada5', estado('cada5', { ultimoInicio: AHORA - 10 * MIN - 1 })).estado).toBe('atrasada');
    expect(una('cada5', estado('cada5', { ultimoInicio: AHORA - 10 * MIN })).estado).toBe('ok');
  });

  it('una tarea de lunes a viernes puede callar el fin de semana sin ser falla', () => {
    // Viernes 08:00 → lunes 07:00: 71 horas, menos que 2 × 72.
    expect(una('habiles', estado('habiles', { ultimoInicio: AHORA - 71 * HORA })).estado).toBe('ok');
    expect(una('habiles', estado('habiles', { ultimoInicio: AHORA - 145 * HORA })).estado).toBe('atrasada');
  });

  it('el factor 1.5 acorta el límite', () => {
    // periodo 24 h × 1.5 = 36 h
    expect(una('cierre', estado('cierre', { ultimoInicio: AHORA - 36 * HORA })).estado).toBe('ok');
    expect(una('cierre', estado('cierre', { ultimoInicio: AHORA - 36 * HORA - 1 })).estado).toBe('atrasada');
    // con el factor 2 por omisión este mismo silencio todavía sería ok
    const sinFactor = { ...CAT.cierre!, factor: undefined };
    const r = evaluarTareas([estado('cierre', { ultimoInicio: AHORA - 40 * HORA })], { cierre: sinFactor }, AHORA, ARRANQUE);
    expect(r[0]!.estado).toBe('ok');
  });

  it('enCursoDesde viejo: atorada (más de 15 min, o de 2 periodos si es mayor)', () => {
    const corriendo = (min: number) => estado('cada5', { ultimoInicio: AHORA - min * MIN, enCursoDesde: AHORA - min * MIN });
    expect(una('cada5', corriendo(14)).estado).toBe('ok');
    expect(una('cada5', corriendo(16)).estado).toBe('atorada');
    // diaria: el límite de «atorada» es 2 días, no 15 min
    expect(una('diaria', estado('diaria', { ultimoInicio: AHORA - 5 * HORA, enCursoDesde: AHORA - 5 * HORA })).estado).toBe('ok');
    expect(una('diaria', estado('diaria', { ultimoInicio: AHORA - 49 * HORA, enCursoDesde: AHORA - 49 * HORA })).estado).toBe('atorada');
  });

  it('3 fallos seguidos: fallando; 2: ok', () => {
    const r3 = una('cada5', estado('cada5', { fallosSeguidos: 3, ultimoError: 'se cayó la base', ultimoResultado: 'error' }));
    expect(r3.estado).toBe('fallando');
    expect(r3.detalle).toContain('se cayó la base');
    expect(una('cada5', estado('cada5', { fallosSeguidos: 2 })).estado).toBe('ok');
  });

  it('atrasada gana a fallando: si ya no arranca, lo importante es que no corre', () => {
    const r = una('cada5', estado('cada5', { fallosSeguidos: 5, ultimoInicio: AHORA - 3 * HORA }));
    expect(r.estado).toBe('atrasada');
  });

  it('tras un reinicio, una tarea corta no se juzga atrasada antes de que pase su límite desde el arranque', () => {
    // Historial rescatado de la base: su último inicio es de hace 2 h, pero el proceso arrancó hace 1 min.
    const e = estado('cada5', { ultimoInicio: AHORA - 2 * HORA });
    expect(una('cada5', e, AHORA, AHORA - MIN).estado).toBe('ok');
    expect(una('cada5', e, AHORA, AHORA - 11 * MIN).estado).toBe('atrasada');
  });

  describe('historial de antes del reinicio (1B): se juzga por su silencio real, con una gracia corta', () => {
    it('diaria muerta hace 3 días y servidor recién desplegado: ok dentro de la gracia, atrasada pasada la gracia', () => {
      const e = estado('diaria', { ultimoInicio: AHORA - 72 * HORA });
      const dentro = una('diaria', e, AHORA, AHORA - 10 * MIN);
      expect(dentro.estado).toBe('ok');
      expect(dentro.detalle).toContain('todavía no le tocaba');
      const despues = una('diaria', e, AHORA, AHORA - 20 * MIN);
      expect(despues.estado).toBe('atrasada');
      expect(despues.edadMs).toBe(72 * HORA); // el silencio real, no el tiempo desde el arranque
    });

    it('la gracia es min(límite, 15 min): la frontera es exacta', () => {
      const e = estado('diaria', { ultimoInicio: AHORA - 72 * HORA });
      expect(una('diaria', e, AHORA, AHORA - 15 * MIN).estado).toBe('ok');
      expect(una('diaria', e, AHORA, AHORA - 15 * MIN - 1).estado).toBe('atrasada');
      // las cortas conservan su límite como gracia: cada5 tiene 10 min, no 15
      const corta = estado('cada5', { ultimoInicio: AHORA - 2 * HORA });
      expect(una('cada5', corta, AHORA, AHORA - 10 * MIN).estado).toBe('ok');
      expect(una('cada5', corta, AHORA, AHORA - 10 * MIN - 1).estado).toBe('atrasada');
      expect(graciaArranqueMs({ cron: '*/5 * * * *' })).toBe(10 * MIN);
      expect(graciaArranqueMs({ cron: '0 8 * * *' })).toBe(GRACIA_ARRANQUE_MAX_MS);
      expect(graciaArranqueMs({ cron: '* * * * *' })).toBe(LIMITE_MINIMO_MS);
    });

    it('lo mismo con varios despliegues al día: cada reinicio nuevo no esconde a una semanal que lleva semanas muerta', () => {
      const semanal: Record<string, TareaCatalogo> = { semanal: { cron: '0 3 * * 0', zona: 'MX', grupo: 't', que: 'semanal' } };
      const e = estado('semanal', { ultimoInicio: AHORA - 21 * 24 * HORA });
      // Tres despliegues seguidos, cada uno con su propio arranque: pasada la gracia, siempre atrasada.
      for (const minutos of [20, 45, 120]) {
        const r = evaluarTareas([e], semanal, AHORA, AHORA - minutos * MIN)[0]!;
        expect(r.estado).toBe('atrasada');
      }
    });

    it('si su silencio todavía cabe en su límite, un reinicio no la vuelve atrasada ni cambia nada', () => {
      const e = estado('diaria', { ultimoInicio: AHORA - 30 * HORA });
      for (const minutos of [1, 20, 600]) {
        const r = una('diaria', e, AHORA, AHORA - minutos * MIN);
        expect(r.estado).toBe('ok');
        expect(r.detalle).toBe('Late bien.');
      }
    });

    it('solo el historial de antes del arranque recibe gracia; lo que corrió en este proceso no', () => {
      const arranque = AHORA - 20 * MIN;
      // corrió hace 1 h y el proceso lleva 20 min: el último inicio es de ANTES del arranque, es historial
      expect(una('cada5', estado('cada5', { ultimoInicio: AHORA - HORA }), AHORA, arranque).estado).toBe('atrasada');
      // corrió hace 11 min con el proceso ya arrancado: es de este proceso, sin gracia
      expect(una('cada5', estado('cada5', { ultimoInicio: AHORA - 11 * MIN }), AHORA, arranque).estado).toBe('atrasada');
      expect(una('cada5', estado('cada5', { ultimoInicio: AHORA - 4 * MIN }), AHORA, arranque).estado).toBe('ok');
    });

    it('dentro de la gracia las fallas seguidas se siguen reportando', () => {
      const e = estado('diaria', { ultimoInicio: AHORA - 72 * HORA, fallosSeguidos: 3, ultimoError: 'sin permiso' });
      expect(una('diaria', e, AHORA, AHORA - 5 * MIN).estado).toBe('fallando');
    });

    it('sin historial el arranque sigue siendo la referencia', () => {
      expect(una('diaria', undefined, AHORA, AHORA - 47 * HORA).estado).toBe('sin_datos');
      expect(una('diaria', undefined, AHORA, AHORA - 49 * HORA).estado).toBe('atrasada');
    });
  });

  it('con relevo todo sale ok con detalle «relevo», aunque haya fallas', () => {
    const r = evaluarTareas(
      [estado('cada5', { fallosSeguidos: 9, ultimoInicio: AHORA - 5 * HORA })],
      CAT,
      AHORA,
      ARRANQUE,
      { relevo: true },
    );
    expect(r).toHaveLength(Object.keys(CAT).length);
    expect(r.every((x) => x.estado === 'ok' && x.detalle === 'relevo')).toBe(true);
  });

  it('los estados con nombres fuera del catálogo se ignoran', () => {
    const r = evaluarTareas([estado('cada5'), estado('no-esta-en-el-catalogo', { fallosSeguidos: 9 })], CAT, AHORA, ARRANQUE);
    expect(r.map((x) => x.nombre)).toEqual(Object.keys(CAT));
  });

  it('las que no están en los estados se juzgan sin estado', () => {
    const r = evaluarTareas([], CAT, ARRANQUE + MIN, ARRANQUE);
    expect(r.every((x) => x.estado === 'sin_datos')).toBe(true);
  });

  it('sirve con el catálogo real: recién arrancado todas son sin_datos o ok, nunca roja', () => {
    const r = evaluarTareas([], TAREAS_CATALOGO, ARRANQUE + MIN, ARRANQUE);
    expect(r).toHaveLength(Object.keys(TAREAS_CATALOGO).length);
    expect(r.every((x) => x.estado === 'sin_datos')).toBe(true);
  });

  it('marca la criticidad del catálogo en cada resultado', () => {
    const r = evaluarTareas([], CAT, ARRANQUE + MIN, ARRANQUE);
    expect(r.find((x) => x.nombre === 'cada5')!.critica).toBe(true);
    expect(r.find((x) => x.nombre === 'diaria')!.critica).toBe(false);
  });
});
