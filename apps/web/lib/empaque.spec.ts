import { describe, expect, it } from "vitest";
import {
  cantidadLegible,
  empaqueDeCompra,
  etiquetaCantidad,
  pluralEmpaque,
  previsualizarConversion,
} from "./empaque";

const CAJA = { id: 1, nombre: "Caja", piezasPorUnidad: 100, esDefaultCompra: true };
const BOLSA = { id: 2, nombre: "Bolsa", piezasPorUnidad: 12 };

describe("etiquetaCantidad", () => {
  it("enseña lo capturado y lo que de verdad se movió", () => {
    expect(etiquetaCantidad({ quantity: 24, unidadCaptura: "Caja", cantidadCapturada: 2 })).toBe(
      "2 cajas · 24 pz",
    );
  });

  it("en singular no pluraliza", () => {
    expect(etiquetaCantidad({ quantity: 100, unidadCaptura: "Caja", cantidadCapturada: 1 })).toBe(
      "1 caja · 100 pz",
    );
  });

  it("sin presentación enseña solo la unidad base", () => {
    expect(etiquetaCantidad({ quantity: 24 })).toBe("24 pz");
    expect(etiquetaCantidad({ quantity: "610" }, "m")).toBe("610 m");
  });

  it("acepta decimales de Prisma sin ceros de adorno", () => {
    expect(etiquetaCantidad({ quantity: "12.5000" }, "m")).toBe("12.5 m");
  });

  it("una captura en cero se ignora: vale la unidad base", () => {
    expect(etiquetaCantidad({ quantity: 5, unidadCaptura: "Caja", cantidadCapturada: 0 })).toBe(
      "5 pz",
    );
  });
});

describe("pluralEmpaque", () => {
  it("pluraliza vocal y consonante", () => {
    expect(pluralEmpaque("Caja", 2)).toBe("cajas");
    expect(pluralEmpaque("Rollo", 3)).toBe("rollos");
    expect(pluralEmpaque("Par", 2)).toBe("pares");
  });

  it("en singular baja a minúscula sin más", () => {
    expect(pluralEmpaque("Caja", 1)).toBe("caja");
  });
});

describe("cantidadLegible", () => {
  it("quita los ceros que no dicen nada", () => {
    expect(cantidadLegible(3)).toBe("3");
    expect(cantidadLegible(2.5)).toBe("2.5");
    expect(cantidadLegible(0.25)).toBe("0.25");
  });
});

describe("previsualizarConversion", () => {
  it("dice cuántas piezas son antes de mandar nada", () => {
    expect(previsualizarConversion(3, CAJA)).toEqual({
      piezas: 300,
      texto: "3 cajas = 300 pz",
    });
  });

  it("acepta fracciones de presentación", () => {
    expect(previsualizarConversion(2.5, BOLSA)?.piezas).toBe(30);
  });

  it("sin presentación o sin cantidad no hay vista previa", () => {
    expect(previsualizarConversion(3, null)).toBeNull();
    expect(previsualizarConversion(0, CAJA)).toBeNull();
    expect(previsualizarConversion("", CAJA)).toBeNull();
  });

  it("un factor inservible no inventa una conversión", () => {
    expect(previsualizarConversion(3, { nombre: "Caja", piezasPorUnidad: 0 })).toBeNull();
  });
});

describe("empaqueDeCompra", () => {
  it("prefiere la marcada por defecto", () => {
    expect(empaqueDeCompra([BOLSA, CAJA])).toBe(CAJA);
  });

  it("sin marca toma la más grande", () => {
    expect(empaqueDeCompra([BOLSA, { nombre: "Rollo", piezasPorUnidad: 305 }])?.nombre).toBe(
      "Rollo",
    );
  });

  it("sin presentaciones no hay nada que proponer", () => {
    expect(empaqueDeCompra([])).toBeNull();
  });
});
