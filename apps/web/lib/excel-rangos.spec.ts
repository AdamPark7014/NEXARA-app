import { describe, expect, it } from 'vitest';
import { filtrarPorRangoFecha, rangoDePresetExcel } from './excel-rangos';

describe('excel-rangos', () => {
  it('calcula semana pasada desde un lunes', () => {
    const r = rangoDePresetExcel('semana_pasada', '2026-11-16');
    expect(r.desde).toBe('2026-11-09');
    expect(r.hasta).toBe('2026-11-15');
  });

  it('filtra por rango inclusivo', () => {
    const rows = [{ f: '2026-11-10' }, { f: '2026-11-16' }, { f: '2026-10-01' }];
    const out = filtrarPorRangoFecha(rows, (x) => x.f, { desde: '2026-11-01', hasta: '2026-11-15' });
    expect(out.map((x) => x.f)).toEqual(['2026-11-10']);
  });
});
