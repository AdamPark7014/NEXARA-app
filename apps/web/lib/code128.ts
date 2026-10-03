/**
 * Code 128 (juego B) → SVG, sin dependencias.
 *
 * Es la simbología de las etiquetas internas: cabe cualquier letra, número o guion
 * del código de una herramienta (`MUL-12345`) y la lee cualquier lector de mostrador.
 * El juego B cubre ASCII 32–126, que es todo lo que produce la nomenclatura interna.
 *
 * Cada símbolo son 11 módulos repartidos en 3 barras y 3 espacios; la tabla guarda
 * esos seis anchos (barra, espacio, barra, espacio, barra, espacio). El de parada
 * tiene una barra más (13 módulos).
 */

// prettier-ignore
const ANCHOS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

export const CODE128_INICIO_B = 104;
export const CODE128_PARADA = 106;
/** Zona de silencio a cada lado, en módulos. La norma pide 10. */
export const CODE128_ZONA_SILENCIO = 10;

/** Módulos (1 = barra, 0 = espacio) del símbolo con ese valor. */
export function patronCode128(valor: number): string {
  const anchos = ANCHOS[valor];
  if (!anchos) throw new Error(`Valor Code 128 fuera de rango: ${valor}`);
  let bits = "";
  for (let i = 0; i < anchos.length; i += 1) {
    bits += (i % 2 === 0 ? "1" : "0").repeat(Number(anchos[i]));
  }
  return bits;
}

/** ¿Se puede imprimir tal cual en juego B? Solo ASCII imprimible, y al menos un carácter. */
export function esCodificableCode128B(texto: string): boolean {
  return /^[\x20-\x7e]+$/.test(texto);
}

/**
 * Los valores de los símbolos: inicio B, un valor por carácter, verificador y parada.
 * El verificador es la suma del inicio más cada valor por su posición, módulo 103: el
 * lector lo recalcula y, si no cuadra, no entrega nada (por eso no hay lecturas a medias).
 */
export function valoresCode128B(texto: string): number[] {
  if (!esCodificableCode128B(texto)) {
    throw new Error("Code 128 B solo admite caracteres ASCII imprimibles");
  }
  const datos = Array.from(texto, (c) => c.charCodeAt(0) - 32);
  let suma = CODE128_INICIO_B;
  datos.forEach((valor, i) => {
    suma += valor * (i + 1);
  });
  return [CODE128_INICIO_B, ...datos, suma % 103, CODE128_PARADA];
}

/** El código completo como cadena de módulos, sin zona de silencio. */
export function modulosCode128B(texto: string): string {
  return valoresCode128B(texto).map(patronCode128).join("");
}

export type BarrasCode128 = {
  /** Ancho total en módulos, con las dos zonas de silencio. */
  anchoModulos: number;
  /** Cada barra: dónde empieza y cuánto mide, en módulos. */
  barras: Array<{ x: number; ancho: number }>;
};

/** Las barras ya agrupadas (módulos contiguos = una barra), listas para dibujar. */
export function barrasCode128B(
  texto: string,
  zonaSilencio: number = CODE128_ZONA_SILENCIO,
): BarrasCode128 {
  const modulos = modulosCode128B(texto);
  const barras: BarrasCode128["barras"] = [];
  let i = 0;
  while (i < modulos.length) {
    if (modulos[i] === "0") {
      i += 1;
      continue;
    }
    let fin = i;
    while (fin < modulos.length && modulos[fin] === "1") fin += 1;
    barras.push({ x: zonaSilencio + i, ancho: fin - i });
    i = fin;
  }
  return { anchoModulos: modulos.length + zonaSilencio * 2, barras };
}

export type OpcionesSvgCode128 = {
  /** Alto del dibujo en las mismas unidades que el ancho (módulos). Solo fija la proporción. */
  altoModulos?: number;
  zonaSilencio?: number;
  /** Texto alternativo. Por defecto, el propio código. */
  titulo?: string;
};

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * El código como `<svg>`. No lleva medidas fijas: se estira al ancho y alto que le dé
 * la etiqueta (`preserveAspectRatio="none"`), que es lo que permite que el mismo dibujo
 * sirva en un rollo de 62 mm y en una etiqueta de 50 × 25. `crispEdges` evita el
 * suavizado: una barra gris en el borde es una barra que el lector mide mal.
 */
export function code128Svg(texto: string, opciones: OpcionesSvgCode128 = {}): string {
  const { anchoModulos, barras } = barrasCode128B(texto, opciones.zonaSilencio);
  const alto = opciones.altoModulos ?? 40;
  const rects = barras
    .map((b) => `<rect x="${b.x}" y="0" width="${b.ancho}" height="${alto}"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${anchoModulos} ${alto}" ` +
    `preserveAspectRatio="none" shape-rendering="crispEdges" role="img" ` +
    `aria-label="${escaparXml(opciones.titulo ?? `Código de barras ${texto}`)}">` +
    `<rect x="0" y="0" width="${anchoModulos}" height="${alto}" fill="#fff"/>` +
    `<g fill="#000">${rects}</g></svg>`
  );
}
