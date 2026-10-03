import { describe, expect, it } from "vitest";
import {
  clasificarCodigo,
  digitoVerificadorGtin,
  esConsultableInternacional,
  esGtinValido,
  limpiarCodigo,
  motivoCodigoInvalido,
  nombreDeTipoCodigo,
  variantesDeBusqueda,
} from "./codigo-barras";

/**
 * Dígito verificador de UPC/EAN en la web. Mismos códigos reales que la prueba del
 * servidor: si las dos copias dejan de coincidir, una de las dos pruebas se rompe.
 */
describe("codigo-barras (web)", () => {
  it("calcula el verificador de UPC-A, EAN-13, EAN-8 y GTIN-14", () => {
    expect(digitoVerificadorGtin("03600029145")).toBe(2);
    expect(digitoVerificadorGtin("400638133393")).toBe(1);
    expect(digitoVerificadorGtin("7351353")).toBe(7);
    expect(digitoVerificadorGtin("1001234500001")).toBe(7);
  });

  it("acepta los códigos buenos y rechaza un dígito cambiado", () => {
    for (const bueno of ["036000291452", "4006381333931", "73513537", "10012345000017"]) {
      expect(esGtinValido(bueno), bueno).toBe(true);
    }
    for (const malo of ["036000291453", "4006381333932", "73513538", "12345", "03600029145X", ""]) {
      expect(esGtinValido(malo), malo).toBe(false);
    }
  });

  it("clasifica y nombra lo que leyó el lector", () => {
    expect(clasificarCodigo(" 036000291452\r")).toEqual({
      codigo: "036000291452",
      tipo: "UPC_A",
      sospechoso: false,
    });
    expect(nombreDeTipoCodigo(clasificarCodigo("4006381333931").tipo)).toBe("EAN-13");
    expect(nombreDeTipoCodigo(clasificarCodigo("CAB-UTP-CAT6").tipo)).toBe("Código propio");
    expect(clasificarCodigo("036000291453").sospechoso).toBe(true);
  });

  it("quita el prefijo AIM y los saltos de línea del lector", () => {
    expect(limpiarCodigo("]E04006381333931\n")).toBe("4006381333931");
  });

  it("explica por qué un código no sirve", () => {
    expect(motivoCodigoInvalido("036000291452")).toBeNull();
    expect(motivoCodigoInvalido("A1")).toMatch(/corto/);
    expect(motivoCodigoInvalido("036000291453")).toMatch(/verificador/);
    expect(motivoCodigoInvalido("CÓDIGO-Ñ")).toMatch(/caracteres/);
  });

  it("UPC-A y su EAN-13 con cero delante son el mismo artículo", () => {
    expect(variantesDeBusqueda("036000291452")).toEqual(["036000291452", "0036000291452"]);
    expect(variantesDeBusqueda("0036000291452")).toEqual(["0036000291452", "036000291452"]);
  });

  it("solo un GTIN de verdad se consulta en el catálogo internacional", () => {
    expect(esConsultableInternacional("036000291452")).toBe(true);
    expect(esConsultableInternacional("MUL-12345")).toBe(false);
    expect(esConsultableInternacional("036000291453")).toBe(false);
  });
});
