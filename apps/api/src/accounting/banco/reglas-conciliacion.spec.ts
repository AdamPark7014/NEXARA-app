import { aplicarReglaConcepto, topPropuestas, puntuarCandidato } from './reglas-conciliacion';

describe('reglas-conciliacion', () => {
  it('aplica regla por concepto', () => {
    const r = aplicarReglaConcepto('SPEI GASOLINA PEMEX', [
      { contiene: 'gasolina', cuentaCodigo: '601.01', activa: true },
    ]);
    expect(r?.cuentaCodigo).toBe('601.01');
  });

  it('puntúa monto y fecha exactos alto', () => {
    const p = puntuarCandidato(
      { id: 1, date: '2026-11-10', amount: 1000, isDebit: true, description: 'FAC-1', reference: 'FAC-1' },
      { id: 2, kind: 'INVOICE', folio: 'FAC-1', date: '2026-11-10', amount: 1000 },
    );
    expect(p.score).toBeGreaterThanOrEqual(70);
  });

  it('topPropuestas máximo 3', () => {
    const mov = { id: 1, date: '2026-11-10', amount: 100, isDebit: true, description: 'x' };
    const cands = [1, 2, 3, 4].map((id) => ({
      id,
      kind: 'INVOICE' as const,
      folio: `F${id}`,
      date: '2026-11-10',
      amount: 100,
    }));
    expect(topPropuestas(mov, cands, 3)).toHaveLength(3);
  });
});
