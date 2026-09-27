import { digitoRfcCorrecto } from './rfc-checksum.js';

describe('digitoRfcCorrecto (algoritmo del SAT)', () => {
  // RFC de prueba del SAT y de empresas: letras posteriores a la N, «&» y personas morales.
  it.each([
    'EKU9003173C9',
    'CACX7605101P8',
    'XIQB891116QE4',
    'URE180429TM6',
    'XIA190128J61',
    'NEE240925V73', // Nexara
  ])('acepta el RFC válido %s', (rfc) => {
    expect(digitoRfcCorrecto(rfc)).toBe(true);
  });

  it('rechaza un dígito verificador equivocado', () => {
    expect(digitoRfcCorrecto('EKU9003173C8')).toBe(false);
    expect(digitoRfcCorrecto('NEE240925V70')).toBe(false);
  });

  it('rechaza caracteres fuera del diccionario y longitudes imposibles', () => {
    expect(digitoRfcCorrecto('EKU9003173C*')).toBe(false);
    expect(digitoRfcCorrecto('EKU9003')).toBe(false);
  });
});
