/**
 * Transcripción mientras se habla (Adam, 23-10-2026): «que cuando vayas hablando muestre la
 * transcripción y vaya enseñando barritas como un audio de WhatsApp».
 *
 * Dos capas: la vista previa del reconocimiento de voz del navegador (instantánea, aproximada) y
 * el texto de whisper de cada parte de ~20 s (el bueno, el que usa la minuta). Lo que whisper ya
 * cubrió sustituye a la vista previa de ese tramo.
 */

export type TextoParte = { parte: number; inicioMs: number | null; duracionMs: number | null; texto: string };
export type Frase = { ms: number; texto: string };

/** Agrega partes nuevas sin repetir y en orden. */
export function juntarTextos(actuales: TextoParte[], nuevos: TextoParte[]): TextoParte[] {
  const porParte = new Map(actuales.map((t) => [t.parte, t]));
  for (const t of nuevos) porParte.set(t.parte, t);
  return [...porParte.values()].sort((a, b) => a.parte - b.parte);
}

/** Última parte sin huecos desde la primera recibida: de ahí se pide lo siguiente al servidor. */
export function ultimaContigua(textos: TextoParte[], base = 0): number {
  let n = base;
  for (const t of textos) {
    if (t.parte <= n) continue;
    if (t.parte !== n + 1) break;
    n = t.parte;
  }
  return n;
}

/** Hasta qué momento de la grabación llega el texto de whisper (sin huecos). */
export function cubiertoHasta(textos: TextoParte[], base = 0): number {
  const hasta = ultimaContigua(textos, base);
  const ultima = textos.find((t) => t.parte === hasta);
  return ultima?.inicioMs != null ? ultima.inicioMs + (ultima.duracionMs ?? 0) : 0;
}

/** Frases de la vista previa que whisper todavía no cubre. */
export const frasesPendientes = (frases: Frase[], cubiertoMs: number) => frases.filter((f) => f.ms > cubiertoMs);

/** Texto de whisper para mostrar: los últimos `max` caracteres, cortados en palabra. */
export function colaDeTexto(textos: TextoParte[], max = 1_200): { texto: string; recortado: boolean } {
  const todo = textos
    .map((t) => t.texto.trim())
    .filter(Boolean)
    .join(" ");
  if (todo.length <= max) return { texto: todo, recortado: false };
  const corte = todo.slice(-max);
  return { texto: corte.slice(corte.indexOf(" ") + 1), recortado: true };
}

// ── Onda tipo nota de voz ───────────────────────────────────────────────

/** Bajo este RMS es silencio: la barra se dibuja como puntito. */
export const UMBRAL_SILENCIO = 0.004;
/** RMS de una voz normal cerca del micrófono: barra casi llena. */
const RMS_LLENO = 0.12;

/** Altura de una barra para un RMS: 0 = puntito (silencio); si no, entre `min` y `alto`. */
export function alturaBarra(rms: number, alto: number, min = 4): number {
  if (!(rms >= UMBRAL_SILENCIO)) return 0;
  const proporcion = Math.min(1, Math.sqrt(rms / RMS_LLENO));
  return Math.max(min, Math.round(proporcion * alto));
}

/** RMS de una ventana de muestras (−1…1). */
export function rms(muestras: ArrayLike<number>): number {
  if (!muestras.length) return 0;
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) suma += muestras[i] * muestras[i];
  return Math.sqrt(suma / muestras.length);
}

/** Suavizado entre cuadros: sube rápido (se ve la voz al instante) y baja más lento. */
export const suavizar = (anterior: number, actual: number) => (actual > anterior ? anterior * 0.3 + actual * 0.7 : anterior * 0.65 + actual * 0.35);

const CLAVE_VISTA_PREVIA = "nexara.vistaPreviaVoz";

/** «Vista previa del navegador»: encendida salvo que la persona la apague. */
export function vistaPreviaGuardada(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_VISTA_PREVIA) !== "0";
  } catch {
    return true;
  }
}

export function guardarVistaPrevia(encendida: boolean) {
  try {
    window.localStorage.setItem(CLAVE_VISTA_PREVIA, encendida ? "1" : "0");
  } catch {
    /* sin almacenamiento: vale solo esta vez */
  }
}
