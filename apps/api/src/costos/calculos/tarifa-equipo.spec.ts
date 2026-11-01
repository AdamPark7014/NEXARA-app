import { tarifaEquipo } from './tarifa-equipo';

describe('tarifa de equipo (casos hechos a mano)', () => {
  it('camioneta: $7.31 por km', () => {
    const t = tarifaEquipo({
      valor: 480_000,
      valorLlantas: 12_000,
      rescatePct: 0.3,
      vidaUnidades: 200_000,
      unidadesAnio: 30_000,
      tasaInteres: 0.12,
      primaSeguro: 0.04,
      ko: 0.6,
      rendimiento: 9,
      precioCombustible: 24.5,
      costoAceite: 1200,
      aceiteCadaUnidades: 10_000,
      vidaLlantasUnidades: 50_000,
    });
    // Vm = 468,000; Vr = 144,000. D = 324,000 ÷ 200,000. Im = 612,000 × 0.12 ÷ 60,000.
    expect(t.d).toBe(1.62);
    expect(t.im).toBe(1.224);
    expect(t.sm).toBe(0.408);
    expect(t.mn).toBe(0.972);
    expect(t.co).toBe(2.7222);
    expect(t.lb).toBe(0.12);
    expect(t.n).toBe(0.24);
    expect(t.fijos).toBe(4.224);
    expect(t.consumos).toBe(3.0822);
    expect(t.total).toBe(7.31);
  });

  it('OTDR: $194.40 por día', () => {
    const t = tarifaEquipo({ valor: 90_000, rescatePct: 0.1, vidaUnidades: 500, unidadesAnio: 100, ko: 0.2 });
    expect(t.d).toBe(162);
    expect(t.mn).toBe(32.4);
    expect(t.total).toBe(194.4);
  });

  it('los gastos fijos que no están en el Reglamento se reparten entre las unidades del año', () => {
    const t = tarifaEquipo({ valor: 0, vidaUnidades: 1, unidadesAnio: 30_000, otrosAnuales: 6_000 });
    expect(t.otros).toBe(0.2);
    expect(t.total).toBe(0.2);
  });

  it('sin vida ni uso capturados no truena: da cero', () => {
    const t = tarifaEquipo({ valor: 100_000, vidaUnidades: 0, unidadesAnio: 0, tasaInteres: 0.1 });
    expect(t.total).toBe(0);
  });

  it('el rescate nunca hace negativa la depreciación', () => {
    expect(tarifaEquipo({ valor: 100, rescatePct: 2, vidaUnidades: 10, unidadesAnio: 10 }).d).toBe(0);
  });
});
