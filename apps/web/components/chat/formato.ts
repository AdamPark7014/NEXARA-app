import { toDisplay } from "@/lib/chat-mentions";

/**
 * Barra de formato del redactor.
 *
 * Trabaja sobre el markdown que ya se guarda (`**negrita**`, `_cursiva_`, `` `código` ``…), así que
 * el mensaje viaja a la API igual que si alguien lo escribiera a mano. La selección llega en
 * coordenadas del **texto visible** del `textarea` (donde `[@Adam](user:3)` se ve como `@Adam`) y
 * se traduce al markdown; una pastilla nunca se parte: si la selección la toca, entra entera.
 */

export type AccionFormato =
  | "negrita"
  | "cursiva"
  | "tachado"
  | "enlace"
  | "codigo"
  | "bloqueCodigo"
  | "cita"
  | "listaViñetas"
  | "listaNumerada";

export type ResultadoFormato = {
  markup: string;
  /** Selección a dejar en el texto visible nuevo. */
  inicio: number;
  fin: number;
};

const ENVOLTURAS: Partial<Record<AccionFormato, readonly [string, string]>> = {
  negrita: ["**", "**"],
  cursiva: ["_", "_"],
  tachado: ["~~", "~~"],
  codigo: ["`", "`"],
};

/** Índice del texto visible → índice del markdown, con la selección ya expandida a pastillas enteras. */
function aMarkup(markup: string, indice: number): number {
  const { mentions } = toDisplay(markup);
  let desfase = 0;
  for (const m of mentions) {
    if (indice <= m.start) break;
    if (indice < m.end) return m.markupEnd;
    desfase += m.markupEnd - m.markupStart - (m.end - m.start);
  }
  return indice + desfase;
}

function expandirAPastillas(markup: string, inicio: number, fin: number): [number, number] {
  let a = inicio;
  let b = fin;
  for (const m of toDisplay(markup).mentions) {
    if (a > m.start && a < m.end) a = m.start;
    if (b > m.start && b < m.end) b = m.end;
  }
  return [a, b];
}

function envolver(markup: string, a: number, b: number, antes: string, despues: string): ResultadoFormato {
  const visible = toDisplay(markup).text;
  const seleccion = visible.slice(a, b);
  const mA = aMarkup(markup, a);
  const mB = aMarkup(markup, b);
  const interior = markup.slice(mA, mB);

  // Ya estaba envuelta con lo mismo: quitar el formato (los botones funcionan como interruptor).
  if (
    interior.length >= antes.length + despues.length &&
    interior.startsWith(antes) &&
    interior.endsWith(despues) &&
    seleccion.length >= antes.length + despues.length
  ) {
    const limpio = interior.slice(antes.length, interior.length - despues.length);
    return {
      markup: markup.slice(0, mA) + limpio + markup.slice(mB),
      inicio: a,
      fin: b - antes.length - despues.length,
    };
  }
  if (
    markup.slice(mA - antes.length, mA) === antes &&
    markup.slice(mB, mB + despues.length) === despues &&
    mA - antes.length >= 0
  ) {
    return {
      markup: markup.slice(0, mA - antes.length) + interior + markup.slice(mB + despues.length),
      inicio: a - antes.length,
      fin: b - antes.length,
    };
  }

  return {
    markup: markup.slice(0, mA) + antes + interior + despues + markup.slice(mB),
    inicio: a + antes.length,
    fin: b + antes.length,
  };
}

function enlazar(markup: string, a: number, b: number): ResultadoFormato {
  const visible = toDisplay(markup).text;
  const mA = aMarkup(markup, a);
  const mB = aMarkup(markup, b);
  const texto = visible.slice(a, b);
  // Si ya seleccionó una dirección, la dirección es el destino y falta el texto.
  if (/^https?:\/\/\S+$/.test(texto)) {
    const nuevo = `[texto](${texto})`;
    return { markup: markup.slice(0, mA) + nuevo + markup.slice(mB), inicio: a + 1, fin: a + 6 };
  }
  const etiqueta = markup.slice(mA, mB) || "texto";
  const nuevo = `[${etiqueta}](https://)`;
  if (a === b) {
    return { markup: markup.slice(0, mA) + nuevo + markup.slice(mB), inicio: a + 1, fin: a + 1 + etiqueta.length };
  }
  // Selecciona «https://» para escribir encima la dirección.
  const inicioUrl = a + 1 + texto.length + 2;
  return { markup: markup.slice(0, mA) + nuevo + markup.slice(mB), inicio: inicioUrl, fin: inicioUrl + 8 };
}

function bloqueCodigo(markup: string, a: number, b: number): ResultadoFormato {
  const visible = toDisplay(markup).text;
  const mA = aMarkup(markup, a);
  const mB = aMarkup(markup, b);
  const antesSalto = a > 0 && visible[a - 1] !== "\n" ? "\n" : "";
  const despuesSalto = b < visible.length && visible[b] !== "\n" ? "\n" : "";
  const apertura = `${antesSalto}\`\`\`\n`;
  const cierre = `\n\`\`\`${despuesSalto}`;
  return {
    markup: markup.slice(0, mA) + apertura + markup.slice(mA, mB) + cierre + markup.slice(mB),
    inicio: a + apertura.length,
    fin: b + apertura.length,
  };
}

const PREFIJO_LINEA: Record<"cita" | "listaViñetas" | "listaNumerada", (n: number) => string> = {
  cita: () => "> ",
  listaViñetas: () => "- ",
  listaNumerada: (n) => `${n}. `,
};

const QUITA_PREFIJO: Record<"cita" | "listaViñetas" | "listaNumerada", RegExp> = {
  cita: /^> ?/,
  listaViñetas: /^[-*•] /,
  listaNumerada: /^\d+[.)] /,
};

function prefijarLineas(
  markup: string,
  a: number,
  b: number,
  accion: "cita" | "listaViñetas" | "listaNumerada",
): ResultadoFormato {
  const visible = toDisplay(markup).text;
  const inicioLinea = visible.lastIndexOf("\n", Math.max(0, a - 1)) + 1;
  const saltoFin = visible.indexOf("\n", b > a && visible[b - 1] === "\n" ? b - 1 : b);
  const finLinea = saltoFin === -1 ? visible.length : saltoFin;
  // Los saltos de línea nunca caen dentro de una pastilla, así que los extremos de renglón se
  // traducen sin ambigüedad.
  const mA = aMarkup(markup, inicioLinea);
  const mB = aMarkup(markup, finLinea);
  const lineas = markup.slice(mA, mB).split("\n");
  const quitar = QUITA_PREFIJO[accion];
  const todas = lineas.every((l) => quitar.test(l));
  const nuevas = todas
    ? lineas.map((l) => l.replace(quitar, ""))
    : lineas.map((l, i) => PREFIJO_LINEA[accion](i + 1) + l.replace(QUITA_PREFIJO[accion], ""));
  const bloque = nuevas.join("\n");
  const nuevoMarkup = markup.slice(0, mA) + bloque + markup.slice(mB);
  const largoVisible = toDisplay(bloque).text.length;
  return { markup: nuevoMarkup, inicio: inicioLinea, fin: inicioLinea + largoVisible };
}

/** Aplica una acción de la barra de formato sobre la selección del texto visible. */
export function aplicarFormato(
  markup: string,
  inicio: number,
  fin: number,
  accion: AccionFormato,
): ResultadoFormato {
  const largo = toDisplay(markup).text.length;
  const desde = Math.max(0, Math.min(inicio, fin, largo));
  const hasta = Math.max(0, Math.min(Math.max(inicio, fin), largo));
  const [a, b] = expandirAPastillas(markup, desde, hasta);

  switch (accion) {
    case "enlace":
      return enlazar(markup, a, b);
    case "bloqueCodigo":
      return bloqueCodigo(markup, a, b);
    case "cita":
    case "listaViñetas":
    case "listaNumerada":
      return prefijarLineas(markup, a, b, accion);
    default: {
      const [antes, despues] = ENVOLTURAS[accion] ?? ["", ""];
      return envolver(markup, a, b, antes, despues);
    }
  }
}

/** Atajos de teclado del redactor (Ctrl/⌘ + tecla). */
export function accionDeAtajo(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): AccionFormato | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (!e.shiftKey && k === "b") return "negrita";
  if (!e.shiftKey && k === "i") return "cursiva";
  if (e.shiftKey && k === "x") return "tachado";
  if (e.shiftKey && k === "c") return "codigo";
  if (e.shiftKey && k === "u") return "enlace";
  return null;
}
