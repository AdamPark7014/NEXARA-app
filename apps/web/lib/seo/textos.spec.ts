import { describe, expect, it } from "vitest";
import { recortarDescripcion, tituloConRemate } from "./textos";

describe("títulos y descripciones para Google", () => {
  it("el título lleva el remate solo si cabe sin que Google lo corte", () => {
    expect(tituloConRemate("Cámaras CCTV", "en Puebla y CDMX")).toBe("Cámaras CCTV en Puebla y CDMX | NEXARA");
    const largo = tituloConRemate("Cámaras CCTV e IP para Seguridad electrónica", "en Puebla y CDMX");
    expect(largo).toBe("Cámaras CCTV e IP para Seguridad electrónica | NEXARA");
    expect(largo.length).toBeLessThanOrEqual(62);
  });

  it("la descripción no pasa de 158 caracteres", () => {
    expect(recortarDescripcion("palabra ".repeat(60)).length).toBeLessThanOrEqual(158);
  });
});
