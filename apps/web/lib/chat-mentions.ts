/**
 * Menciones del chat: lo que se **guarda** y lo que se **ve** al escribir.
 *
 * El formato guardado no cambia — sigue siendo el mismo markdown que la API ya
 * entiende y que los mensajes viejos ya traen:
 *
 *   `[@Adam Pozo](user:3)`                                     → persona
 *   `[AN-0015 · Instalación de cámaras](/erp/actividades/20)`  → actividad / evidencia
 *
 * `apps/api/src/chat/chat.service.ts` extrae los avisos con `](user:ID)` y la
 * pantalla pinta el enlace con `renderRichText`. Nada de eso se toca.
 *
 * Lo que cambia es el compositor: el `textarea` deja de contener el markdown
 * crudo y pasa a contener el **texto visible** (`@Adam Pozo`, `AN-0015 · …`),
 * mientras el markdown vive en el estado de React. Este módulo es el puente
 * entre las dos representaciones:
 *
 *   markdown  --toDisplay-->  texto visible + rangos de cada pastilla
 *   texto visible editado  --applyDisplayEdit-->  markdown nuevo
 *
 * Ventajas frente a un `contenteditable`: el `textarea` conserva IME, deshacer,
 * selección, corrector y lectores de pantalla nativos, y el valor que lee un
 * lector de pantalla es la frase legible, no el markdown.
 */

/** Token de mención tal como se guarda. Solo rutas internas o `user:ID`. */
const MENTION_RE = /\[([^\]\n]+)\]\((\/[^)\s]*|user:\d+)\)/g;

/** Tope de caracteres visibles de una mención de entidad dentro del compositor. */
export const MENTION_DISPLAY_MAX = 26;

export type MentionKind = "user" | "entity";

export type MentionSpan = {
  kind: MentionKind;
  /** Etiqueta completa tal como se guarda (sin truncar). */
  label: string;
  /** Destino guardado: `/erp/actividades/20` o `user:3`. */
  href: string;
  /** Texto visible (compacto) dentro del compositor. */
  display: string;
  /** Rango en el texto visible. */
  start: number;
  end: number;
  /** Rango en el markdown guardado. */
  markupStart: number;
  markupEnd: number;
};

export type DisplayValue = {
  /** Lo que se ve (y se lee) en el `textarea`. */
  text: string;
  /** Una entrada por pastilla, en orden de aparición. */
  mentions: MentionSpan[];
};

/**
 * Etiqueta compacta de la pastilla: el folio y un título corto, o el nombre.
 *
 * Adam lo pidió así tras ver `[AN-0015 · Instalación de 8 cámaras
 * perimetrales](/erp/actividades/20)` a la vista en la caja de escritura.
 * Truncar es solo visual: el markdown guarda la etiqueta entera.
 */
export function shortMentionLabel(label: string, href: string): string {
  const clean = label.replace(/\s+/g, " ").trim();
  if (!clean) return href.startsWith("user:") ? "@alguien" : "enlace";
  if (href.startsWith("user:")) return clean.startsWith("@") ? clean : `@${clean}`;
  if (clean.length <= MENTION_DISPLAY_MAX) return clean;

  const sep = clean.indexOf(" · ");
  if (sep > 0 && sep <= MENTION_DISPLAY_MAX - 6) {
    const folio = clean.slice(0, sep);
    const resto = clean.slice(sep + 3);
    const sitio = MENTION_DISPLAY_MAX - folio.length - 4;
    return `${folio} · ${resto.slice(0, sitio).trimEnd()}…`;
  }
  return `${clean.slice(0, MENTION_DISPLAY_MAX - 1).trimEnd()}…`;
}

/** Markdown guardado → texto visible + rangos de cada pastilla. */
export function toDisplay(markup: string): DisplayValue {
  const mentions: MentionSpan[] = [];
  let text = "";
  let last = 0;
  MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(markup)) !== null) {
    text += markup.slice(last, match.index);
    const [token, label, href] = match;
    const display = shortMentionLabel(label, href);
    mentions.push({
      kind: href.startsWith("user:") ? "user" : "entity",
      label: label.trim(),
      href,
      display,
      start: text.length,
      end: text.length + display.length,
      markupStart: match.index,
      markupEnd: match.index + token.length,
    });
    text += display;
    last = match.index + token.length;
  }
  text += markup.slice(last);
  return { text, mentions };
}

type Segment = {
  dStart: number;
  dEnd: number;
  mStart: number;
  mEnd: number;
  mention: boolean;
};

function segments(value: DisplayValue, markup: string): Segment[] {
  const out: Segment[] = [];
  let d = 0;
  let m = 0;
  for (const men of value.mentions) {
    if (men.start > d) {
      out.push({ dStart: d, dEnd: men.start, mStart: m, mEnd: men.markupStart, mention: false });
    }
    out.push({
      dStart: men.start,
      dEnd: men.end,
      mStart: men.markupStart,
      mEnd: men.markupEnd,
      mention: true,
    });
    d = men.end;
    m = men.markupEnd;
  }
  if (d <= value.text.length) {
    out.push({ dStart: d, dEnd: value.text.length, mStart: m, mEnd: markup.length, mention: false });
  }
  return out;
}

/** Índice del texto visible → índice del markdown. Solo se llama en fronteras. */
function displayToMarkup(index: number, segs: Segment[]): number {
  for (const seg of segs) {
    if (index < seg.dStart) continue;
    if (index > seg.dEnd) continue;
    if (seg.mention) return index <= seg.dStart ? seg.mStart : seg.mEnd;
    return seg.mStart + (index - seg.dStart);
  }
  const last = segs[segs.length - 1];
  return last ? last.mEnd : index;
}

export type DisplayEdit = {
  /** Markdown antes de la edición. */
  markup: string;
  /** Texto visible **antes** de la edición (derivado de `markup`). */
  prevDisplay: string;
  /** Texto visible que dejó el navegador tras teclear. */
  nextDisplay: string;
  /** `selectionStart` del `textarea` después de teclear. */
  caret: number;
};

export type DisplayEditResult = {
  markup: string;
  /** Posición del cursor en el nuevo texto visible. */
  caret: number;
  /** Mención borrada entera por la edición, si la hubo (para anunciarla). */
  removed: MentionSpan[];
};

/**
 * Traduce una edición hecha sobre el texto visible al markdown guardado.
 *
 * La regla que pidió Adam vive aquí: si el borrado toca una pastilla, **se va
 * entera**. Un retroceso al final de `@Adam Pozo` borra un carácter visible que
 * cae dentro del rango de la mención, el rango se expande a la mención completa
 * y del markdown desaparece `[@Adam Pozo](user:3)` de una sola vez — ni letra a
 * letra ni dejando el `](user:3)` huérfano.
 *
 * Escribir justo en medio de una pastilla no parte el token: el texto se inserta
 * detrás de ella.
 */
export function applyDisplayEdit({
  markup,
  prevDisplay,
  nextDisplay,
  caret,
}: DisplayEdit): DisplayEditResult {
  if (prevDisplay === nextDisplay) return { markup, caret, removed: [] };

  // Prefijo común, sin pasar del cursor: lo tecleado termina en `caret`.
  const tope = Math.min(prevDisplay.length, nextDisplay.length, Math.max(caret, 0));
  let p = 0;
  while (p < tope && prevDisplay[p] === nextDisplay[p]) p++;

  const insertado = nextDisplay.slice(p, Math.max(caret, p));
  const borrado = prevDisplay.length - nextDisplay.length + insertado.length;

  let a = p;
  let b = p + Math.max(borrado, 0);
  if (b > prevDisplay.length) b = prevDisplay.length;

  const value = toDisplay(markup);
  const removed: MentionSpan[] = [];
  for (const men of value.mentions) {
    const tocaBorrado = b > a && men.start < b && men.end > a;
    // Insertar con el cursor dentro de la pastilla: el texto va detrás de ella.
    const tocaInsercion = b === a && a > men.start && a < men.end;
    if (tocaBorrado) {
      a = Math.min(a, men.start);
      b = Math.max(b, men.end);
      removed.push(men);
    } else if (tocaInsercion) {
      a = men.end;
      b = men.end;
    }
  }

  const segs = segments(value, markup);
  const mA = displayToMarkup(a, segs);
  const mB = displayToMarkup(b, segs);
  return {
    markup: markup.slice(0, mA) + insertado + markup.slice(mB),
    caret: a + insertado.length,
    removed,
  };
}

/**
 * Mención que un `Backspace`/`Delete` debería llevarse entera, si el cursor está
 * pegado a una. Se usa para anunciarlo al lector de pantalla antes de borrar.
 */
export function mentionAtCaret(
  markup: string,
  selectionStart: number,
  selectionEnd: number,
): MentionSpan | null {
  const { mentions } = toDisplay(markup);
  if (selectionStart !== selectionEnd) {
    return mentions.find((m) => m.start < selectionEnd && m.end > selectionStart) ?? null;
  }
  // Cursor pegado por detrás o dentro: es la mención que se llevaría un
  // `Backspace`. Pegado por delante (`pos === m.start`) no, ahí se borra lo
  // que haya antes de la pastilla.
  return mentions.find((m) => selectionStart > m.start && selectionStart <= m.end) ?? null;
}

/** Token guardado de una mención de persona. */
export function userMentionToken(nombre: string, id: number): string {
  const limpio = nombre.replace(/[[\]()]/g, "").replace(/\s+/g, " ").trim() || "alguien";
  return `[@${limpio}](user:${id})`;
}

/** Token guardado de una mención de actividad / evidencia. */
export function entityMentionToken(label: string, href: string): string {
  const limpio = label.replace(/[[\]()]/g, "").replace(/\s+/g, " ").trim() || "enlace";
  return `[${limpio}](${href || "/"})`;
}

/**
 * Inserta un token en el markdown, sustituyendo el `@parcial` que disparó el
 * autocompletado cuando lo hay. Devuelve además dónde dejar el cursor.
 */
export function insertMentionToken(
  markup: string,
  token: string,
  opts?: { replaceTrigger?: boolean },
): { markup: string; caret: number } {
  let base = markup;
  if (opts?.replaceTrigger) {
    const at = base.lastIndexOf("@");
    // El `@` de un token ya guardado (`[@Adam](user:3)`) no es un disparador:
    // cortarlo ahí partiría la mención anterior por la mitad.
    const dentroDeToken = toDisplay(base).mentions.some(
      (m) => at >= m.markupStart && at < m.markupEnd,
    );
    if (at >= 0 && !dentroDeToken) base = base.slice(0, at);
  }
  const separador = base && !/\s$/.test(base) ? " " : "";
  const next = `${base}${separador}${token} `;
  return { markup: next, caret: toDisplay(next).text.length };
}
