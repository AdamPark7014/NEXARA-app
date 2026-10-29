import { TABLA_ESTANDAR, calcularEstandar, reglaDe } from './tabla-estandar.js';
import { calcularRuta, deAutoATransporte, kmEnLineaRecta, rutaAproximada } from './rutas.js';

const regla = (coreKind: string, tipo?: string) => reglaDe({ coreKind, ticketType: tipo, ticketTypeCustom: tipo })!;

describe('tabla del tiempo estándar (tarifas aprobadas 28-10)', () => {
  it('cotización: 40 min + 4 por partida (5 → 1 h, 50 → 4 h)', () => {
    expect(calcularEstandar(regla('comercial'), { cantidad: 5 }).totalMin).toBe(60);
    const r = calcularEstandar(regla('comercial'), { cantidad: 50 });
    expect(r.totalMin).toBe(240);
    expect(r.desglose).toEqual([
      { concepto: 'Base de cotización', minutos: 40 },
      { concepto: '50 partidas × 4 min', minutos: 200 },
    ]);
  });

  it('instalación por dispositivo y tope de 12 h', () => {
    expect(calcularEstandar(regla('tarea', 'Instalación'), { cantidad: 8 }).totalMin).toBe(390);
    const mucho = calcularEstandar(regla('tarea', 'Instalación'), { cantidad: 20 });
    expect(mucho).toMatchObject({ totalMin: 720, topado: true });
  });

  it('sin cantidad no hay estándar: lo dice', () => {
    expect(calcularEstandar(regla('tarea', 'Instalación'), {})).toMatchObject({ totalMin: null, faltan: ['cantidad'] });
  });

  it('obra: tarifas de instalación y de cableado según lo que se cuente', () => {
    expect(calcularEstandar(regla('obra'), { cantidad: 4 }).totalMin).toBe(210); // 30 + 4 × 45
    expect(calcularEstandar(regla('obra'), { cantidad: 60, unidad: 'metros' }).totalMin).toBe(270); // 30 + 60 × 4
    expect(calcularEstandar(regla('obra'), { cantidad: 3, unidad: 'nodos' }).totalMin).toBe(165);
    expect(calcularEstandar(regla('obra'), {})).toMatchObject({ faltan: ['cantidad'] });
  });

  it('cableado por metros cuando se elige esa unidad', () => {
    expect(calcularEstandar(regla('tarea', 'Cableado y canalización'), { cantidad: 120, unidad: 'metros' }).totalMin).toBe(480);
    expect(calcularEstandar(regla('tarea', 'Cableado y canalización'), { cantidad: 2 }).totalMin).toBe(90);
  });

  it('por complejidad en los tipos sin cantidad', () => {
    expect(calcularEstandar(regla('tarea', 'Preparación de equipo'), { complejidad: 'BASICA' }).totalMin).toBe(15);
    expect(calcularEstandar(regla('tarea', 'Preparación de equipo'), { complejidad: 'COMPLEJA' }).totalMin).toBe(45);
    expect(calcularEstandar(regla('servicio', 'CORRECTIVO'), {})).toMatchObject({ faltan: ['complejidad', 'destino'] });
  });

  it('salidas: ida + vuelta + en el lugar', () => {
    const r = calcularEstandar(regla('tarea', 'Recolección'), { traslado: { idaMin: 18, vueltaMin: 21 } });
    expect(r.totalMin).toBe(55);
    expect(r.desglose.map((d) => d.concepto)).toEqual(['Ida', 'Vuelta', 'En el lugar']);
    expect(calcularEstandar(regla('tarea', 'Entrega'), {})).toMatchObject({ totalMin: null, faltan: ['destino'] });
  });

  it('juntas y cursos van por agenda y los textos viejos encuentran su regla', () => {
    expect(calcularEstandar(regla('tarea', 'Junta'), {})).toMatchObject({ totalMin: null, faltan: [] });
    expect(reglaDe({ coreKind: 'tarea', ticketTypeCustom: 'instalacion.' })?.clave).toBe('tarea:Instalación');
    // Desde el 29-10 la obra se mide por cantidad; el proyecto (actividad suelta de proyecto) no.
    expect(reglaDe({ coreKind: 'obra' })?.clave).toBe('obra');
    expect(reglaDe({ coreKind: 'proyecto' })).toBeNull();
  });

  it('cada clave aparece una vez', () => {
    const claves = TABLA_ESTANDAR.map((r) => r.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe('ruta de ida y vuelta', () => {
  const oficina = { lat: 19.074, lng: -98.2 };
  const centro = { lat: 19.0414, lng: -98.2063 };

  it('aproximado en línea recta × 1.4 a 25 km/h, y transporte desde el auto', () => {
    expect(kmEnLineaRecta(oficina, centro)).toBeCloseTo(3.67, 1);
    const r = rutaAproximada(oficina, centro, 'AUTO');
    expect(r).toMatchObject({ idaMin: 12, vueltaMin: 12, fuente: 'aproximado', estimado: true });
    expect(deAutoATransporte(12)).toBe(36);
  });

  it('salta a OSRM si Google falla, y a lo aproximado si OSRM también', async () => {
    const pedir = jest.fn(async (url: string) => {
      if (String(url).includes('googleapis')) return { ok: false, json: async () => ({}) } as Response;
      return {
        ok: true,
        json: async () => ({ code: 'Ok', routes: [{ legs: [{ duration: 420, distance: 4600 }, { duration: 540, distance: 4700 }] }] }),
      } as Response;
    });
    const r = await calcularRuta(oficina, centro, 'AUTO', { googleKey: 'x', pedir: pedir as unknown as typeof fetch });
    expect(r).toMatchObject({ idaMin: 7, vueltaMin: 9, km: 4.6, fuente: 'osrm', estimado: false });

    const caido = jest.fn(async () => {
      throw new Error('sin red');
    });
    const a = await calcularRuta(oficina, centro, 'TRANSPORTE', { pedir: caido as unknown as typeof fetch });
    expect(a.fuente).toBe('aproximado');
  });
});
