import { ineficienciaPorEstimados, productividadDia } from './productividad';

describe('productividadDia', () => {
  it('tres ejes visibles sin compensar en silencio', () => {
    const p = productividadDia({
      minutosLaborados: 460,
      minutosProductivos: 370,
      retardoMin: 20,
      jornadaCitadaMin: 480,
      actividades: [
        { realMin: 120, estimadoMin: 60, titulo: 'A' },
        { realMin: 50, estimadoMin: 50, titulo: 'B' },
      ],
      pesos: { puntualidad: 0.3, aprovechamiento: 0.4, eficiencia: 0.3 },
    });
    expect(p.puntualidad.pct).toBeLessThan(100);
    expect(p.aprovechamiento.pct).toBe(Math.round((370 / 460) * 100));
    expect(p.eficiencia.pct).toBeLessThan(100);
    expect(p.indice).toBeGreaterThan(0);
    expect(p.desglose).toMatch(/Laboro/);
    expect(p.capas.pagable.indice).toBe(p.indice);
  });

  it('ineficiencia tope 100% por actividad', () => {
    const r = ineficienciaPorEstimados([{ realMin: 300, estimadoMin: 60 }]);
    expect(r.media).toBe(1);
  });
});
