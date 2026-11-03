import { describe, expect, it } from "vitest";
import { acomodoDelEditor } from "./acomodo";

describe("acomodoDelEditor", () => {
  it("con espacio de sobra van las tres columnas y una sola fila de controles", () => {
    expect(acomodoDelEditor(1608)).toEqual({ columnas: 3, lienzo: "ancho", barraCompacta: false });
  });

  it("una pantalla de 1536 px con el menú de Core deja el panel de equipos como cajón", () => {
    expect(acomodoDelEditor(1224)).toEqual({ columnas: 2, lienzo: "ancho", barraCompacta: false });
  });

  it("recorta los textos antes de partir los controles en dos filas", () => {
    expect(acomodoDelEditor(1120).lienzo).toBe("medio");
    expect(acomodoDelEditor(1060).lienzo).toBe("angosto");
  });

  it("el panel derecho baja antes de dejar un lienzo diminuto", () => {
    expect(acomodoDelEditor(979).columnas).toBe(1);
    expect(acomodoDelEditor(979).lienzo).toBe("ancho");
  });

  it("en celular todo va compacto", () => {
    expect(acomodoDelEditor(374)).toEqual({ columnas: 1, lienzo: "celular", barraCompacta: true });
  });
});
