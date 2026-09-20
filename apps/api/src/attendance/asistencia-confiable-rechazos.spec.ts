import { distanciaMetros } from './asistencia-confiable.js';
import {
  MOTIVO_RECHAZO,
  coordenadaRepetida,
  edadDelPunto,
  origenChecada,
  viajeImposible,
  FIX_VIEJO_RECHAZO_MS,
  FIX_VIEJO_REVISAR_MS,
} from './asistencia-confiable.js';
import { UA_APP_ANDROID, UA_APP_IOS } from './peticion-de-app.testing.js';

/**
 * Las reglas que el servidor puede aplicar por su cuenta, sin hardware nuevo y sin
 * creerle nada al teléfono. Todas son funciones puras: se prueban sin base de datos.
 */

describe('de dónde vino la checada', () => {
  const req = (ua: string, extra: Record<string, string> = {}) => ({
    'user-agent': ua,
    ...extra,
  });

  it('el User-Agent de la app Android da ANDROID', () => {
    expect(origenChecada(UA_APP_ANDROID, req(UA_APP_ANDROID))).toBe('ANDROID');
  });

  it('el de la app de iPhone da IOS', () => {
    expect(origenChecada(UA_APP_IOS, req(UA_APP_IOS))).toBe('IOS');
  });

  it('la cabecera X-Device-OS basta cuando el User-Agent no dice el sistema', () => {
    // OkHttp puede no fijar `User-Agent`; la app siempre manda sus cabeceras.
    const headers = {
      'x-device-browser': 'NEXARA App',
      'x-device-os': 'iOS 18.1',
      'sec-ch-ua-platform': 'iOS',
    };
    expect(origenChecada('', headers)).toBe('IOS');
  });

  it('Chrome en una computadora es WEB', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36';
    expect(origenChecada(chrome, req(chrome))).toBe('WEB');
  });

  it('Chrome en el mismo teléfono también es WEB: lo que separa no es el aparato, es la app', () => {
    const chromeAndroid =
      'Mozilla/5.0 (Linux; Android 14; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Mobile Safari/537.36';
    expect(origenChecada(chromeAndroid, req(chromeAndroid))).toBe('WEB');
  });

  it('una petición sin nada es WEB: no identificarse no da el beneficio de la duda', () => {
    expect(origenChecada(undefined, {})).toBe('WEB');
    expect(origenChecada(null, undefined)).toBe('WEB');
  });
});

describe('viaje imposible entre dos checadas', () => {
  const puebla = { latitude: 19.0414, longitude: -98.2063 };
  const cdmx = { latitude: 19.4326, longitude: -99.1332 };
  const hace = (min: number) => new Date(Date.now() - min * 60_000);

  it('Puebla y Ciudad de México con diez minutos de diferencia no es posible', () => {
    // ~100 km en 10 min son 600 km/h.
    const r = viajeImposible({ ...puebla, at: hace(10) }, { ...cdmx, at: new Date() });
    expect(r.imposible).toBe(true);
    expect(r.velocidadKmh).toBeGreaterThan(300);
    expect(r.distanciaM).toBeGreaterThan(90_000);
  });

  it('el mismo trayecto en tres horas sí lo es', () => {
    const r = viajeImposible({ ...puebla, at: hace(180) }, { ...cdmx, at: new Date() });
    expect(r.imposible).toBe(false);
  });

  it('dos puntos del mismo edificio no producen velocidades absurdas', () => {
    // 30 m en 2 s daría 54 km/h «reales», pero es ruido del GPS: no se opina.
    const a = { latitude: 19.074, longitude: -98.278, at: new Date(Date.now() - 2_000) };
    const b = { latitude: 19.0743, longitude: -98.278, at: new Date() };
    expect(distanciaMetros(a, b)).toBeLessThan(100);
    expect(viajeImposible(a, b).imposible).toBe(false);
  });

  it('sin checada anterior no hay con qué comparar', () => {
    expect(viajeImposible(null, { ...cdmx, at: new Date() })).toEqual({
      imposible: false,
      velocidadKmh: null,
      distanciaM: null,
    });
  });

  it('dos checadas en el mismo segundo no se juzgan: dividir entre casi cero miente', () => {
    const ahora = new Date();
    const r = viajeImposible({ ...puebla, at: ahora }, { ...cdmx, at: new Date(ahora.getTime() + 500) });
    expect(r.imposible).toBe(false);
  });
});

describe('antigüedad de la medición', () => {
  it('una medición del momento pasa sin más', () => {
    expect(edadDelPunto(1_500)).toEqual({ veredicto: 'ok', edadMs: 1_500 });
  });

  it('de más de cinco minutos queda a revisión', () => {
    expect(edadDelPunto(FIX_VIEJO_REVISAR_MS + 1_000).veredicto).toBe('revisar');
  });

  it('de más de media hora no se acepta: es una posición guardada', () => {
    expect(edadDelPunto(FIX_VIEJO_RECHAZO_MS + 1_000).veredicto).toBe('rechazar');
  });

  it('una app que todavía no lo manda no queda marcada por eso', () => {
    expect(edadDelPunto(undefined)).toEqual({ veredicto: 'ok', edadMs: null });
    expect(edadDelPunto(null)).toEqual({ veredicto: 'ok', edadMs: null });
    // Un negativo es un cliente con un error, no una prueba de nada.
    expect(edadDelPunto(-5).veredicto).toBe('ok');
  });
});

describe('coordenada calcada', () => {
  const punto = { latitude: 19.074, longitude: -98.278 };

  it('tres checadas seguidas en el punto exacto no las produce un GPS real', () => {
    expect(coordenadaRepetida(punto, [punto, punto])).toBe(true);
  });

  it('con la deriva normal del GPS no se marca a nadie', () => {
    const cerca = { latitude: 19.07404, longitude: -98.27812 };
    const otro = { latitude: 19.07396, longitude: -98.27789 };
    expect(coordenadaRepetida(punto, [cerca, otro])).toBe(false);
  });

  it('hacen falta suficientes checadas anteriores antes de sospechar', () => {
    expect(coordenadaRepetida(punto, [punto])).toBe(false);
    expect(coordenadaRepetida(punto, [])).toBe(false);
  });

  it('sin ubicación no hay coordenada que repetir', () => {
    expect(coordenadaRepetida(null, [punto, punto])).toBe(false);
  });
});

describe('las claves de rechazo son estables', () => {
  it('son las que se guardan en la base y las que traduce la interfaz', () => {
    // Cambiarlas rompería las filas ya escritas: si esto falla, hay que migrar.
    expect(Object.values(MOTIVO_RECHAZO).sort()).toEqual([
      'MOCK_LOCATION',
      'ORIGEN_WEB',
      'UBICACION_VIEJA',
      'VIAJE_IMPOSIBLE',
    ]);
  });
});
