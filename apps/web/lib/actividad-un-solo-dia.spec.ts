import { describe, expect, it } from "vitest";
import {
  desglosarPorDias,
  esDiaCalendarioLaborable,
  etiquetaSerie,
  MENSAJE_UN_SOLO_DIA,
  MINUTOS_JORNADA_NETOS,
  validarUnSoloDia,
} from "./actividad-un-solo-dia";

describe("validarUnSoloDia", () => {
  it("acepta periodo del mismo dia", () => {
    expect(validarUnSoloDia({ periodoInicio: "2026-11-20", periodoFin: "2026-11-20" })).toEqual({ ok: true });
  });
  it("rechaza periodo de varios dias", () => {
    expect(validarUnSoloDia({ periodoInicio: "2026-11-16", periodoFin: "2026-11-20" })).toEqual({
      ok: false,
      error: MENSAJE_UN_SOLO_DIA,
    });
  });
  it("acepta la que entrega a las 18:00 de México (00:00 UTC del día siguiente)", () => {
    expect(
      validarUnSoloDia({
        fechaInicio: "2026-11-26T16:00:00.000Z",
        fechaMaxima: "2026-11-27T00:00:00.000Z",
        fechaEntregaEsperada: "2026-11-27T00:00:00.000Z",
      }),
    ).toEqual({ ok: true });
  });
  it("sigue rechazando la que pasa al otro día en México", () => {
    expect(validarUnSoloDia({ fechaInicio: "2026-11-26T16:00:00.000Z", fechaMaxima: "2026-11-27T16:00:00.000Z" })).toEqual({
      ok: false,
      error: MENSAJE_UN_SOLO_DIA,
    });
  });
});

describe("desglosarPorDias", () => {
  it("5 dias desde viernes saltando fin de semana", () => {
    const dias = desglosarPorDias({
      trabajo: "Instalación IPADE",
      desde: "2026-11-20",
      diasLaborables: 5,
      cantidadTotal: 50,
      unidad: "cámaras",
      tiempoTotalMin: 38 * 60,
    });
    expect(dias.map((d) => d.fecha)).toEqual([
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
    ]);
    expect(dias.map((d) => d.cantidad)).toEqual([10, 10, 10, 10, 10]);
    expect(dias.every((d) => d.tiempoEstimadoMin <= MINUTOS_JORNADA_NETOS)).toBe(true);
  });
});

describe("etiquetaSerie", () => {
  it("arma Dia N de M", () => {
    expect(etiquetaSerie(3, 5)).toBe("Día 3 de 5");
  });
  it("laborable", () => {
    expect(esDiaCalendarioLaborable("2026-11-16")).toBe(true);
    expect(esDiaCalendarioLaborable("2026-11-22")).toBe(false);
  });
});