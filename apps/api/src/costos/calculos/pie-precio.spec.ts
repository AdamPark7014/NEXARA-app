import { financiamiento, piePrecio, utilidadSobreCosto } from './pie-precio';

describe('pie de precio (caso hecho a mano)', () => {
  it('directo 1,000 con 15 %, 2 %, 10 % y 0.5 %', () => {
    const p = piePrecio(1000, { indirecto: 0.15, financiamiento: 0.02, utilidad: 0.1, cargos: 0.005 });
    expect(p.ci).toBe(150);
    expect(p.cf).toBe(23);
    expect(p.cu).toBe(117.3);
    expect(p.pv).toBe(1290.3);
    // 1,290.30 ÷ 0.995
    expect(p.pu).toBe(1296.78);
    expect(p.ca).toBe(6.48);
    expect(p.factor).toBe(1.2968);
  });

  it('para clientes privados los cargos son cero', () => {
    const p = piePrecio(1000, { indirecto: 0.15, financiamiento: 0.02, utilidad: 0.1 });
    expect(p.ca).toBe(0);
    expect(p.pu).toBe(p.pv);
  });

  it('la matriz de la cámara del mockup: directo 2,835.30 da 3,674.41', () => {
    const p = piePrecio(2835.3, { indirecto: 0.14, financiamiento: 0.015, utilidad: 0.12 });
    expect(p.ci).toBe(396.94);
    expect(p.cf).toBe(48.48);
    expect(p.cu).toBe(393.69);
    expect(p.pu).toBe(3674.41);
  });

  it('sin costo directo el factor es cero, no NaN', () => {
    expect(piePrecio(0, { indirecto: 0.1, financiamiento: 0, utilidad: 0 }).factor).toBe(0);
  });
});

describe('utilidad sobre el costo', () => {
  it('precio 3,400 sobre costo 3,280.72 deja 3.64 %', () => {
    expect(utilidadSobreCosto(3400, 3280.72)).toBe(0.0364);
  });

  it('sin costo no hay porcentaje', () => {
    expect(utilidadSobreCosto(100, 0)).toBeNull();
  });
});

describe('financiamiento (caso hecho a mano)', () => {
  it('egresos 50,000 y 50,000, anticipo 30 %, cobro en el mes 3, 18 % anual, utilidad 12 %', () => {
    const f = financiamiento({
      egresos: [50_000, 50_000],
      anticipo: 0.3,
      periodoCobro: 3,
      tasaAnual: 0.18,
      utilidad: 0.12,
    });
    expect(f.porcentaje).toBe(0.022);
    expect(f.vueltas).toBe(3);
    expect(f.saldos).toHaveLength(4);
    expect(f.saldos[1]).toBeLessThan(0);
    expect(f.saldos[3]).toBeGreaterThan(0);
  });

  it('con anticipo que cubre todo no hay interés', () => {
    const f = financiamiento({ egresos: [100], anticipo: 1, periodoCobro: 0, tasaAnual: 0.18, utilidad: 0.1 });
    expect(f.porcentaje).toBe(0);
  });

  it('sin egresos no hay nada que financiar', () => {
    expect(financiamiento({ egresos: [], anticipo: 0, periodoCobro: 0, tasaAnual: 0.1, utilidad: 0 }).porcentaje).toBe(0);
  });
});
