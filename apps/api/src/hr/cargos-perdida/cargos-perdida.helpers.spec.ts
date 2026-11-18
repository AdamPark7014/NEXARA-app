import { planCuotasCargoPerdida, topeSemanalArt110, sueldoMensualDeSemanal } from './cargos-perdida.helpers.js';

describe('cargos-perdida.helpers', () => {
  it('usa el mínimo general 2026 y trunca el límite a centavos', () => {
    expect(topeSemanalArt110(3500)).toBe(388.41);
    expect(topeSemanalArt110(2205.28)).toBe(0);
    expect(sueldoMensualDeSemanal(3500)).toBe(15000);
  });
  it.each(['2026-02-30', '2026-11-17', 'no-fecha'])('rechaza semana inválida %s', semanaInicio => {
    expect(() => planCuotasCargoPerdida({ montoTotal: 100, sueldoSemanal: 3500, semanaInicio })).toThrow();
  });
  it('no devuelve planes truncados ni importes inferiores a un centavo', () => {
    expect(() => planCuotasCargoPerdida({ montoTotal: 1000, sueldoSemanal: 2205.32, semanaInicio: '2026-11-16' })).toThrow('520');
    expect(() => planCuotasCargoPerdida({ montoTotal: 0.001, sueldoSemanal: 3500, semanaInicio: '2026-11-16' })).toThrow();
  });
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
