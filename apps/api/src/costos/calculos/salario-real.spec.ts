import {
  aniosCumplidos,
  costoHora,
  diasHabilesDelAnio,
  factorSalarioReal,
  vacacionesPorAntiguedad,
} from './salario-real';

const BASE = { vacacionesDias: 12, otrosDias: 3, aguinaldoDias: 15, primaVacacional: 0.25, ps: 0.25 };

describe('factor de salario real (casos hechos a mano)', () => {
  it('2026, lunes a viernes: 261 hábiles, 7 festivos entre semana', () => {
    const r = factorSalarioReal({ anio: 2026, ...BASE });
    expect(r.diasHabiles).toBe(261);
    expect(r.festivosEnDiaHabil).toBe(7);
    // Tp = 365 + 15 + 12 × 0.25 = 383. Tl = 261 − 7 − 12 − 3 = 239.
    expect(r.tp).toBe(383);
    expect(r.tl).toBe(239);
    expect(r.tpTl).toBe(1.6025);
    // 0.25 × 1.60251 + 1.60251 = 2.00314
    expect(r.fsr).toBe(2.0031);
  });

  it('2027: el 1 de mayo y el 25 de diciembre caen en sábado', () => {
    const r = factorSalarioReal({ anio: 2027, ...BASE });
    expect(r.festivosEnDiaHabil).toBe(5);
    expect(r.tl).toBe(241);
    expect(r.fsr).toBe(1.9865);
  });

  it('sin cuotas el factor es solo días pagados entre trabajados', () => {
    expect(factorSalarioReal({ anio: 2026, ...BASE, ps: 0 }).fsr).toBe(1.6025);
  });

  it('quien trabaja también el sábado tiene más días trabajados y un factor menor', () => {
    const sabados = factorSalarioReal({ anio: 2026, ...BASE, diasLaborables: [1, 2, 3, 4, 5, 6] });
    expect(diasHabilesDelAnio(2026, [1, 2, 3, 4, 5, 6])).toBe(313);
    expect(sabados.tl).toBe(313 - 7 - 12 - 3);
    expect(sabados.fsr).toBeLessThan(2.0031);
  });

  it('año bisiesto: Tp cuenta 366 días', () => {
    expect(factorSalarioReal({ anio: 2028, ...BASE }).tp).toBe(384);
  });
});

describe('costo por hora', () => {
  it('$3,500 a la semana con factor 2.0031 no cuesta $87.50, cuesta $125.19', () => {
    // 3500 ÷ 7 = 500; 500 × 2.0031 = 1,001.55; ÷ 8 = 125.19
    expect(costoHora(3500, 2.0031)).toBe(125.19);
  });

  it('sin sueldo no hay costo', () => {
    expect(costoHora(0, 2)).toBe(0);
    expect(costoHora(Number.NaN, 2)).toBe(0);
  });
});

describe('vacaciones por antigüedad (LFT art. 76)', () => {
  it.each([
    [0, 12],
    [1, 12],
    [2, 14],
    [3, 16],
    [4, 18],
    [5, 20],
    [6, 22],
    [10, 22],
    [11, 24],
    [15, 24],
    [16, 26],
  ])('%i años → %i días', (anios, dias) => {
    expect(vacacionesPorAntiguedad(anios)).toBe(dias);
  });
});

describe('años cumplidos', () => {
  it('no cuenta el año hasta cumplirlo', () => {
    expect(aniosCumplidos('2024-11-15', new Date('2026-11-14T12:00:00Z'))).toBe(1);
    expect(aniosCumplidos('2024-11-15', new Date('2026-11-15T12:00:00Z'))).toBe(2);
  });

  it('sin fecha, null', () => {
    expect(aniosCumplidos(null, new Date())).toBeNull();
  });
});
