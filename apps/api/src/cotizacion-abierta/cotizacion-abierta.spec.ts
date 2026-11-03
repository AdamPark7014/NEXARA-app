import { CotizacionCambio, estadoDelAcceso, mezclarPartidas, PartidaInvalida, partidaVisible } from './cotizacion-abierta';

const partida = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Cámara IP',
  unit: 'pieza',
  qty: 2,
  unitPrice: 1500,
  unitCost: 1000,
  marginPercent: 50,
  productCtId: 77,
  ieps: 8,
  ...over,
});

describe('quién sigue teniendo acceso', () => {
  it('abierto mientras su actividad siga abierta', () => {
    expect(estadoDelAcceso({ actividad: { estatus: 'En Proceso' } })).toBe('abierto');
    expect(estadoDelAcceso({ actividad: { estatus: 'Pendiente' } })).toBe('abierto');
  });

  it('se cierra sola al terminar, cancelar o borrar, y si se la quitan', () => {
    for (const estatus of ['Por Validar', 'Finalizada', 'Cancelada', 'No cumplida']) {
      expect(estadoDelAcceso({ actividad: { estatus } })).toBe('terminada');
    }
    expect(estadoDelAcceso({ actividad: { estatus: 'En Proceso', deletedAt: new Date() } })).toBe('terminada');
    expect(estadoDelAcceso({ revocadoAt: new Date(), actividad: { estatus: 'En Proceso' } })).toBe('revocado');
  });
});

describe('lo que ve', () => {
  it('solo concepto, unidad, cantidad y precio', () => {
    const v = partidaVisible(partida());
    expect(v).toEqual({ id: 1, name: 'Cámara IP', unit: 'pieza', qty: 2, unitPrice: 1500 });
    expect(Object.keys(v)).not.toEqual(expect.arrayContaining(['unitCost']));
    expect(JSON.stringify(v)).not.toMatch(/1000|marginPercent|productCtId/);
  });
});

describe('lo que se guarda', () => {
  it('cambiar la cantidad no borra costo, margen ni lo demás', () => {
    const [r] = mezclarPartidas([partida()], [{ id: 1, name: 'Cámara IP', unit: 'pieza', qty: 5, unitPrice: 1500 }]);
    expect(r).toMatchObject({ qty: 5, unitCost: 1000, marginPercent: 50, productCtId: 77, ieps: 8, unitPrice: 1500 });
  });

  it('cambiar el precio de una partida con margen quita el margen, para que el precio escrito mande', () => {
    const [r] = mezclarPartidas([partida()], [{ id: 1, name: 'Cámara IP', qty: 2, unitPrice: 1400 }]);
    expect(r).toMatchObject({ unitPrice: 1400, marginPercent: null, unitCost: 1000 });
  });

  it('una partida nueva no trae costo; la que no llega se quita', () => {
    const r = mezclarPartidas([partida(), partida({ id: 2, name: 'Otra' })], [{ id: 2, name: 'Otra', qty: 2, unitPrice: 1500 }, { name: 'Nueva', qty: 1, unitPrice: 10 }]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ id: 2, unitCost: 1000 });
    expect(r[1]).toEqual({ name: 'Nueva', qty: 1, unitPrice: 10, unit: null, category: 'Otros' });
  });

  it('no se cuela un costo ni un margen enviado por el navegador', () => {
    const [r] = mezclarPartidas([partida()], [{ id: 1, name: 'Cámara', qty: 2, unitPrice: 1500, unitCost: 1, marginPercent: 99 } as never]);
    expect(r).toMatchObject({ unitCost: 1000, marginPercent: 50 });
    const [n] = mezclarPartidas([], [{ name: 'Nueva', qty: 1, unitPrice: 10, unitCost: 1, marginPercent: 99 } as never]);
    expect(n).not.toHaveProperty('unitCost');
    expect(n).not.toHaveProperty('marginPercent');
  });

  it('una partida que ya no existe avisa que otra persona guardó', () => {
    expect(() => mezclarPartidas([partida()], [{ id: 9, name: 'X', qty: 1, unitPrice: 1 }])).toThrow(CotizacionCambio);
  });

  it('rechaza lo que no es una partida', () => {
    for (const mala of [{ name: ' ', qty: 1, unitPrice: 1 }, { name: 'X', qty: 0, unitPrice: 1 }, { name: 'X', qty: 1.5, unitPrice: 1 }, { name: 'X', qty: 1, unitPrice: -1 }, { name: 'X', qty: 1, unitPrice: 'a' }]) {
      expect(() => mezclarPartidas([], [mala])).toThrow(PartidaInvalida);
    }
  });
});
