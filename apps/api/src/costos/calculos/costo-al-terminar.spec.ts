import { estimarCostoAlTerminar } from './costo-al-terminar';

describe('costo al terminar', () => {
  it('proyecta el costo real entre la fracción del avance calculado', () => {
    expect(estimarCostoAlTerminar(1250, 25, false)).toBe(5000);
    expect(estimarCostoAlTerminar(1250, 100, false)).toBe(1250);
    expect(estimarCostoAlTerminar(0, 30, false)).toBe(0);
  });
  it.each([null, 0, -1, 101, NaN, Infinity])('no inventa proyección con avance %s', (avance) => {
    expect(estimarCostoAlTerminar(100, avance, false)).toBeNull();
  });
  it('un proyecto incompleto nunca tiene proyección aunque haya avance', () => {
    expect(estimarCostoAlTerminar(100, 50, true)).toBeNull();
  });
  it.each([-1, NaN, Infinity])('rechaza costo inválido %s', (real) => {
    expect(estimarCostoAlTerminar(real, 50, false)).toBeNull();
  });
});
