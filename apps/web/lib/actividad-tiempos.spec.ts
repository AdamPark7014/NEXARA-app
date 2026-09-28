import { describe, expect, it } from "vitest";
import {
  ACCION_INICIAR,
  evaluarSemaforoActividad,
  formatoMinutos,
  normalizarPrioridad,
  puedeIniciar,
  textoChipSemaforo,
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

describe("semáforo por el reloj", () => {
  const ahora = new Date("2026-09-18T18:00:00.000Z");
  const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();
  const en = (min: number) => new Date(ahora.getTime() + min * 60_000).toISOString();

  it("roja con el tiempo de atraso si pasó el inicio o el tope", () => {
    const luz = evaluarSemaforoActividad({ fechaInicio: hace(75), estatus: "Pendiente", ahora });
    expect(luz.semaforo).toBe("rojo");
    expect(textoChipSemaforo(luz.semaforo, luz.minutosAtraso, luz.minutosParaVencer, luz.motivo)).toBe(
      "Atrasada · 1 h 15 min",
    );
    expect(
      evaluarSemaforoActividad({
        inicioRealAt: hace(30),
        fechaMaxima: hace(15),
        estatus: "En Proceso",
        ahora,
      }).motivo,
    ).toBe("tope");
  });

  it("naranja solo si faltan 30 min o menos, y verde si va holgada o no tiene hora", () => {
    const pronto = evaluarSemaforoActividad({ fechaInicio: en(12), estatus: "Pendiente", ahora });
    expect(pronto.semaforo).toBe("amarillo");
    expect(textoChipSemaforo(pronto.semaforo, pronto.minutosAtraso, pronto.minutosParaVencer, pronto.motivo)).toBe(
      "Atención · 12 min",
    );
    expect(evaluarSemaforoActividad({ estatus: "Pendiente", ahora }).semaforo).toBe("verde");
    expect(evaluarSemaforoActividad({ fechaInicio: en(90), estatus: "Pendiente", ahora }).semaforo).toBe("verde");
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
