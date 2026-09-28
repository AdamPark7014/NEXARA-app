import { describe, expect, it } from "vitest";
import { recorteCuadradoCentrado } from "@/lib/recorte-cuadrado";

describe("recorteCuadradoCentrado", () => {
  it("un retrato se corta arriba y abajo, y queda centrado", () => {
    expect(recorteCuadradoCentrado(400, 800)).toEqual({ x: 0, y: 200, lado: 400 });
  });

  it("un paisaje se corta a los lados", () => {
    expect(recorteCuadradoCentrado(1000, 600)).toEqual({ x: 200, y: 0, lado: 600 });
  });

  it("un cuadrado no se mueve", () => {
    expect(recorteCuadradoCentrado(480, 480)).toEqual({ x: 0, y: 0, lado: 480 });
  });

  it("un tamaño imposible no recorta", () => {
    expect(recorteCuadradoCentrado(0, 100)).toBeNull();
    expect(recorteCuadradoCentrado(Number.NaN, 10)).toBeNull();
  });
});
