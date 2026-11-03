import { debePreguntarTiempo, finDeSesiones, motivoParaNoDecir } from './tiempo-dicho';

const ahora = new Date('2026-11-10T18:00:00Z');
const base = { estatus: 'Por Validar', ahora };

describe('cuánto tomó de verdad', () => {
  it('solo al terminar, en lo de un solo momento y hasta 7 días después', () => {
    expect(motivoParaNoDecir(base)).toBeNull();
    expect(motivoParaNoDecir({ ...base, estatus: 'Finalizada' })).toBeNull();
    expect(motivoParaNoDecir({ ...base, estatus: 'En Proceso' })).toMatch(/al terminar/);
    expect(motivoParaNoDecir({ ...base, estatus: 'Cancelada' })).toMatch(/al terminar/);
    expect(motivoParaNoDecir({ ...base, periodoInicio: '2026-11-01', periodoFin: '2026-11-05' })).toMatch(/varios días/);
    expect(motivoParaNoDecir({ ...base, terminadaEn: new Date('2026-11-04T18:00:00Z') })).toBeNull();
    expect(motivoParaNoDecir({ ...base, terminadaEn: new Date('2026-11-03T17:00:00Z') })).toMatch(/7 días/);
  });

  it('el fin es el último reloj, si ya pararon todos', () => {
    const a = new Date('2026-11-04T18:00:00Z');
    const b = new Date('2026-11-05T18:00:00Z');
    expect(finDeSesiones([{ endedAt: a }, { endedAt: b }])).toEqual(b);
    expect(finDeSesiones([{ endedAt: a }, { endedAt: null }])).toBeNull();
    expect(finDeSesiones([])).toBeNull();
  });

  it('se pregunta con un reloj largo o que se aleja de lo planeado', () => {
    expect(debePreguntarTiempo({ ...base, relojMin: 370, planMin: 360 })).toBe(true);
    expect(debePreguntarTiempo({ ...base, relojMin: 100, planMin: 60 })).toBe(true);
    expect(debePreguntarTiempo({ ...base, relojMin: 20, planMin: 60 })).toBe(true);
  });

  it('no se pregunta si cuadra, si ya dijo, sin reloj o cuando ya no se puede', () => {
    expect(debePreguntarTiempo({ ...base, relojMin: 60, planMin: 60 })).toBe(false);
    expect(debePreguntarTiempo({ ...base, relojMin: 370, planMin: 360, dichoMin: 120 })).toBe(false);
    expect(debePreguntarTiempo({ ...base, relojMin: 2, planMin: 60 })).toBe(false);
    expect(debePreguntarTiempo({ ...base, relojMin: 60 })).toBe(false);
    expect(debePreguntarTiempo({ ...base, estatus: 'En Proceso', relojMin: 370 })).toBe(false);
  });
});
