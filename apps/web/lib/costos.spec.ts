import { describe, expect, it } from "vitest";
import {
  anchoDeBarra,
  detalleDeFila,
  filtrarCandidatos,
  fraccionATexto,
  pctDeAvance,
  rutaProyectoDesdeCotizacion,
  textoAFraccion,
  tonoDeAvance,
  tonoDeMargen,
  type Candidato,
} from "./costos";

describe("real contra cotizado", () => {
  it("el mismo color que el mockup: verde, ámbar y rojo", () => {
    expect(tonoDeAvance(8000, 8000)).toBe("ok");
    expect(tonoDeAvance(146300, 142000)).toBe("atencion");
    expect(tonoDeAvance(52100, 38400)).toBe("mal");
  });

  it("sin cotizado no hay comparación", () => {
    expect(tonoDeAvance(100, null)).toBe("neutro");
    expect(tonoDeAvance(100, 0)).toBe("neutro");
    expect(pctDeAvance(100, null)).toBeNull();
  });

  it("el 100 % queda a dos tercios de la barra y el exceso se topa", () => {
    expect(anchoDeBarra(8000, 8000)).toBeCloseTo(66.67, 1);
    expect(anchoDeBarra(52100, 38400)).toBeCloseTo(90.45, 1);
    expect(anchoDeBarra(9200, 6000)).toBe(100);
    expect(pctDeAvance(52100, 38400)).toBe(136);
  });

  it("margen", () => {
    expect(tonoDeMargen(16.6)).toBe("ok");
    expect(tonoDeMargen(6.9)).toBe("atencion");
    expect(tonoDeMargen(-1.2)).toBe("mal");
    expect(tonoDeMargen(null)).toBe("neutro");
  });
});

describe("porcentajes en campos", () => {
  it("fracción a texto y de regreso", () => {
    expect(fraccionATexto(0.25)).toBe("25");
    expect(fraccionATexto(0.015)).toBe("1.5");
    expect(fraccionATexto(null)).toBe("");
    expect(textoAFraccion("25")).toBe(0.25);
    expect(textoAFraccion("1,5")).toBe(0.015);
  });

  it("lo inválido no se convierte en cero", () => {
    expect(textoAFraccion("")).toBeNull();
    expect(textoAFraccion("abc")).toBeNull();
    expect(textoAFraccion("-3")).toBeNull();
  });
});

describe("bandeja", () => {
  it("el detalle se lee natural", () => {
    expect(detalleDeFila({ coreKind: "tarea", personas: 2, dias: 3 })).toBe("Tarea · 2 personas · 3 días");
    expect(detalleDeFila({ coreKind: null, personas: 1, dias: 1 })).toBe("1 persona · 1 día");
  });

  const lista: Candidato[] = [
    { tipo: "PROYECTO", id: 1, nombre: "CCTV Bodega Norte", cliente: "Bodegas Luna" },
    { tipo: "COTIZACION", id: 2, nombre: "NEX-0042 · Acceso", cliente: "Colegio Andrés" },
  ];

  it("busca por nombre o cliente, sin acentos", () => {
    expect(filtrarCandidatos(lista, "luna").map((c) => c.id)).toEqual([1]);
    expect(filtrarCandidatos(lista, "andres").map((c) => c.id)).toEqual([2]);
    expect(filtrarCandidatos(lista, "")).toHaveLength(2);
    expect(filtrarCandidatos(lista, "nada")).toHaveLength(0);
  });

  it("la ruta del alta de proyecto lleva cotización y cliente", () => {
    expect(rutaProyectoDesdeCotizacion(42, 7)).toBe("/erp/proyectos/nuevo?cotizacionId=42&clienteId=7");
    expect(rutaProyectoDesdeCotizacion(42)).toBe("/erp/proyectos/nuevo?cotizacionId=42");
  });
});
