import {
  saldoPagoSemanal,
  validarAjustePago,
  validarRegistroPagoCeo,
  comoSeCalculoRenglones,
  snapshotParametrosAlCerrar,
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

  it('como se calculó arma renglones ordinarias, extra y ajuste', () => {
    const r = comoSeCalculoRenglones({
      horasOrdinarias: 40,
      tarifaHora: 100,
      horasExtra: 2,
      factorExtra: 2,
      bonoProductividad: 0,
      descuentos: 50,
      ajusteManual: -100,
      ajusteMotivo: 'Acuerdo de la semana',
      ajusteAutor: 'Dirección',
    });
    expect(r.find((x) => x.clave === 'ordinarias')?.monto).toBe(4000);
    expect(r.find((x) => x.clave === 'extra')?.monto).toBe(400);
    expect(r.find((x) => x.clave === 'descuentos')?.monto).toBe(-50);
    expect(r.find((x) => x.clave === 'ajuste')?.monto).toBe(-100);
  });

  it('snapshot de parámetros al cerrar conserva factor y rango', () => {
    const s = snapshotParametrosAlCerrar({
      vigenteDesde: '2026-01-01',
      factorExtra: 2,
      rangoNormalInicio: '10:00',
      rangoNormalFin: '18:00',
      ruido: 'ignorar',
    });
    expect(s.factorExtra).toBe(2);
    expect(s.rangoNormalInicio).toBe('10:00');
    expect(s.cerradoAt).toEqual(expect.any(String));
    expect(esFormaPagoNomina('transferencia')).toBe(true);
    expect(esFormaPagoNomina('bitcoin')).toBe(false);
  });
});
