import {
  saldoPagoSemanal,
  validarAjustePago,
  validarRegistroPagoCeo,
  esFormaPagoNomina,
} from './pago-semanal';

describe('pago-semanal', () => {
  it('saldo: sugerido + ajustes − pagos', () => {
    const r = saldoPagoSemanal({ sugerido: 1000, ajustes: [-50], pagos: [400, 300] });
    expect(r).toEqual({ sugerido: 1000, ajustes: -50, pagado: 700, final: 950, saldo: 250 });
  });

  it('ajuste: rechaza semana cerrada, monto 0 y motivo corto', () => {
    expect(validarAjustePago({ monto: 10, motivo: 'corrige redondeo', semanaCerrada: true }).ok).toBe(false);
    expect(validarAjustePago({ monto: 0, motivo: 'corrige redondeo' }).ok).toBe(false);
    expect(validarAjustePago({ monto: -20, motivo: 'x' }).ok).toBe(false);
    expect(validarAjustePago({ monto: -20, motivo: 'corrige redondeo' })).toEqual({ ok: true });
  });

  it('registrar pago: solo CEO; efectivo sin comprobante; forma inválida', () => {
    expect(validarRegistroPagoCeo({ esCeo: false, monto: 100, forma: 'efectivo' }).ok).toBe(false);
    expect(validarRegistroPagoCeo({ esCeo: true, monto: 0, forma: 'efectivo' }).ok).toBe(false);
    expect(validarRegistroPagoCeo({ esCeo: true, monto: 100, forma: 'cheque' }).ok).toBe(false);
    expect(validarRegistroPagoCeo({ esCeo: true, monto: 100, forma: 'efectivo' })).toEqual({
      ok: true,
      forma: 'efectivo',
    });
    expect(
      validarRegistroPagoCeo({ esCeo: true, monto: 50, forma: 'transferencia', comprobanteUrl: null }).ok,
    ).toBe(true);
  });
});
