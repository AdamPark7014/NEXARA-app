import { describe, expect, it } from "vitest";
import { detectarFolios, MAX_TARJETAS, tonoDeEstado } from "./folios";

describe("detectarFolios", () => {
  it("encuentra folios de actividad sueltos", () => {
    expect(detectarFolios("Revisen la AN-0031 hoy")).toEqual([{ tipo: "actividad", folio: "AN-0031" }]);
  });

  it("toma el id de la pastilla de actividad que deja el selector", () => {
    const body = "Ya quedó [AN-0015 · Cableado piso 2](/erp/actividades/20), gracias";
    expect(detectarFolios(body)).toEqual([{ tipo: "actividad", folio: "AN-0015", id: 20 }]);
  });

  it("reconoce el folio de cotización con cadena y revisión", () => {
    expect(detectarFolios("Mandé la NEX-LJ75100126-0007-JA.CE-R2 al cliente")).toEqual([
      { tipo: "cotizacion", folio: "NEX-LJ75100126-0007-JA.CE-R2" },
    ]);
    expect(detectarFolios("Base: NEX-LJ75100126-0007.")).toEqual([
      { tipo: "cotizacion", folio: "NEX-LJ75100126-0007" },
    ]);
  });

  it("reconoce los folios viejos NXR", () => {
    expect(detectarFolios("ver NXR-2026-763366")).toEqual([{ tipo: "cotizacion", folio: "NXR-2026-763366" }]);
  });

  it("no confunde textos parecidos", () => {
    expect(detectarFolios("PLAN-0031 y XAN-0031 y AN-12 y AN-0031X")).toEqual([]);
  });

  it("respeta el orden, no repite y se queda en el tope", () => {
    const body = "NXR-2026-000111, AN-0002, AN-0001, AN-0002, AN-0003, AN-0004";
    const r = detectarFolios(body);
    expect(r).toHaveLength(MAX_TARJETAS);
    expect(r.map((f) => f.folio)).toEqual(["NXR-2026-000111", "AN-0002", "AN-0001"]);
  });
});

describe("tonoDeEstado", () => {
  it("asigna el tono por el texto del estado", () => {
    expect(tonoDeEstado("En Proceso")).toBe("proc");
    expect(tonoDeEstado("Por Validar")).toBe("val");
    expect(tonoDeEstado("Finalizada")).toBe("fin");
    expect(tonoDeEstado("Cancelada")).toBe("alta");
    expect(tonoDeEstado("Borrador")).toBe("neu");
    expect(tonoDeEstado(null)).toBe("neu");
  });
});
