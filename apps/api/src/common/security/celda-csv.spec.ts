import { celdaCsv } from './celda-csv';

describe('celdaCsv', () => {
  it('neutraliza fórmulas al inicio', () => {
    expect(celdaCsv('=HYPERLINK("http://x","clic")')).toBe('"\'=HYPERLINK(""http://x"",""clic"")"');
    expect(celdaCsv('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(celdaCsv('+1+1')).toBe('"\'+1+1"');
    expect(celdaCsv('-2+3')).toBe('"\'-2+3"');
    expect(celdaCsv('\t=1')).toBe('"\'\t=1"');
  });

  it('deja los números como números', () => {
    expect(celdaCsv(-12.5)).toBe('-12.5');
    expect(celdaCsv('-12.50')).toBe('"-12.50"');
    expect(celdaCsv('1500.00')).toBe('"1500.00"');
  });

  it('escapa comillas y vacíos', () => {
    expect(celdaCsv('Proveedor "Uno", S.A.')).toBe('"Proveedor ""Uno"", S.A."');
    expect(celdaCsv(null)).toBe('""');
  });
});
