import {
  campoParaCodigo,
  clasificarCodigo,
  digitoVerificadorGtin,
  esConsultableInternacional,
  esGtinValido,
  limpiarCodigo,
  motivoCodigoInvalido,
  variantesDeBusqueda,
} from './codigo-barras';

/**
 * Códigos reales de empaque: si el verificador se calcula mal, el almacén rechaza
 * productos que sí existen o acepta un número mal tecleado como si fuera un UPC.
 */
describe('codigo-barras', () => {
  describe('dígito verificador', () => {
    it('UPC-A: 03600029145 → 2', () => {
      expect(digitoVerificadorGtin('03600029145')).toBe(2);
      expect(esGtinValido('036000291452')).toBe(true);
    });

    it('EAN-13: 400638133393 → 1', () => {
      expect(digitoVerificadorGtin('400638133393')).toBe(1);
      expect(esGtinValido('4006381333931')).toBe(true);
    });

    it('EAN-8: 7351353 → 7', () => {
      expect(digitoVerificadorGtin('7351353')).toBe(7);
      expect(esGtinValido('73513537')).toBe(true);
    });

    it('GTIN-14: 1001234500001 → 7', () => {
      expect(digitoVerificadorGtin('1001234500001')).toBe(7);
      expect(esGtinValido('10012345000017')).toBe(true);
    });

    it('un dígito cambiado ya no es válido', () => {
      expect(esGtinValido('036000291453')).toBe(false);
      expect(esGtinValido('4006381333932')).toBe(false);
    });

    it('otros largos o letras no son GTIN', () => {
      expect(esGtinValido('12345')).toBe(false);
      expect(esGtinValido('03600029145X')).toBe(false);
      expect(esGtinValido('')).toBe(false);
    });
  });

  describe('clasificar', () => {
    it('reconoce cada simbología por largo y verificador', () => {
      expect(clasificarCodigo('036000291452').tipo).toBe('UPC_A');
      expect(clasificarCodigo('4006381333931').tipo).toBe('EAN_13');
      expect(clasificarCodigo('73513537').tipo).toBe('EAN_8');
      expect(clasificarCodigo('10012345000017').tipo).toBe('GTIN_14');
      expect(clasificarCodigo('DS-2CD1023G0E-I').tipo).toBe('INTERNO');
    });

    it('12 o 13 dígitos con verificador malo quedan como sospechosos', () => {
      expect(clasificarCodigo('036000291453')).toEqual({
        codigo: '036000291453',
        tipo: 'INTERNO',
        sospechoso: true,
      });
      expect(clasificarCodigo('12345678').sospechoso).toBe(false);
    });

    it('limpia lo que mete el lector alrededor', () => {
      expect(limpiarCodigo('  036000291452\r\n')).toBe('036000291452');
      expect(limpiarCodigo(']E04006381333931')).toBe('4006381333931');
      expect(limpiarCodigo(null)).toBe('');
    });
  });

  describe('motivoCodigoInvalido', () => {
    it('acepta UPC, EAN y códigos internos', () => {
      expect(motivoCodigoInvalido('036000291452')).toBeNull();
      expect(motivoCodigoInvalido('CAB-UTP-CAT6')).toBeNull();
    });

    it('explica por qué no', () => {
      expect(motivoCodigoInvalido('')).toMatch(/Escanea/);
      expect(motivoCodigoInvalido('A1')).toMatch(/corto/);
      expect(motivoCodigoInvalido('x'.repeat(65))).toMatch(/largo/);
      expect(motivoCodigoInvalido('CÓDIGO-Ñ')).toMatch(/caracteres/);
      expect(motivoCodigoInvalido('036000291453')).toMatch(/verificador/);
    });
  });

  describe('variantes de búsqueda', () => {
    it('un UPC-A también se busca como EAN-13 con cero delante', () => {
      expect(variantesDeBusqueda('036000291452')).toEqual(['036000291452', '0036000291452']);
    });

    it('un EAN-13 que empieza en cero también se busca como UPC-A', () => {
      expect(variantesDeBusqueda('0036000291452')).toEqual(['0036000291452', '036000291452']);
    });

    it('un EAN-13 de otro país no tiene equivalente', () => {
      expect(variantesDeBusqueda('4006381333931')).toEqual(['4006381333931']);
    });

    it('un GTIN-14 de caja (indicador 1) no equivale a la pieza', () => {
      expect(variantesDeBusqueda('10012345000017')).toEqual(['10012345000017']);
    });

    it('vacío no busca nada', () => {
      expect(variantesDeBusqueda('   ')).toEqual([]);
    });
  });

  it('cada tipo va a su columna', () => {
    expect(campoParaCodigo('UPC_A')).toBe('upc');
    expect(campoParaCodigo('EAN_13')).toBe('ean');
    expect(campoParaCodigo('EAN_8')).toBe('ean');
    expect(campoParaCodigo('GTIN_14')).toBe('codigoBarras');
    expect(campoParaCodigo('INTERNO')).toBe('codigoBarras');
  });

  it('solo se consulta fuera lo que es un GTIN de verdad', () => {
    expect(esConsultableInternacional('036000291452')).toBe(true);
    expect(esConsultableInternacional('4006381333931')).toBe(true);
    expect(esConsultableInternacional('73513537')).toBe(false);
    expect(esConsultableInternacional('MUL-12345')).toBe(false);
    expect(esConsultableInternacional('036000291453')).toBe(false);
  });
});
