import { describe, expect, it } from "vitest";
import { buildActivityPayload, compromisoValido, EMPTY_ACTIVITY_FORM, horaCompromisoDe } from "./ops-activity-form";

const base = { ...EMPTY_ACTIVITY_FORM, titulo: "Correctivo", responsableId: "20", fecha: "2026-10-28", hora: "14:30" };

describe("hora compromiso", () => {
  it("sin compromiso, la fecha máxima es la de inicio (la API la lee como fin del día)", () => {
    const p = buildActivityPayload(base, undefined, {});
    expect(p.fechaMaxima).toBe(p.fechaInicio);
    expect(p.fechaEntregaEsperada).toBe(p.fechaInicio);
  });

  it("con compromiso, la fecha máxima y la entrega quedan a esa hora", () => {
    const p = buildActivityPayload({ ...base, horaCompromiso: "18:00" }, undefined, {});
    expect(p.fechaMaxima).toBe(new Date("2026-10-28T18:00:00").toISOString());
    expect(p.fechaEntregaEsperada).toBe(p.fechaMaxima);
    expect(p.fechaInicio).toBe(new Date("2026-10-28T14:30:00").toISOString());
  });

  it("un compromiso antes del inicio no se manda", () => {
    expect(compromisoValido("14:30", "12:00")).toBe(false);
    const p = buildActivityPayload({ ...base, horaCompromiso: "12:00" }, undefined, {});
    expect(p.fechaMaxima).toBe(p.fechaInicio);
  });

  it("se lee de vuelta de la actividad guardada, y no aplica con periodo", () => {
    const inicio = new Date("2026-10-28T14:30:00").toISOString();
    const maxima = new Date("2026-10-28T18:00:00").toISOString();
    expect(horaCompromisoDe({ fechaInicio: inicio, fechaMaxima: maxima })).toBe("18:00");
    expect(horaCompromisoDe({ fechaInicio: inicio, fechaMaxima: inicio })).toBe("");
    expect(horaCompromisoDe({ fechaInicio: inicio, fechaMaxima: maxima, periodoFin: "2026-10-30" })).toBe("");
  });
});
