import { describe, expect, it } from "vitest";
import { planoVacio, type Plano } from "./plano";
import { agregarCamara } from "./editor";
import { expedienteDe, marcarDocumentoDigitalizado, queFalta, sePuedeDigitalizar, tamanoLegible } from "./expediente";

describe("expediente", () => {
  it("un diseño sin expediente arranca vacío", () => {
    expect(expedienteDe(planoVacio())).toEqual({ documentos: [] });
  });

  it("qué falta para entregar sale del plano y del expediente", () => {
    const vacio = queFalta(planoVacio(), []);
    expect(vacio.every((p) => !p.hecho)).toBe(true);

    let p: Plano = {
      ...planoVacio(),
      croquis: { url: "/c.png", anchoPx: 100, altoPx: 100, opacidad: 0.6 },
      escala: { metrosPorPx: 0.1, calibracion: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, metros: 1 } },
      expediente: {
        sitio: "Campus",
        responsable: "Arquitecto",
        entrega: "2026-12-01",
        requerimientos: "30 días",
        documentos: [{ id: "a", nombre: "Plano.pdf", tipo: "pdf" as const, bytes: 10, url: "/u/x.pdf", subidoAt: "2026-11-16" }],
      },
    };
    p = agregarCamara(p, { x: 10, y: 10 }).plano;
    const listo = queFalta(p, []);
    expect(listo.find((x) => x.texto.startsWith("Modelo elegido"))).toEqual({ texto: "Modelo elegido en cada cámara (faltan 1)", hecho: false });
    expect(listo.filter((x) => x.hecho)).toHaveLength(4);
  });

  it("solo PDF e imágenes se digitalizan; tamaños legibles", () => {
    expect(sePuedeDigitalizar({ tipo: "pdf" })).toBe(true);
    expect(sePuedeDigitalizar({ tipo: "excel" })).toBe(false);
    expect(tamanoLegible(2048)).toBe("2 KB");
    expect(tamanoLegible(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("marcarDocumentoDigitalizado solo toca el id y no inventa docs", () => {
    const base = {
      sitio: "Campus",
      documentos: [
        { id: "a", nombre: "Plano.pdf", tipo: "pdf" as const, bytes: 10, url: "/u/x.pdf", subidoAt: "2026-11-16" },
        { id: "b", nombre: "foto.jpg", tipo: "imagen" as const, bytes: 20, url: "/u/y.jpg", subidoAt: "2026-11-16" },
      ],
    };
    expect(marcarDocumentoDigitalizado(base, "z")).toBe(base);
    const marcado = marcarDocumentoDigitalizado(base, "a");
    expect(marcado).not.toBe(base);
    expect(marcado.documentos[0]?.digitalizado).toBe(true);
    expect(marcado.documentos[1]?.digitalizado).toBeUndefined();
    expect(marcado.sitio).toBe("Campus");
  });

});
