import { periodosBuzonDiario, interruptorActivo } from './periodo-buzon';

describe('periodosBuzonDiario', () => {
  it('pide los ultimos 3 dias', () => {
    const p = periodosBuzonDiario(new Date('2026-11-17T12:00:00-06:00'));
    expect(p).toEqual([{ desde: '2026-11-15', hasta: '2026-11-17', motivo: 'ultimos_3_dias' }]);
  });
  it('el dia 1 tambien pide el mes anterior', () => {
    const p = periodosBuzonDiario(new Date('2026-11-01T12:00:00-06:00'));
    expect(p).toHaveLength(2);
    expect(p[0].motivo).toBe('ultimos_3_dias');
    expect(p[1]).toEqual({ desde: '2026-10-01', hasta: '2026-10-31', motivo: 'mes_anterior' });
  });
});

describe('interruptorActivo', () => {
  const prev = process.env.BUZON_SAT_AUTO;
  afterEach(() => {
    if (prev === undefined) delete process.env.BUZON_SAT_AUTO;
    else process.env.BUZON_SAT_AUTO = prev;
  });
  it('por omision true', () => {
    delete process.env.BUZON_SAT_AUTO;
    expect(interruptorActivo('BUZON_SAT_AUTO')).toBe(true);
  });
  it('respeta false', () => {
    process.env.BUZON_SAT_AUTO = '0';
    expect(interruptorActivo('BUZON_SAT_AUTO')).toBe(false);
  });
});