import { describe, expect, it } from "vitest";
import { vistaPellizcada } from "./Lienzo";

describe("pellizco en el plano 2D", () => {
  // Vista de 1000 × 500 px del plano en un lienzo de 500 × 250 px de pantalla: 2 px del plano por px.
  const inicio = { dist: 100, enPlano: { x: 700, y: 300 }, centro: { x: 250, y: 125 }, u: 2, vista: { x: 0, y: 0, w: 1000, h: 500 } };
  const bajo = (v: { x: number; y: number; w: number; h: number }, c: { x: number; y: number }, u: number) => ({
    x: v.x + v.w / 2 + (c.x - 250) * u,
    y: v.y + v.h / 2 + (c.y - 125) * u,
  });

  it("abrir los dedos al doble muestra la mitad y deja quieto el punto bajo los dedos", () => {
    const medio = { x: 350, y: 212.5 }; // punto medio de los dedos; ahí quedó (700, 300) del plano al empezar
    const v = vistaPellizcada(inicio, medio, 200);
    expect(v.w).toBeCloseTo(500);
    expect(v.h).toBeCloseTo(250);
    const p = bajo(v, medio, 1);
    expect(p.x).toBeCloseTo(700);
    expect(p.y).toBeCloseTo(300);
  });

  it("mover los dos dedos sin abrirlos solo desplaza la vista", () => {
    const v = vistaPellizcada(inicio, { x: 400, y: 212.5 }, 100);
    expect(v.w).toBeCloseTo(1000);
    expect(v.x).toBeCloseTo(-100);
  });
});
