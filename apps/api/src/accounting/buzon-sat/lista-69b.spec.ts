import { parsearCsv69B, normalizarRfc } from './lista-69b';

describe('parsearCsv69B', () => {
  it('lee CSV con encabezados y deduplica preferiendo DEFINITIVO', () => {
    const csv = [
      'RFC,Nombre,Situacion',
      'XAXX010101000,Uno,Presunto',
      'XAXX010101000,Uno SA,Definitivo',
      'ABC,malo,Presunto',
      'ABCU890101XXX,Dos,Presunto',
    ].join('\n');
    const r = parsearCsv69B(csv);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.rfc === 'XAXX010101000')?.tipo).toBe('DEFINITIVO');
    expect(r.find((x) => x.rfc === 'ABCU890101XXX')?.tipo).toBe('PRESUNTO');
  });

  it('normalizarRfc', () => {
    expect(normalizarRfc(' abc-890101-xxx ')).toBe('ABC890101XXX');
  });
});
