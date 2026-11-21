import { describe, expect, it } from "vitest";
import { etiquetaTrabajandoSinEntrada, idsTrabajandoSinEntrada } from "./trabajando-sin-entrada";

describe("trabajando sin entrada", () => {
  it("marca sin entrada con actividad", () => {
    const ids = idsTrabajandoSinEntrada([
      { id: 1, entradaHoyAt: null, currentActivity: { id: 9 }, status: "activo" },
      { id: 2, entradaHoyAt: "2026-11-21T15:00:00.000Z", currentActivity: { id: 1 }, status: "activo" },
      { id: 3, entradaHoyAt: null, currentActivity: null, openActivities: [], status: "libre" },
    ]);
    expect([...ids]).toEqual([1]);
    expect(etiquetaTrabajandoSinEntrada({ userId: 1, estado: "AUSENTE" }, ids)).toBe("Trabajando sin entrada");
    expect(etiquetaTrabajandoSinEntrada({ userId: 1, estado: "PRESENTE" }, ids)).toBeNull();
    expect(etiquetaTrabajandoSinEntrada({ userId: 3, estado: "AUSENTE" }, ids)).toBeNull();
  });
});