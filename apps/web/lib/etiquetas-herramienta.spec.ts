import { describe, expect, it } from "vitest";
import {
  FORMATOS_ETIQUETA,
  MODULO_MINIMO_MM,
  PUNTO_IMPRESORA_MM,
  anchoDeModuloMm,
  avisosDeEtiquetas,
  codigoDeEtiqueta,
  formatoEtiqueta,
  htmlEtiquetas,
  medidaDeBarras,
  type HerramientaEtiquetable,
} from "./etiquetas-herramienta";
import { modulosCode128B } from "./code128";

/**
 * Etiquetas de herramienta: el documento que se imprime tiene que salir del tamaño
 * exacto del rollo, con una etiqueta por página y con el código que la herramienta ya
 * tenía, no con uno nuevo.
 */

const MULTIMETRO: HerramientaEtiquetable = {
  id: 42,
  toolName: "Multímetro Fluke 87V",
  model: "87V",
  serialNumber: "12345",
  codigoInterno: "MUL-12345",
  barcode: "MUL-12345",
};

const TALADRO: HerramientaEtiquetable = {
  id: 43,
  toolName: "Taladro <Bosch> & Cía",
  model: "GSB 13",
  serialNumber: "B-778",
  codigoInterno: "TAL-B-778",
  barcode: null,
};

describe("código de la etiqueta", () => {
  it("es el de barras; si no hay, el interno", () => {
    expect(codigoDeEtiqueta(MULTIMETRO)).toBe("MUL-12345");
    expect(codigoDeEtiqueta(TALADRO)).toBe("TAL-B-778");
    expect(codigoDeEtiqueta({ barcode: "FLK-0001", codigoInterno: "MUL-12345" })).toBe("FLK-0001");
    expect(codigoDeEtiqueta({ barcode: " ", codigoInterno: null })).toBe("");
  });
});

describe("formatos", () => {
  it("hay rollo de 62 mm y etiqueta de 50 × 25", () => {
    expect(FORMATOS_ETIQUETA.map((f) => [f.id, f.anchoMm, f.altoMm])).toEqual([
      ["rollo62", 62, 29],
      ["e50x25", 50, 25],
    ]);
  });

  it("un formato desconocido cae en el rollo de 62 mm", () => {
    expect(formatoEtiqueta("carta").id).toBe("rollo62");
    expect(formatoEtiqueta(null).id).toBe("rollo62");
  });
});

describe("htmlEtiquetas", () => {
  it("la página mide lo que la etiqueta, sin márgenes", () => {
    expect(htmlEtiquetas([MULTIMETRO], "rollo62")).toContain("@page { size: 62mm 29mm; margin: 0; }");
    expect(htmlEtiquetas([MULTIMETRO], "e50x25")).toContain("@page { size: 50mm 25mm; margin: 0; }");
  });

  it("lleva NEXARA, el nombre, el identificador y sus barras", () => {
    const html = htmlEtiquetas([MULTIMETRO]);
    expect(html).toContain('<span class="marca">NEXARA</span>');
    expect(html).toContain('<div class="nombre">Multímetro Fluke 87V</div>');
    expect(html).toContain('<div class="codigo">MUL-12345</div>');
    expect(html).toContain("87V · Serie 12345");
    // Las barras son las de ESE código: 154 módulos con sus zonas de silencio.
    expect(modulosCode128B("MUL-12345")).toHaveLength(134);
    expect(html).toContain('viewBox="0 0 154 40"');
  });

  it("una etiqueta por herramienta, cada una en su página", () => {
    const html = htmlEtiquetas([MULTIMETRO, TALADRO, MULTIMETRO]);
    expect(html.match(/<section class="etiqueta">/g)).toHaveLength(3);
    expect(html).toContain("break-after: page");
    expect(html.match(/<svg /g)).toHaveLength(3);
  });

  it("el nombre no puede meter marcado en el documento", () => {
    const html = htmlEtiquetas([TALADRO]);
    expect(html).toContain("Taladro &lt;Bosch&gt; &amp; Cía");
    expect(html).not.toContain("<Bosch>");
  });

  it("todo en negro puro: en rollo negro/rojo lo demás sale rojo", () => {
    const html = htmlEtiquetas([MULTIMETRO]);
    const colores = [...html.matchAll(/(?:fill|color|border)[^;>"]*?(#[0-9a-fA-F]{3,6})/g)].map((m) =>
      m[1].toLowerCase(),
    );
    // Los grises son solo de la vista previa en pantalla (@media screen).
    const impresion = html.slice(0, html.indexOf("@media screen")) + html.slice(html.indexOf("</style>"));
    expect(colores.length).toBeGreaterThan(0);
    expect(impresion).not.toMatch(/#(?!000\b|fff\b)[0-9a-fA-F]{3,6}/);
  });

  it("sin código, o con uno que no se puede codificar, sale el texto y no un dibujo roto", () => {
    const sinCodigo = htmlEtiquetas([{ id: 1, toolName: "Escalera", codigoInterno: null, barcode: null }]);
    expect(sinCodigo).not.toContain("<svg");
    expect(sinCodigo).toContain("SIN CÓDIGO");

    const raro = htmlEtiquetas([{ id: 2, toolName: "Cámara", barcode: "CÁM-01" }]);
    expect(raro).not.toContain("<svg");
    expect(raro).toContain('<div class="codigo">CÁM-01</div>');
  });
});

describe("legibilidad", () => {
  const rollo = formatoEtiqueta("rollo62");
  const chica = formatoEtiqueta("e50x25");

  it("cada módulo mide un número entero de puntos de la impresora", () => {
    // 154 módulos en 56 mm útiles dan 4.29 puntos de 300 ppp: se dibuja a 4 exactos.
    const medida = medidaDeBarras("MUL-12345", rollo)!;
    expect(medida.moduloMm).toBeCloseTo(4 * PUNTO_IMPRESORA_MM, 9);
    expect(medida.anchoMm).toBeCloseTo(154 * 4 * PUNTO_IMPRESORA_MM, 9);
    expect(medida.anchoMm).toBeLessThanOrEqual(56);
    // Y ese es el ancho con que sale en el documento, centrado.
    expect(htmlEtiquetas([MULTIMETRO], rollo)).toContain(`style="width:${medida.anchoMm.toFixed(3)}mm"`);

    // Con todo el ancho libre saldrían barras de 4 y de 5 puntos mezcladas.
    for (const codigo of ["MUL-12345", "TAL-B-778-2291", "HER-SN-000123"]) {
      for (const formato of [rollo, chica]) {
        const puntos = medidaDeBarras(codigo, formato)!.moduloMm / PUNTO_IMPRESORA_MM;
        expect(Math.abs(puntos - Math.round(puntos))).toBeLessThan(1e-6);
      }
    }
  });

  it("un código normal sobra de ancho en los dos formatos", () => {
    expect(anchoDeModuloMm("MUL-12345", rollo)!).toBeGreaterThan(MODULO_MINIMO_MM);
    expect(anchoDeModuloMm("MUL-12345", chica)!).toBeGreaterThan(MODULO_MINIMO_MM);
    expect(avisosDeEtiquetas([MULTIMETRO, TALADRO], rollo)).toEqual([]);
  });

  it("avisa cuando el código es tan largo que las barras se empastan", () => {
    const larga = { ...MULTIMETRO, id: 9, barcode: "HER-SN-0123456789-ABCDEFGHIJ-0123456789" };
    const avisos = avisosDeEtiquetas([larga], chica);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ herramientaId: 9 });
    expect(avisos[0].mensaje).toMatch(/muy largo/);
  });

  it("avisa de las que no tienen código o no se pueden codificar", () => {
    const avisos = avisosDeEtiquetas(
      [
        { id: 1, toolName: "Escalera", codigoInterno: null, barcode: null },
        { id: 2, toolName: "Cámara", barcode: "CÁM-01" },
      ],
      rollo,
    );
    expect(avisos.map((a) => a.herramientaId)).toEqual([1, 2]);
    expect(avisos[0].mensaje).toMatch(/no tiene código/);
    expect(avisos[1].mensaje).toMatch(/Saldrá solo el texto/);
  });
});
