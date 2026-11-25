import { describe, expect, it } from "vitest";
import {
  esFormaPagoNomina,
  etiquetaFormaPago,
  formatoMonedaMx,
  FORMAS_PAGO_NOMINA,
} from "./nomina-pago-api";

describe("nomina-pago-api helpers", () => {
  it("formatoMonedaMx usa es-MX con dos decimales", () => {
    expect(formatoMonedaMx(1234.5)).toMatch(/1[,.]234\.50/);
    expect(formatoMonedaMx(0)).toMatch(/0\.00/);
  });

  it("etiquetaFormaPago cubre las tres formas", () => {
    expect(etiquetaFormaPago("transferencia")).toBe("Transferencia");
    expect(etiquetaFormaPago("efectivo")).toBe("Efectivo");
    expect(etiquetaFormaPago("otro")).toBe("Otro");
    expect(etiquetaFormaPago(undefined)).toBe("—");
  });

  it("esFormaPagoNomina valida el catálogo", () => {
    for (const f of FORMAS_PAGO_NOMINA) expect(esFormaPagoNomina(f)).toBe(true);
    expect(esFormaPagoNomina("cheque")).toBe(false);
    expect(esFormaPagoNomina(null)).toBe(false);
  });
});
