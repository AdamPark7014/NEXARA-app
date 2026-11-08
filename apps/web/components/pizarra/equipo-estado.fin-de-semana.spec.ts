import { describe, expect, it } from "vitest";
import { atencionEquipo, contextoActividad, esFinDeSemanaMx, resumenEquipo } from "./equipo-estado";

describe("pizarra en fin de semana", () => {
  const sinEntrada = { id: 1, nombre: "Ana", status: "sin_actividad", entradaHoyAt: null } as any;

  it("reconoce sábado y domingo en hora de México", () => {
    expect(esFinDeSemanaMx(Date.parse("2026-11-08T18:00:00Z"))).toBe(true); // domingo
    expect(esFinDeSemanaMx(Date.parse("2026-11-09T18:00:00Z"))).toBe(false); // lunes
    expect(esFinDeSemanaMx(Date.parse("2026-11-09T05:00:00Z"))).toBe(true); // domingo 23:00 en México
  });

  it("quien no checó un domingo descansa: no va con retraso ni en «sin entrada»", () => {
    expect(resumenEquipo([sinEntrada]).retraso).toBe(1);
    const r = resumenEquipo([sinEntrada], { finDeSemana: true });
    expect(r.retraso).toBe(0);
    expect(r.sinEntrada).toBe(0);
    expect(r.descansan).toBe(1);
    expect(atencionEquipo([sinEntrada], Date.now(), { finDeSemana: true }).sinEntrada).toHaveLength(0);
  });

  it("la tarjeta de quien no checó dice que descansa el domingo y «Sin entrada hoy» entre semana", () => {
    expect(contextoActividad(sinEntrada, Date.parse("2026-11-08T18:00:00Z"))).toBe("Descansa · fin de semana");
    expect(contextoActividad(sinEntrada, Date.parse("2026-11-09T18:00:00Z"))).toBe("Sin entrada hoy");
  });
});
