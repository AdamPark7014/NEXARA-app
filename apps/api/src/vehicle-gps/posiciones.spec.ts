import {
  SALTO_MAX_M,
  coordenadaValida,
  distanciaM,
  kmRecorrido,
  llavePunto,
  quitarRepetidos,
  rangoDelDia,
  type PuntoGps,
} from './posiciones';
import { PASO_DEMO_MS, SimuladorGpsProvider, posicionDemo, semilla } from './simulador.adapter';

/** Las reglas que comparten todos los proveedores de rastreo. */

function punto(dispositivoId: string, at: string, lat = 19.04, lng = -98.2): PuntoGps {
  return { dispositivoId, lat, lng, velocidadKmh: null, rumbo: null, at: new Date(at) };
}

describe('coordenadas', () => {
  it('19.04, -98.20 es Puebla y vale', () => {
    expect(coordenadaValida(19.0414, -98.2063)).toBe(true);
  });

  it('0,0 no: es «sin señal», no el Golfo de Guinea', () => {
    expect(coordenadaValida(0, 0)).toBe(false);
  });

  it('pero 0 en un solo eje sí puede ser real', () => {
    expect(coordenadaValida(0, -98.2)).toBe(true);
  });

  it('fuera del planeta, no', () => {
    expect(coordenadaValida(91, 0)).toBe(false);
    expect(coordenadaValida(19, 181)).toBe(false);
    expect(coordenadaValida('x', 0)).toBe(false);
    expect(coordenadaValida(null, undefined)).toBe(false);
  });
});

describe('la llave natural de un punto', () => {
  it('es el equipo más el instante', () => {
    expect(llavePunto('K1', new Date('2026-09-19T15:00:00.000Z'))).toBe('K1|2026-09-19T15:00:00.000Z');
  });

  it('el mismo equipo en el mismo instante es el mismo punto', () => {
    const puntos = [
      punto('K1', '2026-09-19T15:00:00.000Z'),
      punto('K1', '2026-09-19T15:00:00.000Z', 19.05, -98.21),
    ];
    expect(quitarRepetidos(puntos)).toHaveLength(1);
  });

  it('dos equipos en el mismo instante son dos puntos', () => {
    const puntos = [punto('K1', '2026-09-19T15:00:00.000Z'), punto('K2', '2026-09-19T15:00:00.000Z')];
    expect(quitarRepetidos(puntos)).toHaveLength(2);
  });
});

describe('kilómetros del recorrido', () => {
  it('un solo punto no es un recorrido', () => {
    expect(kmRecorrido([{ lat: 19.04, lng: -98.2 }])).toBe(0);
    expect(kmRecorrido([])).toBe(0);
  });

  it('un grado de latitud son unos 111 km', () => {
    expect(distanciaM({ lat: 19, lng: -98 }, { lat: 20, lng: -98 })).toBeGreaterThan(110_000);
    expect(distanciaM({ lat: 19, lng: -98 }, { lat: 20, lng: -98 })).toBeLessThan(112_000);
  });

  it(`un salto de más de ${SALTO_MAX_M / 1000} km es un error del rastreador, no un viaje`, () => {
    const conSalto = [
      { lat: 19.04, lng: -98.2 },
      { lat: 19.05, lng: -98.2 },
      // Un brinco al otro lado del país: se ignora.
      { lat: 25.0, lng: -100.0 },
      { lat: 25.001, lng: -100.0 },
    ];
    // Sin el filtro serían cientos de km.
    expect(kmRecorrido(conSalto)).toBeLessThan(5);
  });
});

describe('el día en hora de México', () => {
  it('empieza a las 00:00 locales, que son las 06:00 UTC', () => {
    const { desde, hasta } = rangoDelDia('2026-09-19');
    expect(desde.toISOString()).toBe('2026-09-19T06:00:00.000Z');
    expect(hasta.toISOString()).toBe('2026-09-20T06:00:00.000Z');
  });

  it('una fecha que no es fecha se rechaza', () => {
    expect(() => rangoDelDia('ayer')).toThrow();
    expect(() => rangoDelDia('')).toThrow();
  });
});

describe('simulador', () => {
  it('se anuncia como demo: la pantalla tiene que poder decirlo', () => {
    const s = new SimuladorGpsProvider();
    expect(s.demo).toBe(true);
    expect(s.nombre).toBe('simulador');
  });

  it('el mismo equipo sale siempre por el mismo sitio, no parpadea', () => {
    const at = new Date('2026-09-19T15:00:00.000Z');
    expect(posicionDemo('K1', at)).toEqual(posicionDemo('K1', at));
    expect(semilla('K1')).toBe(semilla('K1'));
  });

  it('dos equipos distintos van por rutas distintas', () => {
    const at = new Date('2026-09-19T15:00:00.000Z');
    expect(posicionDemo('K1', at).lat).not.toBe(posicionDemo('K2', at).lat);
  });

  it('los puntos caen dentro de Puebla y son coordenadas válidas', async () => {
    const puntos = await new SimuladorGpsProvider(() => new Date('2026-09-19T18:00:00.000Z')).puntosRecientes(
      ['K1'],
      null,
    );
    expect(puntos.length).toBeGreaterThan(10);
    for (const p of puntos) {
      expect(coordenadaValida(p.lat, p.lng)).toBe(true);
      expect(Math.abs(p.lat - 19.0414)).toBeLessThan(0.1);
      expect(Math.abs(p.lng + 98.2063)).toBeLessThan(0.1);
    }
  });

  it('dos corridas seguidas generan las mismas llaves: la ingesta es idempotente', async () => {
    const ahora = () => new Date('2026-09-19T18:00:00.000Z');
    const a = await new SimuladorGpsProvider(ahora).puntosRecientes(['K1'], null);
    const b = await new SimuladorGpsProvider(ahora).puntosRecientes(['K1'], null);
    expect(a.map((p) => llavePunto(p.dispositivoId, p.at))).toEqual(
      b.map((p) => llavePunto(p.dispositivoId, p.at)),
    );
  });

  it('con un «desde» reciente ya no rellena el pasado', async () => {
    const ahora = new Date('2026-09-19T18:00:00.000Z');
    const puntos = await new SimuladorGpsProvider(() => ahora).puntosRecientes(
      ['K1'],
      new Date(ahora.getTime() - PASO_DEMO_MS),
    );
    expect(puntos.length).toBeLessThanOrEqual(2);
  });

  it('sin vehículos con rastreador no inventa nada', async () => {
    expect(await new SimuladorGpsProvider().puntosRecientes([], null)).toEqual([]);
  });
});
