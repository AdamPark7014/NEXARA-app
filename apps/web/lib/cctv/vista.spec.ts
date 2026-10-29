import { describe, expect, it } from "vitest";
import { hfovDeg, vfovDeg } from "./optica";
import type { Tapa } from "./plano";
import { coberturaCamara, type CamaraM } from "./visibilidad";
import { puntoEtiqueta, vistaDesdeCamara } from "./vista";

const optica = { pxHoriz: 2560, pxVert: 1440, focalMm: 2.8, sensorAnchoMm: 4.8 };
const cam: CamaraM = {
  pos: { x: 0, y: 10 },
  alturaM: 5,
  rumboDeg: 90,
  inclinacionDeg: 39,
  distanciaM: 13.757,
  hfovDeg: hfovDeg(optica)!,
  vfovDeg: vfovDeg(optica)!,
  pxHoriz: 2560,
  pxVert: 1440,
};

describe("vista desde la cámara", () => {
  it("pinta piso, cobertura, muro y persona; lo lejano antes que lo cercano", () => {
    const muro: Tapa = { a: { x: 18, y: 0 }, b: { x: 18, y: 20 }, baseM: 0, topeM: 5, origen: "m1" };
    const figuras = vistaDesdeCamara({
      cam,
      tapas: [muro],
      coberturaPropia: coberturaCamara(cam, [muro]),
      personas: [{ x: 8, y: 10 }],
      piso: { min: { x: 0, y: 0 }, max: { x: 30, y: 20 } },
      ancho: 640,
      alto: 360,
    });
    const tipos = figuras.map((f) => f.tipo);
    expect(tipos[0]).toBe("terreno");
    expect(tipos).toContain("piso");
    expect(tipos).toContain("cobertura");
    // el muro (a 18 m) se pinta antes que la persona (a 8 m)
    expect(tipos.lastIndexOf("muro")).toBeLessThan(tipos.indexOf("persona"));
    const persona = figuras.find((f) => f.tipo === "persona");
    expect(persona && persona.tipo === "persona" ? Math.abs(persona.cabeza.x - 320) : 999).toBeLessThan(2);
  });

  it("lo que queda detrás de la lente no se dibuja y la etiqueta no se sale", () => {
    const figuras = vistaDesdeCamara({ cam, tapas: [], coberturaPropia: [], personas: [{ x: -5, y: 10 }], piso: null, ancho: 640, alto: 360 });
    expect(figuras.some((f) => f.tipo === "persona")).toBe(false);
    expect(puntoEtiqueta(cam, { x: -5, y: 10 }, 640, 360)).toBeNull();
    const p = puntoEtiqueta(cam, { x: 8, y: 2 }, 640, 360)!;
    expect(p.x).toBeGreaterThanOrEqual(74);
    expect(p.x).toBeLessThanOrEqual(640 - 74);
  });
});
