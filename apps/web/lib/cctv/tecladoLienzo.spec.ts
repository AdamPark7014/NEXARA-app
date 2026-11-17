import { describe, expect, it } from "vitest";
import { interpretarTecla, LEYENDA_ATAJOS } from "./tecladoLienzo";

const base = (extra: Partial<Parameters<typeof interpretarTecla>[0]> = {}) => ({
  key: "ArrowLeft",
  ctrl: false,
  meta: false,
  shift: false,
  focoEnLienzo: true,
  haySeleccion: false,
  ...extra,
});

describe("tecladoLienzo", () => {
  it("sin foco en el lienzo no hace nada", () => {
    expect(interpretarTecla(base({ focoEnLienzo: false, key: "ArrowLeft" }))).toBeNull();
    expect(interpretarTecla(base({ focoEnLienzo: false, key: "z", ctrl: true }))).toBeNull();
    expect(interpretarTecla(base({ focoEnLienzo: false, key: "Delete", haySeleccion: true }))).toBeNull();
  });

  it("con foco: flechas, Q/E, R, Supr y Ctrl+Z/Y/C/V", () => {
    expect(interpretarTecla(base({ key: "ArrowLeft" }))).toEqual({ tipo: "desplazar-vista", dx: -0.1, dy: 0 });
    expect(interpretarTecla(base({ key: "ArrowUp", haySeleccion: true, shift: true }))).toEqual({
      tipo: "mover-seleccion",
      dx: 0,
      dy: -1,
    });
    expect(interpretarTecla(base({ key: "q" }))).toEqual({ tipo: "girar-vista", grados: -15 });
    expect(interpretarTecla(base({ key: "E" }))).toEqual({ tipo: "girar-vista", grados: 15 });
    expect(interpretarTecla(base({ key: "r", haySeleccion: true }))).toEqual({ tipo: "rotar-camara", grados: 15 });
    expect(interpretarTecla(base({ key: "Delete", haySeleccion: true }))).toEqual({ tipo: "borrar" });
    expect(interpretarTecla(base({ key: "z", ctrl: true }))).toEqual({ tipo: "deshacer" });
    expect(interpretarTecla(base({ key: "y", ctrl: true }))).toEqual({ tipo: "rehacer" });
    expect(interpretarTecla(base({ key: "c", ctrl: true }))).toEqual({ tipo: "copiar" });
    expect(interpretarTecla(base({ key: "v", ctrl: true }))).toEqual({ tipo: "pegar" });
  });

  it("la leyenda menciona los atajos", () => {
    expect(LEYENDA_ATAJOS).toMatch(/Flechas/);
    expect(LEYENDA_ATAJOS).toMatch(/Ctrl\+Z/);
  });
});
