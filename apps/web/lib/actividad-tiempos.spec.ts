import { describe, expect, it } from "vitest";
import {
  ACCION_INICIAR,
  formatoMinutos,
  normalizarPrioridad,
  puedeIniciar,
  textoPlanVsReal,
} from "./actividad-tiempos";

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

describe("iniciar actividad (no se acepta ni se rechaza)", () => {
  const base = { aceptacion: "PENDIENTE" as const, inicioRealAt: null, despachador: false, estatus: "Pendiente" };

  it("la única acción se llama «Iniciar actividad»", () => {
    expect(ACCION_INICIAR).toBe("Iniciar actividad");
  });

  it("se ofrece mientras no tenga inicio real, aunque ya la hubiera aceptado o rechazado", () => {
    expect(puedeIniciar(base)).toBe(true);
    expect(puedeIniciar({ ...base, aceptacion: "ACEPTADA" })).toBe(true);
    expect(puedeIniciar({ ...base, aceptacion: "RECHAZADA" })).toBe(true);
    expect(puedeIniciar({ ...base, estatus: "En Proceso" })).toBe(true);
  });

  it("ya iniciada, cerrada, de quien solo reparte o con API vieja: no", () => {
    expect(puedeIniciar({ ...base, aceptacion: "ACEPTADA", inicioRealAt: "2026-09-18T15:00:00.000Z" })).toBe(false);
    expect(puedeIniciar({ ...base, estatus: "Finalizada" })).toBe(false);
    expect(puedeIniciar({ ...base, estatus: "Cancelada" })).toBe(false);
    expect(puedeIniciar({ ...base, despachador: true })).toBe(false);
    expect(puedeIniciar({ ...base, aceptacion: undefined })).toBe(false);
  });
});
