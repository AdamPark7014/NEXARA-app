import { describe, expect, it } from "vitest";
import { planoVacio } from "./plano";
import { aplicarLectura, resumenLectura, type LecturaPlano } from "./digitalizar";

const lectura: LecturaPlano = {
  clase: "plano",
  anchoM: 40,
  escalaTexto: "1:100",
  muros: [
    { a: { x: 0, y: 0 }, b: { x: 2000, y: 0 } },
    { a: { x: 0, y: 0 }, b: { x: 0, y: 1000 } },
  ],
  areas: [{ nombre: "Recepción", x: 100, y: 100, ancho: 600, alto: 400 }],
  camaras: [
    { numero: 1, pos: { x: 120, y: 120 }, rumboDeg: 45, tipo: "domo", ubicacion: "Recepción, esquina", alturaM: 2.7, segura: true },
    { numero: 2, pos: { x: 1900, y: 900 }, rumboDeg: null, tipo: "ptz", ubicacion: "", alturaM: null, segura: false },
  ],
  dudas: [],
};

describe("aplicarLectura", () => {
  it("pone escala con el ancho real, muros, área con nombre y cámaras con su ubicación", () => {
    const p = aplicarLectura(planoVacio(), lectura, 2000, { anchoM: 40, conMuros: true, conAreas: true });
    expect(p.escala.metrosPorPx).toBeCloseTo(0.02);
    expect(p.muros).toHaveLength(2);
    expect(p.areas?.[0]?.nombre).toBe("Recepción");
    expect(p.etiquetas.map((e) => e.texto)).toEqual(["Recepción"]);
    expect(p.camaras.map((c) => c.nombre)).toEqual(["Cámara 1 · Recepción, esquina", "Cámara 2"]);
    expect(p.camaras[0]).toMatchObject({ rumboDeg: 45, alturaM: 2.7, pos: { x: 120, y: 120 } });
    expect(p.camaras[1]!.esPtz).toBe(true);
  });

  it("sin muros ni áreas solo agrega cámaras y no toca un plano calibrado", () => {
    const base = { ...planoVacio(), escala: { metrosPorPx: 0.05, calibracion: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, metros: 5 } } };
    const p = aplicarLectura(base, lectura, 2000, { anchoM: 40, conMuros: false, conAreas: false });
    expect(p.escala.metrosPorPx).toBe(0.05);
    expect(p.muros).toHaveLength(0);
    expect(p.camaras).toHaveLength(2);
  });

  it("resumen en palabras", () => {
    expect(resumenLectura(lectura)).toBe("2 muros, 1 área y 2 cámaras");
    expect(resumenLectura({ muros: [], areas: [], camaras: [] })).toBe("0 cámaras");
  });
});
