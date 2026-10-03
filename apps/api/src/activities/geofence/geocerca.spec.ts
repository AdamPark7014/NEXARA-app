import { RADIO_ACTIVIDAD_M, distanciaM, fueraDeZona, mensajeSalidaFueraDeZona, puntoReal } from './geocerca';

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
  });
});
