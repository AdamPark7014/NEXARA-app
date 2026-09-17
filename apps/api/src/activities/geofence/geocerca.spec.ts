import { RADIO_ACTIVIDAD_M, distanciaM, fueraDeZona, mensajeSalidaFueraDeZona, puntoReal } from './geocerca';

describe('geocerca de actividades', () => {
  const zocaloPuebla = { lat: 19.0414, lng: -98.2063 };

  it('mide en metros: ~0.001° de latitud son ~111 m', () => {
    const d = distanciaM(zocaloPuebla, { lat: 19.0424, lng: -98.2063 });
    expect(d).toBeGreaterThanOrEqual(109);
    expect(d).toBeLessThanOrEqual(113);
  });

  it('dentro del radio de 100 m no es fuera de zona; a 150 m sí', () => {
    expect(fueraDeZona(zocaloPuebla, { lat: 19.0419, lng: -98.2063 })).toBe(false); // ~55 m
    expect(fueraDeZona(zocaloPuebla, { lat: 19.04275, lng: -98.2063 })).toBe(true); // ~150 m
    expect(RADIO_ACTIVIDAD_M).toBe(100);
  });

  it('descarta el (0,0) y coordenadas fuera de rango', () => {
    expect(puntoReal(0, 0)).toBeNull();
    expect(puntoReal(91, 10)).toBeNull();
    expect(puntoReal('19.04', '-98.2')).toEqual({ lat: 19.04, lng: -98.2 });
  });

  it('el mensaje dice la distancia y el máximo', () => {
    expect(mensajeSalidaFueraDeZona(245)).toContain('245 m');
    expect(mensajeSalidaFueraDeZona(245)).toContain('100 m');
  });
});
