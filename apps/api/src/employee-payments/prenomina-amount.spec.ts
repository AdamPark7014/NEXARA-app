import {
  calculatePrenominaAmount,
  minutosExtraLft,
  OT_MULTIPLIER,
  pagoExtraLft,
  roundMoney,
} from './prenomina-amount';

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

describe('extra y tope de lo ordinario (LFT arts. 67–68; Adam, 29-10)', () => {
  const rate = 4000 / (5 * 480);
  const SEMANA = 5 * 480;

  it('semana de 50 h sin nada aprobado: se pagan las 40 h de su horario, no 50', () => {
    const r = calculatePrenominaAmount({ sueldoSemanal: 4000, minutosLaborados: 50 * 60, minutosExtraAprobados: 0, minutosEsperados: SEMANA });
    expect(r.minutosOrdinarios).toBe(SEMANA);
    expect(r.suggestedAmount).toBe(4000);
  });

  it('semana de 50 h con las 10 h aprobadas: 40 h ordinarias + 9 h al doble + 1 h al triple', () => {
    const r = calculatePrenominaAmount({ sueldoSemanal: 4000, minutosLaborados: 50 * 60, minutosExtraAprobados: 600, minutosEsperados: SEMANA });
    expect(r.minutosOrdinarios).toBe(SEMANA);
    expect(r.suggestedAmount).toBe(roundMoney(SEMANA * rate + 540 * rate * 2 + 60 * rate * 3));
  });

  it('12 h de extra en la semana: 9 h al doble y 3 h al triple', () => {
    expect(minutosExtraLft(12 * 60)).toEqual({ dobles: 540, triples: 180 });
    expect(roundMoney(pagoExtraLft(12 * 60, 1))).toBe(540 * 2 + 180 * 3);
    // En dos semanas, el tope del doble es de 18 h.
    expect(minutosExtraLft(12 * 60, 2)).toEqual({ dobles: 720, triples: 0 });
  });

  it('faltó un día pero tiene extra aprobada otro: la extra se paga como extra', () => {
    const r = calculatePrenominaAmount({ sueldoSemanal: 4000, minutosLaborados: 38 * 60, minutosExtraAprobados: 120, minutosEsperados: SEMANA });
    expect(r.minutosOrdinarios).toBe(36 * 60);
    expect(r.suggestedAmount).toBe(roundMoney(36 * 60 * rate + 120 * rate * 2));
  });

  it('el alias viejo sigue siendo el doble', () => {
    expect(OT_MULTIPLIER).toBe(2);
  });
});
