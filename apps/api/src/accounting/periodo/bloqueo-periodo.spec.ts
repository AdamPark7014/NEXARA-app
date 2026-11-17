import { normalizarModoBloqueo, puedeEscribirEnPeriodo } from './bloqueo-periodo';

describe('bloqueo-periodo', () => {
  it('normaliza suave/soft/duro/hard/abierto', () => {
    expect(normalizarModoBloqueo('suave')).toBe('suave');
    expect(normalizarModoBloqueo('soft')).toBe('suave');
    expect(normalizarModoBloqueo('duro')).toBe('duro');
    expect(normalizarModoBloqueo('hard')).toBe('duro');
    expect(normalizarModoBloqueo('abierto')).toBe('abierto');
  });

  it('isClosed sin raw → duro', () => {
    expect(normalizarModoBloqueo(null, true)).toBe('duro');
  });

  it('suave solo contadora', () => {
    expect(puedeEscribirEnPeriodo('suave', { esContadora: true }).permitido).toBe(true);
    expect(puedeEscribirEnPeriodo('suave', { esContadora: false }).permitido).toBe(false);
  });

  it('duro nadie', () => {
    expect(puedeEscribirEnPeriodo('duro', { esContadora: true }).permitido).toBe(false);
  });
});
