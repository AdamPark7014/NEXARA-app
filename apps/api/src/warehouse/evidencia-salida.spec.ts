import {
  MAX_FOTOS_MOVIMIENTO,
  normalizarFotosMovimiento,
  normalizarSeries,
  resumenEvidenciaSalida,
  sumarEvidencia,
  validarSeriesContraCantidad,
} from './evidencia-salida.js';

describe('evidencia de un movimiento de almacén', () => {
  it('lee las series de una lista o de un texto con una por renglón, sin repetir', () => {
    expect(normalizarSeries(['ds-2cd1  a', 'DS-2CD1 A', ' k123 '])).toEqual(['DS-2CD1 A', 'K123']);
    expect(normalizarSeries('aa1\nbb2, cc3;aa1\r\n')).toEqual(['AA1', 'BB2', 'CC3']);
    expect(normalizarSeries(undefined)).toEqual([]);
    expect(normalizarSeries(42)).toEqual([]);
  });

  it('descarta una serie imposible de larga', () => {
    expect(normalizarSeries(['A'.repeat(81), 'OK1'])).toEqual(['OK1']);
  });

  it('no deja más series que piezas', () => {
    expect(() => validarSeriesContraCantidad(['A', 'B', 'C'], 2)).toThrow(/3 números de serie.*2 pieza/);
    expect(() => validarSeriesContraCantidad(['A', 'B'], 2)).not.toThrow();
    expect(() => validarSeriesContraCantidad([], 0)).not.toThrow();
  });

  it('las fotos van sin base64, sin repetir y con tope', () => {
    const muchas = Array.from({ length: 20 }, (_, i) => ({ url: `/uploads/almacen/${i}.jpg` }));
    expect(normalizarFotosMovimiento(muchas)).toHaveLength(MAX_FOTOS_MOVIMIENTO);
    expect(
      normalizarFotosMovimiento([{ url: '/a.jpg' }, '/a.jpg', { url: 'data:image/png;base64,AAAA' }, null]),
    ).toEqual([{ url: '/a.jpg' }]);
  });

  it('agregar evidencia suma a la que había', () => {
    const r = sumarEvidencia(
      { fotos: [{ url: '/a.jpg' }], series: ['S1'] },
      { fotos: [{ url: '/b.jpg' }, { url: '/a.jpg' }], series: 's2\ns1' },
    );
    expect(r.fotos.map((f) => f.url)).toEqual(['/a.jpg', '/b.jpg']);
    expect(r.series).toEqual(['S1', 'S2']);
  });

  it('el resumen marca lo que le falta a una salida y no molesta a una entrada', () => {
    expect(resumenEvidenciaSalida({ type: 'DISPATCH' })).toMatchObject({
      sinFoto: true,
      sinResponsable: true,
      sinLigar: true,
    });
    expect(
      resumenEvidenciaSalida({
        type: 'DISPATCH',
        fotos: [{ url: '/a.jpg' }],
        series: ['S1'],
        recibidoPorId: 4,
        activityId: 9,
      }),
    ).toMatchObject({ fotos: 1, series: 1, sinFoto: false, sinResponsable: false, sinLigar: false });
    expect(resumenEvidenciaSalida({ type: 'RECEIPT' })).toMatchObject({
      esSalida: false,
      sinFoto: false,
      sinResponsable: false,
      sinLigar: false,
    });
  });
});
