import { detectarLayout, parseCsvEstadoCuenta, parseOfxEstadoCuenta } from './estado-cuenta-parsers';

describe('estado-cuenta-parsers', () => {
  it('detecta bbva', () => {
    expect(detectarLayout(['Fecha', 'Concepto', 'Cargo', 'Abono', 'Saldo'])).toBe('bbva');
  });

  it('csv bbva débito y crédito', () => {
    const rows = parseCsvEstadoCuenta(
      'Fecha,Concepto,Cargo,Abono,Saldo\n01/11/2026,Gasolina,1160,,5000\n02/11/2026,Deposito,,2000,7000',
      'bbva',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ isDebit: true, amount: 1160, date: '2026-11-01' });
    expect(rows[1]).toMatchObject({ isDebit: false, amount: 2000, date: '2026-11-02' });
  });

  it('ofx débito', () => {
    const rows = parseOfxEstadoCuenta(
      '<OFX><STMTTRN><DTPOSTED>20261103\n<TRNAMT>-500.00\n<MEMO>Pago\n<FITID>1\n',
    );
    expect(rows[0]).toMatchObject({ amount: 500, isDebit: true, date: '2026-11-03' });
  });
});
