import { describe, expect, it } from "vitest";
import { duracionVisibleMs, medicionNueva } from "./cronometro-proceso";

describe("duracionVisibleMs", () => {
  it("sin arrancar no hay medición", () => {
    expect(duracionVisibleMs(medicionNueva(null), 5000)).toBeNull();
  });

  it("cuenta el tiempo desde el inicio", () => {
    expect(duracionVisibleMs(medicionNueva(1000), 25000)).toBe(24000);
  });

  it("lo que estuvo oculta la pestaña no cuenta, aunque siga oculta", () => {
    const m = { ...medicionNueva(0), ocultoMs: 4000 };
    expect(duracionVisibleMs(m, 10000)).toBe(6000);
    expect(duracionVisibleMs({ ...m, ocultoDesde: 8000 }, 10000)).toBe(4000);
  });

  it("nunca sale negativa", () => {
    expect(duracionVisibleMs({ ...medicionNueva(0), ocultoMs: 9000 }, 1000)).toBe(0);
  });
});
