import { describe, expect, it } from "vitest";
import { azar } from "./azar";

describe("Azar sembrado del sitio", () => {
  it("la misma semilla da siempre la misma serie: el servidor y el navegador pintan lo mismo", () => {
    const a = azar(20261122);
    const b = azar(20261122);
    const serieA = Array.from({ length: 50 }, () => a());
    const serieB = Array.from({ length: 50 }, () => b());
    expect(serieA).toEqual(serieB);
  });

  it("otra semilla da otra serie", () => {
    const a = azar(11);
    const b = azar(12);
    expect(Array.from({ length: 8 }, () => a())).not.toEqual(Array.from({ length: 8 }, () => b()));
  });

  it("cada valor cae en [0, 1) y la serie se reparte sin cargarse a un lado", () => {
    const r = azar(7);
    let suma = 0;
    const cubetas = new Array(10).fill(0);
    for (let i = 0; i < 5000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      suma += v;
      cubetas[Math.floor(v * 10)]++;
    }
    expect(suma / 5000).toBeGreaterThan(0.47);
    expect(suma / 5000).toBeLessThan(0.53);
    for (const n of cubetas) expect(n).toBeGreaterThan(400);
  });

  it("acepta semillas negativas o con decimales sin salirse del rango", () => {
    for (const semilla of [-5, 3.7, 0, 2 ** 32 + 9]) {
      const r = azar(semilla);
      for (let i = 0; i < 20; i++) {
        const v = r();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});
