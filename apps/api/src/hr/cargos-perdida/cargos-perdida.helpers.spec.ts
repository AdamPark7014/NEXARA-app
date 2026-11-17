import { planCuotasCargoPerdida, topeSemanalArt110 } from './cargos-perdida.helpers.js';

describe('cargos-perdida.helpers', () => {
  it('respeta tope semanal 30% del excedente y tope de un mes', () => {
    const sueldoSemanal = 3500;
    const tope = topeSemanalArt110(sueldoSemanal);
    expect(tope).toBeGreaterThan(0);
    const plan = planCuotasCargoPerdida({
      montoTotal: 5000,
      sueldoSemanal,
      semanaInicio: '2026-11-16',
    });
    expect(plan.cuotas.length).toBeGreaterThan(1);
    expect(plan.cuotas.every((c) => c.monto <= plan.topeSemanal + 0.001)).toBe(true);
    const suma = plan.cuotas.reduce((a, c) => a + c.monto, 0);
    expect(Math.abs(suma - 5000)).toBeLessThan(0.02);
  });

  it('rechaza monto mayor a un mes de salario', () => {
    expect(() =>
      planCuotasCargoPerdida({ montoTotal: 999999, sueldoSemanal: 2000, semanaInicio: '2026-11-16' }),
    ).toThrow(/mes de salario/i);
  });
});
