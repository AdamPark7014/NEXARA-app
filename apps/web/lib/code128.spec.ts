import { describe, expect, it } from "vitest";
import {
  CODE128_INICIO_B,
  CODE128_PARADA,
  barrasCode128B,
  code128Svg,
  esCodificableCode128B,
  modulosCode128B,
  patronCode128,
  valoresCode128B,
} from "./code128";

/**
 * Code 128. Una barra mal en la tabla no se nota a simple vista: la etiqueta se
 * imprime, se pega en la herramienta y el lector simplemente no la lee. Por eso la
 * tabla se comprueba aquí contra una segunda copia escrita de otra forma (módulo por
 * módulo) y contra las propiedades que todo símbolo de la norma cumple.
 */

// Los 107 símbolos como módulos (1 = barra). La implementación guarda anchos; si las
// dos tablas coinciden, ninguna tiene un dedazo.
// prettier-ignore
const MODULOS_NORMA: readonly string[] = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100",
  "10011001000", "10011000100", "10001100100", "11001001000", "11001000100", "11000100100",
  "10110011100", "10011011100", "10011001110", "10111001100", "10011101100", "10011100110",
  "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110",
  "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000", "10001000110",
  "10110001000", "10001101000", "10001100010", "11010001000", "11000101000", "11000100010",
  "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110",
  "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110",
  "11101011000", "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100", "10010110000",
  "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000",
  "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010",
  "11000010100", "10001111010", "10100111100", "10010111100", "10010011110", "10111100100",
  "10011110100", "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000",
  "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110",
  "11110101110", "11010000100", "11010010000", "11010011100", "1100011101011",
];

describe("tabla de símbolos", () => {
  it("coincide símbolo por símbolo con la norma", () => {
    expect(MODULOS_NORMA).toHaveLength(107);
    for (let valor = 0; valor <= 106; valor += 1) {
      expect(patronCode128(valor), `símbolo ${valor}`).toBe(MODULOS_NORMA[valor]);
    }
  });

  it("cada símbolo son 11 módulos, 3 barras y 3 espacios, y empieza en barra", () => {
    for (let valor = 0; valor <= 105; valor += 1) {
      const patron = patronCode128(valor);
      expect(patron, `símbolo ${valor}`).toHaveLength(11);
      expect(patron.startsWith("1") && patron.endsWith("0")).toBe(true);
      expect(patron.match(/1+/g)).toHaveLength(3);
      expect(patron.match(/0+/g)).toHaveLength(3);
      // En Code 128 las barras de un símbolo siempre suman un número par de módulos.
      expect(patron.replace(/0/g, "").length % 2, `paridad del símbolo ${valor}`).toBe(0);
    }
  });

  it("no hay dos símbolos iguales", () => {
    const todos = Array.from({ length: 107 }, (_, v) => patronCode128(v));
    expect(new Set(todos).size).toBe(107);
  });

  it("la parada mide 13 módulos y termina en barra", () => {
    expect(patronCode128(CODE128_PARADA)).toBe("1100011101011");
  });

  it("un valor fuera de la tabla es un error, no un hueco en la etiqueta", () => {
    expect(() => patronCode128(107)).toThrow(/fuera de rango/);
    expect(() => patronCode128(-1)).toThrow(/fuera de rango/);
  });
});

describe("codificación en juego B", () => {
  it("«A»: inicio B, A, verificador 34 y parada", () => {
    // 104 + 33×1 = 137 → 137 mod 103 = 34
    expect(valoresCode128B("A")).toEqual([104, 33, 34, 106]);
    expect(modulosCode128B("A")).toBe(
      "11010010000" + "10100011000" + "10001011000" + "1100011101011",
    );
  });

  it("«PJJ123C»: el ejemplo de manual, con inicio B el verificador es 55", () => {
    // 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879 → 879 mod 103 = 55
    expect(valoresCode128B("PJJ123C")).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
  });

  it("«Wikipedia»: verificador 88", () => {
    const valores = valoresCode128B("Wikipedia");
    expect(valores.slice(0, -2)).toEqual([104, 55, 73, 75, 73, 80, 69, 68, 73, 65]);
    expect(valores.at(-2)).toBe(88);
  });

  it("un código de herramienta: «MUL-12345» → verificador 84", () => {
    // 104 + 45 + 53·2 + 44·3 + 13·4 + 17·5 + 18·6 + 19·7 + 20·8 + 21·9 = 1114 → 84
    const valores = valoresCode128B("MUL-12345");
    expect(valores).toEqual([104, 45, 53, 44, 13, 17, 18, 19, 20, 21, 84, 106]);
    expect(valores[0]).toBe(CODE128_INICIO_B);
    // 11 módulos por símbolo (inicio + 9 datos + verificador) más los 13 de la parada.
    expect(modulosCode128B("MUL-12345")).toHaveLength(11 * 11 + 13);
  });

  it("mayúsculas y minúsculas son códigos distintos", () => {
    expect(modulosCode128B("abc")).not.toBe(modulosCode128B("ABC"));
  });

  it("rechaza lo que el juego B no puede representar", () => {
    expect(esCodificableCode128B("MUL-12345")).toBe(true);
    expect(esCodificableCode128B("CÁMARA")).toBe(false);
    expect(esCodificableCode128B("A\tB")).toBe(false);
    expect(esCodificableCode128B("")).toBe(false);
    expect(() => valoresCode128B("CÁMARA")).toThrow(/ASCII/);
  });
});

describe("dibujo", () => {
  it("agrupa módulos contiguos en una barra y deja la zona de silencio", () => {
    const { anchoModulos, barras } = barrasCode128B("A");
    // 46 módulos de código + 10 de silencio a cada lado.
    expect(anchoModulos).toBe(46 + 20);
    // Inicio B = 11010010000 → barras de 2, 1 y 1 módulos.
    expect(barras.slice(0, 3)).toEqual([
      { x: 10, ancho: 2 },
      { x: 13, ancho: 1 },
      { x: 16, ancho: 1 },
    ]);
    // La última barra de la parada (…1011) cierra justo antes del silencio derecho.
    expect(barras.at(-1)).toEqual({ x: 10 + 44, ancho: 2 });
    // Las barras nunca se tocan ni se salen del dibujo.
    barras.forEach((b, i) => {
      if (i > 0) expect(b.x).toBeGreaterThan(barras[i - 1].x + barras[i - 1].ancho);
      expect(b.x + b.ancho).toBeLessThanOrEqual(anchoModulos - 10);
    });
  });

  it("las barras reconstruyen exactamente los módulos", () => {
    const texto = "TAL-B-778";
    const { anchoModulos, barras } = barrasCode128B(texto, 0);
    const lienzo = Array.from({ length: anchoModulos }, () => "0");
    for (const b of barras) for (let x = b.x; x < b.x + b.ancho; x += 1) lienzo[x] = "1";
    expect(lienzo.join("")).toBe(modulosCode128B(texto));
  });

  it("el SVG se estira sin suavizar y no deja colar marcado", () => {
    const svg = code128Svg("MUL-12345", { altoModulos: 30, titulo: 'Etiqueta "<b>"' });
    expect(svg).toContain('viewBox="0 0 154 30"');
    expect(svg).toContain('preserveAspectRatio="none"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('aria-label="Etiqueta &quot;&lt;b&gt;&quot;"');
    // Un rect de fondo más uno por barra.
    const { barras } = barrasCode128B("MUL-12345");
    expect(svg.match(/<rect /g)).toHaveLength(barras.length + 1);
  });
});
