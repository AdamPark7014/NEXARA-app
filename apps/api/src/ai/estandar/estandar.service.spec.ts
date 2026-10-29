// Antes de los imports: en este repo `jest.mock` no se sube solo.
jest.mock('./rutas', () => ({
  ...jest.requireActual('./rutas'),
  calcularRuta: jest.fn(),
}));

import { EstandarService, CACHE_RUTA_TOPE } from './estandar.service.js';
import { calcularRuta } from './rutas.js';

const ruta = calcularRuta as jest.MockedFunction<typeof calcularRuta>;

describe('rutas del tiempo estándar', () => {
  beforeEach(() => {
    ruta.mockReset();
    ruta.mockImplementation(async (_o, _d, modo) => ({ idaMin: 25, vueltaMin: 25, km: 9, modo, fuente: 'osrm', estimado: false }));
  });

  it('sale de la oficina salvo que la actividad diga de dónde sale', async () => {
    const s = new EstandarService();
    const deOficina = await s.ruta({ lat: 19.05, lng: -98.2 });
    expect(ruta.mock.calls[0][0]).not.toEqual({ lat: 19.1, lng: -98.3 });
    const propio = await s.ruta({ lat: 19.05, lng: -98.2, origenLat: 19.1, origenLng: -98.3, origenNombre: 'Biblioteca Tlaxcala' });
    expect(ruta.mock.calls[1][0]).toEqual({ lat: 19.1, lng: -98.3 });
    expect(propio.origen).toBe('Biblioteca Tlaxcala');
    expect(deOficina.origen).not.toBe('Biblioteca Tlaxcala');
    // Sin nombre se dice «el punto de partida»; un origen fuera de rango es la oficina (ya guardada).
    expect((await s.ruta({ lat: 19.05, lng: -98.2, origenLat: 19.2, origenLng: -98.1 })).origen).toBe('el punto de partida');
    await s.ruta({ lat: 19.05, lng: -98.2, origenLat: 95, origenLng: -98.1 });
    expect(ruta).toHaveBeenCalledTimes(3);
  });

  it('la caché tiene tope y reusa lo guardado', async () => {
    const s = new EstandarService();
    for (let i = 0; i < CACHE_RUTA_TOPE + 20; i++) await s.ruta({ lat: 19 + i * 0.01, lng: -98.2 });
    expect(s.rutasGuardadas).toBe(CACHE_RUTA_TOPE);
    const llamadas = ruta.mock.calls.length;
    await s.ruta({ lat: 19 + (CACHE_RUTA_TOPE + 19) * 0.01, lng: -98.2 });
    expect(ruta.mock.calls.length).toBe(llamadas);
    // La primera ya salió: se vuelve a pedir.
    await s.ruta({ lat: 19, lng: -98.2 });
    expect(ruta.mock.calls.length).toBe(llamadas + 1);
  });
});
