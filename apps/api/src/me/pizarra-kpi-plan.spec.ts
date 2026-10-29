import { calculaActividad, kpisDePersona, minutosPlanDe } from './pizarra-kpi.js';

describe('plan de la eficiencia', () => {
  it('usa las horas de la persona y, sin ellas, el estimado de la actividad', () => {
    expect(minutosPlanDe(1.5, 300)).toBe(90);
    expect(minutosPlanDe(null, 300)).toBe(300);
    expect(minutosPlanDe(0, 120)).toBe(120);
    expect(minutosPlanDe(null, 0)).toBeNull();
    expect(minutosPlanDe(null, null)).toBeNull();
  });

  it('una cerrada solo con estimado ya cuenta en la eficiencia', () => {
    const ahora = new Date('2026-10-28T23:00:00Z');
    const a = calculaActividad(
      {
        estatus: 'Finalizada',
        terminada: true,
        minutosPlan: minutosPlanDe(null, 120),
        inicio: new Date('2026-10-28T16:00:00Z'),
        fin: new Date('2026-10-28T18:30:00Z'),
      } as Parameters<typeof calculaActividad>[0],
      ahora,
    );
    expect(kpisDePersona([a], 480).eficienciaPct).toBe(80);
  });
});
