import { crucesSatLibros } from './cruces-sat';

describe('cruces-sat', () => {
  it('cfdi vigente sin póliza', () => {
    const alertas = crucesSatLibros(
      [{ id: 1, uuid: 'a', total: 100, estatusSat: 'vigente', journalEntryId: null }],
      [],
    );
    expect(alertas.some((a) => a.tipo === 'cfdi_sin_poliza')).toBe(true);
  });

  it('póliza sin uuid', () => {
    const alertas = crucesSatLibros([], [{ id: 9, entryNumber: 'P-1', uuid: null, date: '2026-11-01' }]);
    expect(alertas.some((a) => a.tipo === 'poliza_sin_uuid' && a.id === 9)).toBe(true);
  });

  it('cfdi cancelado contabilizado', () => {
    const alertas = crucesSatLibros(
      [{ id: 2, uuid: 'b', total: 50, estatusSat: 'cancelado', journalEntryId: 3 }],
      [],
    );
    expect(alertas.some((a) => a.tipo === 'cfdi_cancelado_contabilizado')).toBe(true);
  });

  it('lista 69-B', () => {
    const alertas = crucesSatLibros(
      [{ id: 3, uuid: 'c', total: 10, estatusSat: 'vigente', journalEntryId: 1, lista69B: 'definitivo' }],
      [],
    );
    expect(alertas.some((a) => a.tipo === 'lista_69b')).toBe(true);
  });
});
