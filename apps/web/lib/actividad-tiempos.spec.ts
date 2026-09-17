import { describe, expect, it } from "vitest";
import { formatoMinutos, normalizarPrioridad, textoPlanVsReal } from "./actividad-tiempos";

describe("prioridad en la web", () => {
  it("traduce los textos viejos a la prioridad normalizada", () => {
    expect(normalizarPrioridad("Alta")).toBe("ALTA");
    expect(normalizarPrioridad("urgente")).toBe("ALTA");
    expect(normalizarPrioridad("BAJA")).toBe("BAJA");
    expect(normalizarPrioridad(null)).toBe("MEDIA");
  });
});

describe("tiempos en la tarjeta", () => {
  it("escribe horas y minutos como los lee la gente", () => {
    expect(formatoMinutos(155)).toBe("2 h 35 min");
    expect(formatoMinutos(120)).toBe("2 h");
    expect(formatoMinutos(45)).toBe("45 min");
    expect(formatoMinutos(null)).toBeNull();
  });

  it("arma «Plan 2 h · real 2 h 35 min»", () => {
    expect(textoPlanVsReal(120, 155)).toBe("Plan 2 h · real 2 h 35 min");
    expect(textoPlanVsReal(120, null)).toBe("Plan 2 h");
    expect(textoPlanVsReal(null, 30)).toBe("Real 30 min");
    expect(textoPlanVsReal(null, null)).toBeNull();
  });
});
