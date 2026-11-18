import { describe, expect, it } from "vitest";
import { evaluarSemaforoActividad, finDelDiaMx, semaforoDeLaApi, textoChipSemaforo } from "./actividad-tiempos";

/**
 * 18-11-2026: casos reales de producción. La API (`semaforo-actividad.ts`) y la web daban distinto en
 * 4 de 23 actividades abiertas: con tope igual o anterior al inicio, la API toma el fin de ese día.
 * Valores esperados = los que dio la API a las 13:44 (hora de México).
 */
const AHORA = new Date("2026-11-18T19:44:05Z");

function chip(p: Parameters<typeof evaluarSemaforoActividad>[0]) {
  const l = evaluarSemaforoActividad({ ...p, ahora: AHORA });
  return textoChipSemaforo(l.semaforo, l.minutosAtraso, l.minutosParaVencer, l.motivo);
}

const igual = (iso: string) => ({ fechaInicio: iso, fechaMaxima: iso, fechaEntregaEsperada: iso });

describe("semáforo web = semáforo de la API", () => {
  it.each([
    ["AN-0555", { ...igual("2026-11-18T01:00:00Z"), estatus: "En Proceso" }, "Atrasada · 13 h 44 min"],
    ["AN-0558", { ...igual("2026-11-18T01:00:00Z"), estatus: "En Proceso" }, "Atrasada · 13 h 44 min"],
    ["AN-0569", { ...igual("2026-11-18T14:00:00Z"), estatus: "En Proceso" }, "En tiempo"],
    ["AN-0582", { ...igual("2026-11-18T16:00:00Z"), estatus: "En Proceso" }, "En tiempo"],
    [
      "AN-0590",
      { fechaInicio: "2026-11-18T06:11:00Z", fechaMaxima: "2026-11-18T10:46:00Z", fechaEntregaEsperada: "2026-11-18T10:46:00Z", estatus: "En Proceso" },
      "Atrasada · 8 h 58 min",
    ],
    [
      "AN-0557",
      { fechaInicio: "2026-11-18T01:00:00Z", fechaMaxima: "2026-11-24T05:59:59.999Z", estatus: "Pendiente", periodoInicio: "2026-11-17", periodoFin: "2026-11-23" },
      "Atrasada · 18 h 44 min",
    ],
    ["AN-0592", { estatus: "Pendiente", periodoInicio: "2026-11-18", periodoFin: "2026-11-23" }, "En tiempo"],
    [
      "periodo futuro",
      { fechaInicio: "2026-11-18T01:00:00Z", estatus: "Pendiente", periodoInicio: "2026-11-20", periodoFin: "2026-11-21" },
      "En tiempo",
    ],
  ])("%s", (_an, params, esperado) => {
    expect(chip(params)).toBe(esperado);
  });

  it("el fin del día es 23:59:59.999 hora de México", () => {
    expect(finDelDiaMx(new Date("2026-11-18T01:00:00Z")).toISOString()).toBe("2026-11-18T05:59:59.999Z");
    expect(finDelDiaMx(new Date("2026-11-18T19:44:05Z")).toISOString()).toBe("2026-11-19T05:59:59.999Z");
  });

  it("si la fila trae el semáforo de la API, gana sobre el cálculo local", () => {
    expect(semaforoDeLaApi({ semaforo: "verde" })?.semaforo).toBe("verde");
    expect(semaforoDeLaApi({ semaforo: "rojo", minutosAtraso: 520, motivoSemaforo: "tope" })).toEqual({
      semaforo: "rojo",
      minutosAtraso: 520,
      minutosParaVencer: null,
      motivo: "tope",
    });
    expect(semaforoDeLaApi({})).toBeNull();
  });
});
