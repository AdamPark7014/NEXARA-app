import { describe, expect, it } from "vitest";
import { cadenaAlEnviar, explicarFolio, folioAlEnviar, partesDelFolio } from "./cotizacion-folio";

describe("partes del folio", () => {
  it("separa clave, consecutivo, cadena y revisión", () => {
    expect(partesDelFolio("NEX-LJ75100126-0007-JA.CE-R2")).toEqual({
      base: "NEX-LJ75100126-0007",
      nomenclatura: "LJ75100126",
      siglas: "LJ",
      consecutivo: 7,
      cadena: ["JA", "CE"],
      revision: 2,
      claveCompleta: true,
    });
  });

  it("un folio recién creado no trae cadena ni revisión", () => {
    expect(partesDelFolio("NEX-CE00000000-0001")).toMatchObject({ cadena: [], revision: 1, claveCompleta: false });
  });

  it("los folios viejos no siguen la nomenclatura", () => {
    expect(partesDelFolio("NXR-2026-763366")).toBeNull();
    expect(partesDelFolio("")).toBeNull();
  });
});

describe("el folio en palabras", () => {
  it("dice de quién es, qué número lleva, quién intervino y la revisión", () => {
    const explicado = explicarFolio("NEX-LJ75100126-0007-JA.CE-R2", {
      elaboro: { nombre: "Luis Joel Aguilar", siglas: "LJ" },
      intervinieron: [
        { nombre: "Jorge Alberto Méndez", siglas: "JA" },
        { nombre: "Christian Eduardo Del Pozo", siglas: "CE" },
      ],
    });
    expect(explicado.resumen).toBe(
      "Luis Joel Aguilar (LJ75100126) · su cotización #7 · intervinieron JA, CE · revisión 2",
    );
    expect(explicado.piezas.map((p) => p.texto)).toEqual(["NEX", "LJ75100126", "0007", "JA.CE", "R2"]);
    expect(explicado.piezas[3]!.significa).toBe(
      "intervinieron JA (Jorge Alberto Méndez), CE (Christian Eduardo Del Pozo)",
    );
    expect(explicado.aviso).toBeNull();
  });

  it("sin nombres, explica con la clave", () => {
    expect(explicarFolio("NEX-LJ75100126-0012").resumen).toBe("Clave LJ75100126 · su cotización #12");
  });

  it("avisa cuando la clave de RH vino con ceros", () => {
    expect(explicarFolio("NEX-CE00000000-0003").aviso).toMatch(/incompleta/);
  });

  it("un folio viejo se explica como tal", () => {
    const explicado = explicarFolio("NXR-2026-763366");
    expect(explicado.conNomenclatura).toBe(false);
    expect(explicado.resumen).toMatch(/anterior a la nomenclatura/);
  });
});

describe("folio al enviar", () => {
  it("suma a quienes intervinieron, sin repetir ni incluir a quien la hizo", () => {
    expect(cadenaAlEnviar("LJ", ["LJ", "JA", "ce", "JA", null])).toEqual(["JA", "CE"]);
  });

  it("primer envío sin revisión; los siguientes agregan R", () => {
    expect(folioAlEnviar({ folio: "NEX-LJ75100126-0007", participantes: ["LJ", "JA"], yaEnviada: false })).toBe(
      "NEX-LJ75100126-0007-JA",
    );
    // Reenvío: parte de la base aunque el folio ya traiga la cadena.
    expect(
      folioAlEnviar({ folio: "NEX-LJ75100126-0007-JA", participantes: ["JA", "CE"], yaEnviada: true, revision: 1 }),
    ).toBe("NEX-LJ75100126-0007-JA.CE-R2");
  });

  it("un folio viejo sale tal cual", () => {
    expect(folioAlEnviar({ folio: "NXR-2026-763366", participantes: ["JA"], yaEnviada: false })).toBe("NXR-2026-763366");
  });
});
