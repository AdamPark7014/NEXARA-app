import { describe, expect, it } from 'vitest';
import { rangoDePresetContabilidad, fechaMx } from './contabilidad-fechas';

describe('rangoDePresetContabilidad', () => {
  const hoy = '2026-11-17'; // martes
  it('hoy y ayer', () => {
    expect(rangoDePresetContabilidad('hoy', hoy)).toEqual({ desde: '2026-11-17', hasta: '2026-11-17' });
    expect(rangoDePresetContabilidad('ayer', hoy)).toEqual({ desde: '2026-11-16', hasta: '2026-11-16' });
  });
  it('semana', () => {
    expect(rangoDePresetContabilidad('esta_semana', hoy)).toEqual({ desde: '2026-11-16', hasta: '2026-11-17' });
    expect(rangoDePresetContabilidad('semana_pasada', hoy)).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
  });
  it('mes', () => {
    expect(rangoDePresetContabilidad('este_mes', hoy)).toEqual({ desde: '2026-11-01', hasta: '2026-11-17' });
    expect(rangoDePresetContabilidad('mes_pasado', hoy)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
  });
  it('trimestre y anio', () => {
    expect(rangoDePresetContabilidad('este_trimestre', hoy)).toEqual({ desde: '2026-10-01', hasta: '2026-11-17' });
    expect(rangoDePresetContabilidad('trimestre_pasado', hoy)).toEqual({ desde: '2026-07-01', hasta: '2026-09-30' });
    expect(rangoDePresetContabilidad('este_anio', hoy)).toEqual({ desde: '2026-01-01', hasta: '2026-11-17' });
    expect(rangoDePresetContabilidad('anio_pasado', hoy)).toEqual({ desde: '2025-01-01', hasta: '2025-12-31' });
  });
  it('fechaMx devuelve AAAA-MM-DD', () => {
    expect(fechaMx(new Date('2026-11-17T18:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});