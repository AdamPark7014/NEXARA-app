import {
  tipoDescuentoArt110Permitido,
  validarCreacion,
  validarSuspensionDias,
} from './medidas-disciplinarias.helpers.js';

describe('medidas-disciplinarias.helpers', () => {
  it('rechaza multas y exige hechos', () => {
    expect(() => validarCreacion({ tipo: 'MULTA', hechos: 'demasiado corto' })).toThrow(/107|hechos|multa/i);
    expect(() =>
      validarCreacion({ tipo: 'AMONESTACION_VERBAL', hechos: 'Hechos claros del incidente laboral' }),
    ).not.toThrow();
  });

  it('valida suspensión 1-8 y avisa sin reglamento', () => {
    expect(() => validarSuspensionDias(0)).toThrow();
    expect(() => validarSuspensionDias(9)).toThrow();
    const r = validarCreacion({
      tipo: 'SUSPENSION',
      hechos: 'Falta grave documentada en el expediente',
      diasSuspension: 3,
      reglamentoInteriorCargado: false,
    });
    expect(r.diasSuspension).toBe(3);
    expect(r.avisoReglamento).toMatch(/reglamento/i);
  });

  it('solo admite descuentos del art. 110', () => {
    expect(tipoDescuentoArt110Permitido('anticipo')).toBe(true);
    expect(tipoDescuentoArt110Permitido('multa_castigo')).toBe(false);
    expect(tipoDescuentoArt110Permitido('multa_transito_vehiculo')).toBe(true);
  });
});
