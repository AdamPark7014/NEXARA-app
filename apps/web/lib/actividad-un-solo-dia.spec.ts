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
      error: "Esta actividad abarca varios días y cada actividad es de un solo día. Crea una actividad por cada día.",
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
      error: "El inicio y la hora de entrega caen en días distintos. Pon los dos en el mismo día.",
    });
  });
  it("el tiempo que no cabe en un día lo dice en horas", () => {
    expect(validarUnSoloDia({ tiempoEstimadoMin: 540 })).toEqual({
      ok: false,
      error:
        "El tiempo estimado (9 h) es más de lo que cabe en un día de trabajo (7 h). Baja el tiempo o crea otra actividad para el resto.",
    });
    expect(validarUnSoloDia({ tiempoEstimadoMin: MINUTOS_JORNADA_NETOS })).toEqual({ ok: true });
  });
  it("la regla general sigue como texto de ayuda", () => {
    expect(MENSAJE_UN_SOLO_DIA).toContain("un solo día");
  });
});

describe("paridad con la API", () => {
  // La regla vive en la API; esta copia solo avisa antes de enviar. Si los textos se separan, la persona leería
  // una cosa en el formulario y otra en el rechazo del servidor.
  it("los tres textos son los mismos que los del servidor", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const api = readFileSync(resolve(__dirname, "../../api/src/activities/actividad-un-solo-dia.ts"), "utf8");
    const web = readFileSync(resolve(__dirname, "./actividad-un-solo-dia.ts"), "utf8");
    const frases = [
      "Esta actividad abarca varios días y cada actividad es de un solo día. Crea una actividad por cada día.",
      "El inicio y la hora de entrega caen en días distintos. Pon los dos en el mismo día.",
      "es más de lo que cabe en un día de trabajo",
      "Baja el tiempo o crea otra actividad para el resto.",
    ];
    for (const frase of frases) {
      expect(api).toContain(frase);
      expect(web).toContain(frase);
    }
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