/**
 * Etiquetas de herramienta: el documento que se manda a la impresora de etiquetas.
 *
 * No hay controlador ni programa aparte: es una página con `@page` del tamaño exacto
 * de la etiqueta, que se imprime con el diálogo del navegador en la impresora de
 * etiquetas que Windows tenga instalada (en la oficina, una Brother QL-800 con rollo
 * continuo de 62 mm). Una etiqueta por página; un kit entero es un documento de varias.
 *
 * El código de las barras es la nomenclatura interna que la herramienta ya tenía
 * (`MUL-12345`): la etiqueta no inventa otro número.
 */

import { barrasCode128B, code128Svg, esCodificableCode128B } from "./code128";

export type FormatoEtiquetaId = "rollo62" | "e50x25";

export type FormatoEtiqueta = {
  id: FormatoEtiquetaId;
  nombre: string;
  /** Cómo elegirlo en el diálogo de impresión. */
  ayuda: string;
  anchoMm: number;
  altoMm: number;
  /** Margen que la impresora no alcanza a imprimir (lados y arriba/abajo). */
  margenXMm: number;
  margenYMm: number;
  /** Tamaños de letra en puntos: marca, nombre, detalle y código. */
  letra: { marca: number; nombre: number; detalle: number; codigo: number };
};

export const FORMATOS_ETIQUETA: readonly FormatoEtiqueta[] = [
  {
    id: "rollo62",
    nombre: "Rollo continuo de 62 mm",
    ayuda: "Brother QL-800 con rollo DK de 62 mm. Cada etiqueta sale de 62 × 29 mm.",
    anchoMm: 62,
    altoMm: 29,
    margenXMm: 3,
    margenYMm: 2,
    letra: { marca: 7, nombre: 8.5, detalle: 6, codigo: 8.5 },
  },
  {
    id: "e50x25",
    nombre: "Etiqueta de 50 × 25 mm",
    ayuda: "Etiqueta suelta de 50 × 25 mm en impresora térmica.",
    anchoMm: 50,
    altoMm: 25,
    margenXMm: 2,
    margenYMm: 1.5,
    letra: { marca: 6, nombre: 7.5, detalle: 5.5, codigo: 7.5 },
  },
];

export const FORMATO_ETIQUETA_DEFECTO: FormatoEtiquetaId = "rollo62";

export function formatoEtiqueta(id: string | null | undefined): FormatoEtiqueta {
  return FORMATOS_ETIQUETA.find((f) => f.id === id) ?? FORMATOS_ETIQUETA[0];
}

export type HerramientaEtiquetable = {
  id: number;
  toolName: string;
  model?: string | null;
  serialNumber?: string | null;
  codigoInterno?: string | null;
  barcode?: string | null;
};

/** El código que va en las barras: el de barras si lo tiene, si no el interno. */
export function codigoDeEtiqueta(h: Pick<HerramientaEtiquetable, "barcode" | "codigoInterno">): string {
  return (h.barcode || "").trim() || (h.codigoInterno || "").trim();
}

/** Un punto de la impresora de etiquetas: la Brother QL imprime a 300 ppp. */
export const PUNTO_IMPRESORA_MM = 25.4 / 300;

/**
 * Módulo más angosto que un lector de mostrador lee con confianza: dos puntos de
 * impresión (≈ 0.17 mm). Por debajo, las barras se empastan.
 */
export const MODULO_MINIMO_MM = 0.169;

export type MedidaDeBarras = {
  /** Ancho de cada módulo, en milímetros. */
  moduloMm: number;
  /** Ancho del dibujo completo (con zonas de silencio), en milímetros. */
  anchoMm: number;
};

/**
 * De qué ancho se dibuja el código en ese formato.
 *
 * No se estira a todo lo que cabe: cada módulo mide un número entero de puntos de la
 * impresora. Si un módulo midiera 4.3 puntos, unas barras saldrían de 4 y otras de 5 y
 * el lector tendría que adivinar; con 4 exactos todas las barras guardan la proporción.
 */
export function medidaDeBarras(codigo: string, formato: FormatoEtiqueta): MedidaDeBarras | null {
  if (!esCodificableCode128B(codigo)) return null;
  const { anchoModulos } = barrasCode128B(codigo);
  const libre = (formato.anchoMm - formato.margenXMm * 2) / anchoModulos;
  const puntos = Math.floor(libre / PUNTO_IMPRESORA_MM + 1e-9);
  // Si no cabe ni a un punto por módulo se usa todo el ancho (y `avisosDeEtiquetas` avisa).
  const moduloMm = puntos >= 1 ? puntos * PUNTO_IMPRESORA_MM : libre;
  return { moduloMm, anchoMm: moduloMm * anchoModulos };
}

/** Cuánto mide cada módulo del código en ese formato, en milímetros. */
export function anchoDeModuloMm(codigo: string, formato: FormatoEtiqueta): number | null {
  return medidaDeBarras(codigo, formato)?.moduloMm ?? null;
}

export type AvisoEtiqueta = { herramientaId: number; mensaje: string };

/** Lo que conviene saber antes de gastar etiquetas: códigos que no saldrán legibles. */
export function avisosDeEtiquetas(
  herramientas: HerramientaEtiquetable[],
  formato: FormatoEtiqueta,
): AvisoEtiqueta[] {
  const avisos: AvisoEtiqueta[] = [];
  for (const h of herramientas) {
    const codigo = codigoDeEtiqueta(h);
    if (!codigo) {
      avisos.push({ herramientaId: h.id, mensaje: `${h.toolName}: no tiene código interno todavía.` });
      continue;
    }
    const modulo = anchoDeModuloMm(codigo, formato);
    if (modulo == null) {
      avisos.push({
        herramientaId: h.id,
        mensaje: `${h.toolName}: el código «${codigo}» trae caracteres que no caben en un código de barras. Saldrá solo el texto.`,
      });
    } else if (modulo < MODULO_MINIMO_MM) {
      avisos.push({
        herramientaId: h.id,
        mensaje: `${h.toolName}: el código «${codigo}» es muy largo para esta etiqueta y puede no leerse.`,
      });
    }
  }
  return avisos;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function etiquetaHtml(h: HerramientaEtiquetable, formato: FormatoEtiqueta): string {
  const codigo = codigoDeEtiqueta(h);
  const medida = codigo ? medidaDeBarras(codigo, formato) : null;
  const detalle = [h.model, h.serialNumber ? `Serie ${h.serialNumber}` : ""]
    .map((v) => (v || "").trim())
    .filter(Boolean)
    .join(" · ");
  const barras = medida
    ? `<div class="barras"><div class="barras-medida" style="width:${medida.anchoMm.toFixed(3)}mm">` +
      `${code128Svg(codigo)}</div></div>`
    : `<div class="barras sin-barras">Sin código de barras</div>`;

  return (
    `<section class="etiqueta">` +
    `<div class="cabecera"><span class="marca">NEXARA</span>` +
    `<span class="detalle">${escaparHtml(detalle)}</span></div>` +
    `<div class="nombre">${escaparHtml(h.toolName)}</div>` +
    barras +
    `<div class="codigo">${escaparHtml(codigo || "SIN CÓDIGO")}</div>` +
    `</section>`
  );
}

/**
 * Documento completo, listo para imprimir. Todo va en negro puro: en un rollo
 * negro/rojo la impresora pinta de rojo cualquier cosa que no sea negro.
 */
export function htmlEtiquetas(
  herramientas: HerramientaEtiquetable[],
  formatoId: FormatoEtiquetaId | FormatoEtiqueta = FORMATO_ETIQUETA_DEFECTO,
): string {
  const f = typeof formatoId === "string" ? formatoEtiqueta(formatoId) : formatoId;
  const css = `
@page { size: ${f.anchoMm}mm ${f.altoMm}mm; margin: 0; }
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #fff; color: #000;
  font-family: Arial, Helvetica, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.etiqueta {
  width: ${f.anchoMm}mm; height: ${f.altoMm}mm;
  padding: ${f.margenYMm}mm ${f.margenXMm}mm;
  display: flex; flex-direction: column; overflow: hidden;
  break-after: page; page-break-after: always;
}
.etiqueta:last-child { break-after: auto; page-break-after: auto; }
.cabecera { display: flex; align-items: baseline; justify-content: space-between; gap: 2mm; }
.marca { font-size: ${f.letra.marca}pt; font-weight: 800; letter-spacing: 0.22em; white-space: nowrap; }
.detalle {
  font-size: ${f.letra.detalle}pt; min-width: 0; text-align: right;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nombre {
  font-size: ${f.letra.nombre}pt; font-weight: 700; line-height: 1.15; margin-top: 0.4mm;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.barras { flex: 1 1 auto; min-height: 0; margin-top: 0.8mm; display: flex; justify-content: center; }
.barras-medida { height: 100%; flex: 0 0 auto; }
.barras svg { display: block; width: 100%; height: 100%; }
.sin-barras {
  display: flex; align-items: center; justify-content: center;
  border: 0.3mm dashed #000; font-size: ${f.letra.detalle}pt;
}
.codigo {
  font-family: Consolas, "Courier New", monospace; font-size: ${f.letra.codigo}pt; font-weight: 700;
  letter-spacing: 0.06em; text-align: center; margin-top: 0.5mm;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
@media screen {
  html, body { background: #ececec; }
  body { padding: 4mm; }
  .etiqueta { background: #fff; margin: 0 auto 4mm; box-shadow: 0 0 0 0.2mm #c4c4c4; }
}`;

  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<title>Etiquetas NEXARA</title><style>${css}</style></head>` +
    `<body>${herramientas.map((h) => etiquetaHtml(h, f)).join("")}</body></html>`
  );
}
