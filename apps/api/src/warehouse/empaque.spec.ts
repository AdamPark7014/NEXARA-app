import {
  EmpaqueInvalidoError,
  buscarEmpaque,
  convertirCaptura,
  empaqueDeCompra,
  etiquetaCantidad,
  type Empaque,
} from './empaque.js';

const CAJA: Empaque = { id: 1, nombre: 'Caja', piezasPorUnidad: 100, esDefaultCompra: true };
const BOLSA: Empaque = { id: 2, nombre: 'Bolsa', piezasPorUnidad: 12 };
const EMPAQUES = [CAJA, BOLSA];

describe('buscarEmpaque', () => {
  it('encuentra por id', () => {
    expect(buscarEmpaque(EMPAQUES, { packagingId: 2 })).toBe(BOLSA);
  });

  it('encuentra por nombre sin importar acentos ni mayúsculas', () => {
    expect(buscarEmpaque(EMPAQUES, { unidadCaptura: '  cAjA ' })).toBe(CAJA);
  });

  it('el id manda sobre el nombre', () => {
    expect(buscarEmpaque(EMPAQUES, { packagingId: 1, unidadCaptura: 'Bolsa' })).toBe(CAJA);
  });

  it('sin coincidencia devuelve null', () => {
    expect(buscarEmpaque(EMPAQUES, { unidadCaptura: 'Tarima' })).toBeNull();
  });
});

describe('empaqueDeCompra', () => {
  it('prefiere la marcada por defecto', () => {
    expect(empaqueDeCompra(EMPAQUES)).toBe(CAJA);
  });

  it('sin marca toma la presentación más grande', () => {
    expect(empaqueDeCompra([BOLSA, { nombre: 'Rollo', piezasPorUnidad: 305 }])?.nombre).toBe('Rollo');
  });

  it('sin presentaciones devuelve null', () => {
    expect(empaqueDeCompra([])).toBeNull();
  });
});

describe('convertirCaptura', () => {
  it('sin empaque respeta la cantidad en unidad base', () => {
    expect(convertirCaptura({ quantity: 24 }, EMPAQUES)).toEqual({
      quantity: 24,
      unidadCaptura: null,
      factorConversion: null,
      cantidadCapturada: null,
    });
  });

  it('con empaque multiplica y conserva lo tecleado', () => {
    expect(convertirCaptura({ packagingId: 1, cantidadCapturada: 3 }, EMPAQUES)).toEqual({
      quantity: 300,
      unidadCaptura: 'Caja',
      factorConversion: 100,
      cantidadCapturada: 3,
    });
  });

  it('acepta fracciones de presentación', () => {
    const res = convertirCaptura({ unidadCaptura: 'Bolsa', cantidadCapturada: 2.5 }, EMPAQUES);
    expect(res.quantity).toBe(30);
    expect(res.cantidadCapturada).toBe(2.5);
  });

  it('si mandan la cantidad en `quantity` con presentación, la toma como capturada', () => {
    expect(convertirCaptura({ unidadCaptura: 'Caja', quantity: 2 }, EMPAQUES).quantity).toBe(200);
  });

  it('rechaza una presentación que el producto no tiene, diciendo cuál', () => {
    expect(() => convertirCaptura({ unidadCaptura: 'Tarima', cantidadCapturada: 1 }, EMPAQUES)).toThrow(
      EmpaqueInvalidoError,
    );
    expect(() => convertirCaptura({ unidadCaptura: 'Tarima', cantidadCapturada: 1 }, EMPAQUES)).toThrow(
      /«Tarima»/,
    );
  });

  it('rechaza un factor inservible', () => {
    expect(() =>
      convertirCaptura({ unidadCaptura: 'Caja', cantidadCapturada: 1 }, [
        { nombre: 'Caja', piezasPorUnidad: 0 },
      ]),
    ).toThrow(/cuántas piezas trae/);
  });

  it('rechaza cantidad cero o negativa', () => {
    expect(() => convertirCaptura({ quantity: 0 }, EMPAQUES)).toThrow(/mayor a cero/);
    expect(() => convertirCaptura({ packagingId: 1, cantidadCapturada: -1 }, EMPAQUES)).toThrow(
      EmpaqueInvalidoError,
    );
  });
});

describe('etiquetaCantidad', () => {
  it('enseña las dos unidades', () => {
    expect(
      etiquetaCantidad({ quantity: 24, unidadCaptura: 'Caja', cantidadCapturada: 2 }, 'pz'),
    ).toBe('2 cajas · 24 pz');
  });

  it('en singular no pluraliza', () => {
    expect(
      etiquetaCantidad({ quantity: 100, unidadCaptura: 'Caja', cantidadCapturada: 1 }, 'pz'),
    ).toBe('1 caja · 100 pz');
  });

  it('pluraliza consonante final', () => {
    expect(
      etiquetaCantidad({ quantity: 610, unidadCaptura: 'Rollo', cantidadCapturada: 2 }, 'm'),
    ).toBe('2 rollos · 610 m');
    expect(
      etiquetaCantidad({ quantity: 3, unidadCaptura: 'Par', cantidadCapturada: 3 }, 'pz'),
    ).toBe('3 pares · 3 pz');
  });

  it('sin empaque enseña solo la unidad base', () => {
    expect(etiquetaCantidad({ quantity: 24 }, 'pz')).toBe('24 pz');
  });

  it('no arrastra decimales de adorno', () => {
    expect(etiquetaCantidad({ quantity: 12.5 }, 'm')).toBe('12.5 m');
  });
});
