import { armarMiCierre } from './mi-cierre';

describe('mi-cierre', () => {
  it('avance 100 cuando todo hecho', () => {
    const t = armarMiCierre({
      bancosConciliados: 2,
      bancosTotal: 2,
      cfdiSinPoliza: 0,
      cfdiRecibidosVigentes: 5,
      repPendientes: 0,
      repTotal: 3,
      diotPendiente: false,
      efos69b: 0,
    });
    expect(t.avancePct).toBe(100);
    expect(t.items.some((i) => i.id === 'efos')).toBe(true);
  });

  it('baja avance con pendientes', () => {
    const t = armarMiCierre({
      bancosConciliados: 0,
      bancosTotal: 1,
      cfdiSinPoliza: 2,
      cfdiRecibidosVigentes: 2,
      repPendientes: 1,
      repTotal: 1,
      diotPendiente: true,
      efos69b: 3,
    });
    expect(t.avancePct).toBeLessThan(100);
  });
});
