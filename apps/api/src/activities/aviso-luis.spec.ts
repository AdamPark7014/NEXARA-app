import { esActividadNoProgramada } from './aviso-luis.js';

describe('esActividadNoProgramada', () => {
  const ahora = new Date('2026-11-17T18:00:00.000Z');

  it('autoasignada avisa aunque la fecha sea otro día', () => {
    const r = esActividadNoProgramada({
      creadoPorId: 5,
      responsableId: 5,
      fechaInicio: '2026-11-20T15:00:00.000Z',
      ahora,
    });
    expect(r).toEqual({ avisar: true, motivo: 'autoasignada' });
  });

  it('mismo día civil en México avisa (aunque la asigne otro)', () => {
    const r = esActividadNoProgramada({
      creadoPorId: 1,
      responsableId: 5,
      fechaInicio: '2026-11-17T16:00:00.000Z',
      ahora,
    });
    expect(r.avisar).toBe(true);
    expect(r.motivo).toBe('mismo_dia');
  });

  it('programada a futuro por otra persona no avisa', () => {
    const r = esActividadNoProgramada({
      creadoPorId: 1,
      responsableId: 5,
      fechaInicio: '2026-11-25T16:00:00.000Z',
      ahora,
    });
    expect(r).toEqual({ avisar: false, motivo: null });
  });
});
