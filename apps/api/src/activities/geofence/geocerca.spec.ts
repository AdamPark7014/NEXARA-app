import {
  RADIO_ACTIVIDAD_M,
  distanciaM,
  fueraDeZona,
  mensajeSalidaFueraDeZona,
  puntoReal,
  salidaDeZonaJustificada,
} from './geocerca';

describe('geocerca de actividades', () => {
  const zocaloPuebla = { lat: 19.0414, lng: -98.2063 };

  it('mide en metros: ~0.001° de latitud son ~111 m', () => {
    const d = distanciaM(zocaloPuebla, { lat: 19.0424, lng: -98.2063 });
    expect(d).toBeGreaterThanOrEqual(109);
    expect(d).toBeLessThanOrEqual(113);
  });

  it('el radio es de 500 m: un sitio grande cabe completo', () => {
    expect(RADIO_ACTIVIDAD_M).toBe(500);
    expect(fueraDeZona(zocaloPuebla, { lat: 19.04275, lng: -98.2063 })).toBe(false); // ~150 m: con 100 m ya era fuera
    expect(fueraDeZona(zocaloPuebla, { lat: 19.0454, lng: -98.2063 })).toBe(false); // ~445 m
    expect(fueraDeZona(zocaloPuebla, { lat: 19.04725, lng: -98.2063 })).toBe(true); // ~650 m
  });

  it('descarta el (0,0) y coordenadas fuera de rango', () => {
    expect(puntoReal(0, 0)).toBeNull();
    expect(puntoReal(91, 10)).toBeNull();
    expect(puntoReal('19.04', '-98.2')).toEqual({ lat: 19.04, lng: -98.2 });
  });

  it('el mensaje dice la distancia y el máximo', () => {
    expect(mensajeSalidaFueraDeZona(745)).toContain('745 m');
    expect(mensajeSalidaFueraDeZona(745)).toContain('500 m');
    // Web, Android e iOS repiten este texto tal cual.
    expect(mensajeSalidaFueraDeZona(745)).toBe(
      'La salida se registra donde iniciaste la actividad: estás a 745 m y el máximo es 500 m; regresa al punto de inicio o justifica tu salida de zona para tomar la foto de salida.',
    );
  });

  it('cuenta la salida de zona más reciente: justificada libera la foto de salida', () => {
    expect(salidaDeZonaJustificada([])).toBe(false);
    expect(salidaDeZonaJustificada([{ detectedAt: '2026-10-28T22:16:00Z', status: 'JUSTIFICADA' }])).toBe(true);
    expect(
      salidaDeZonaJustificada([
        { detectedAt: '2026-10-28T23:30:00Z', status: 'ABIERTA' },
        { detectedAt: '2026-10-28T22:16:00Z', status: 'JUSTIFICADA' },
      ]),
    ).toBe(false);
  });
});
