import {
  calculatePrenominaAmount,
  OT_MULTIPLIER,
  roundMoney,
} from './prenomina-amount.js';

describe('calculatePrenominaAmount', () => {
  it('null sueldo → suggestedAmount null', () => {
    const r = calculatePrenominaAmount({
      sueldoSemanal: null,
      minutosLaborados: 480,
      minutosExtraAprobados: 0,
    });
    expect(r.suggestedAmount).toBeNull();
    expect(r.minutosOrdinarios).toBe(480);
  });

  it('zero sueldo → suggestedAmount null', () => {
    const r = calculatePrenominaAmount({
      sueldoSemanal: 0,
      minutosLaborados: 480,
      minutosExtraAprobados: 0,
    });
    expect(r.suggestedAmount).toBeNull();
  });

  it('full ordinary week equals sueldoSemanal', () => {
    const r = calculatePrenominaAmount({
      sueldoSemanal: 5000,
      minutosLaborados: 5 * 480,
      minutosExtraAprobados: 0,
    });
    expect(r.suggestedAmount).toBe(5000);
  });

  it('one ordinary day is sueldoSemanal / 5', () => {
    const r = calculatePrenominaAmount({
      sueldoSemanal: 5000,
      minutosLaborados: 480,
      minutosExtraAprobados: 0,
    });
    expect(r.suggestedAmount).toBe(1000);
  });

  it('approved OT pays at OT_MULTIPLIER', () => {
    const rate = 5000 / (5 * 480);
    const r = calculatePrenominaAmount({
      sueldoSemanal: 5000,
      minutosLaborados: 540,
      minutosExtraAprobados: 60,
    });
    expect(r.suggestedAmount).toBe(roundMoney(480 * rate + 60 * rate * OT_MULTIPLIER));
    expect(r.minutosOrdinarios).toBe(480);
    expect(r.minutosExtraAprobados).toBe(60);
  });

  it('caps approved OT to laborados', () => {
    const rate = 5000 / (5 * 480);
    const r = calculatePrenominaAmount({
      sueldoSemanal: 5000,
      minutosLaborados: 400,
      minutosExtraAprobados: 600,
    });
    expect(r.minutosOrdinarios).toBe(0);
    expect(r.minutosExtraAprobados).toBe(400);
    expect(r.suggestedAmount).toBe(roundMoney(400 * rate * OT_MULTIPLIER));
  });

  it('negative minutes clamp to zero', () => {
    const r = calculatePrenominaAmount({
      sueldoSemanal: 5000,
      minutosLaborados: -100,
      minutosExtraAprobados: -20,
    });
    expect(r.minutosOrdinarios).toBe(0);
    expect(r.minutosExtraAprobados).toBe(0);
    expect(r.suggestedAmount).toBe(0);
  });
});
