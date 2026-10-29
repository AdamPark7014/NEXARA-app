import {
  cuentaDeGasto,
  diaCorto,
  esPendiente,
  estadoCfdiCubierto,
  estadoPoliza,
  mejorSugerencia,
  puntuarSugerencia,
  rangoMes,
} from './pagos-gastos.js';

describe('estadoCfdiCubierto', () => {
  it('sin XML falta, con parte es parcial, completo es ok', () => {
    expect(estadoCfdiCubierto(-2500, 0, 0, 'LIGAR_XML').estado).toBe('falta');
    expect(estadoCfdiCubierto(-2500, 2150, 2, 'LIGAR_XML')).toEqual({
      estado: 'parcial',
      texto: '2 CFDI · faltan $350.00',
      accion: 'LIGAR_XML',
    });
    expect(estadoCfdiCubierto(-2500, 2500, 3, 'LIGAR_XML')).toEqual({ estado: 'ok', texto: '3 CFDI', accion: null });
  });
});

describe('puntuarSugerencia', () => {
  const txn = { amount: 2500, isDebit: true, fecha: '2026-10-27', descripcion: 'SPEI IVAN RAMIREZ', contraparte: null };

  it('exige el importe al centavo y el mismo sentido del dinero', () => {
    expect(puntuarSugerencia({ importe: -2500, fecha: '2026-10-27' }, txn)).toBeGreaterThan(90);
    expect(puntuarSugerencia({ importe: -2499, fecha: '2026-10-27' }, txn)).toBe(0);
    expect(puntuarSugerencia({ importe: 2500, fecha: '2026-10-27' }, txn)).toBe(0);
  });

  it('pierde fuerza con los días y la gana con el nombre', () => {
    const lejos = puntuarSugerencia({ importe: -2500, fecha: '2026-10-22' }, txn);
    const cerca = puntuarSugerencia({ importe: -2500, fecha: '2026-10-26' }, txn);
    expect(cerca).toBeGreaterThan(lejos);
    expect(puntuarSugerencia({ importe: -2500, fecha: '2026-10-26', nombre: 'Iván Ramírez' }, txn)).toBeGreaterThanOrEqual(cerca);
    expect(puntuarSugerencia({ importe: -2500, fecha: '2026-10-15' }, txn)).toBe(0);
  });

  it('elige la de mayor puntaje', () => {
    const s = (id: number, score: number) => ({ bankTransactionId: id, score, fecha: '', importe: 0, descripcion: '' });
    expect(mejorSugerencia([s(1, 80), s(2, 95), s(3, 0)])?.bankTransactionId).toBe(2);
    expect(mejorSugerencia([s(1, 0)])).toBeNull();
  });
});

describe('utilidades', () => {
  it('pendiente si cualquier columna falta', () => {
    const ok = { estado: 'ok' as const, texto: '', accion: null };
    expect(esPendiente({ cfdi: ok, banco: { ...ok, sugerencia: null }, poliza: { ...ok, journalEntryId: 1 } })).toBe(false);
    expect(esPendiente({ cfdi: ok, banco: { ...ok, estado: 'sugerencia', sugerencia: null }, poliza: { ...ok, journalEntryId: 1 } })).toBe(true);
    expect(estadoPoliza(null).accion).toBe('REGISTRAR');
  });

  it('la categoría elige la cuenta de gasto', () => {
    expect(cuentaDeGasto('Gasolina')).toBe('601.10');
    expect(cuentaDeGasto('Papelería')).toBe('601.03');
    expect(cuentaDeGasto(null)).toBe('601.01');
  });

  it('rango del mes y fecha corta', () => {
    expect(rangoMes('2026-02', '2026-10-29')).toEqual({ mes: '2026-02', etiqueta: 'Febrero 2026', from: '2026-02-01', to: '2026-02-28' });
    expect(rangoMes(undefined, '2026-10-29').etiqueta).toBe('Octubre 2026');
    expect(diaCorto('2026-10-27')).toBe('27 oct');
  });
});
