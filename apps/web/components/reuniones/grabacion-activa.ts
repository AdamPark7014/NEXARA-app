/**
 * Lo que sabe el sistema de la grabación en curso fuera de la pantalla de Reuniones: el título de
 * la pestaña, la nota que permite retomarla tras recargar y el canal entre pestañas de Core.
 * Puro donde se puede, con pruebas.
 */

export const CANAL_GRABACION = "nexara-grabacion";
const CLAVE_NOTA = "nx-grabacion-activa";
/** Una nota más nueva que esto es una recarga, no una junta de otro día: se retoma sola. */
export const RETOMAR_SOLA_MS = 2 * 60_000;
/** Sin noticias de la otra pestaña en este tiempo, ya no está grabando. */
export const OTRA_PESTANA_CADUCA_MS = 15_000;

const PREFIJO = /^(● |⏸ )[^·]*· /;

/** «● 12:34 · Clientes · NEXARA Core». Sin importar cuántas veces se le ponga, queda uno solo. */
export function tituloConGrabacion(actual: string, reloj: string, pausado: boolean): string {
  return `${pausado ? "⏸" : "●"} ${reloj} · ${tituloSinGrabacion(actual)}`;
}

export function tituloSinGrabacion(actual: string): string {
  return actual.replace(PREFIJO, "");
}

export type NotaGrabacion = { meetingId: number; titulo: string; at: number };

export function guardarNota(nota: NotaGrabacion): void {
  try {
    window.localStorage.setItem(CLAVE_NOTA, JSON.stringify(nota));
  } catch {
    /* sin almacenamiento: no se podrá retomar sola */
  }
}

export function leerNota(): NotaGrabacion | null {
  try {
    const n = JSON.parse(window.localStorage.getItem(CLAVE_NOTA) ?? "null") as NotaGrabacion | null;
    return n && Number(n.meetingId) > 0 ? n : null;
  } catch {
    return null;
  }
}

export function borrarNota(): void {
  try {
    window.localStorage.removeItem(CLAVE_NOTA);
  } catch {
    /* nada que borrar */
  }
}

export const esReciente = (nota: NotaGrabacion, ahora = Date.now()) => ahora - nota.at < RETOMAR_SOLA_MS;

/** Lo que se dicen las pestañas: la que graba cuenta cómo va y las demás le piden pausar o concluir. */
export type MensajeGrabacion =
  | { tipo: "estado"; meetingId: number; titulo: string; ms: number; pausado: boolean; concluyendo: boolean }
  | { tipo: "fin"; meetingId: number }
  | { tipo: "orden"; orden: "pausar" | "reanudar" | "concluir" };

export function abrirCanal(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL_GRABACION);
}

type VentanaFlotante = { requestWindow: (o: { width: number; height: number }) => Promise<Window> };

/** La ventanita siempre encima (Document Picture-in-Picture: Chrome y Edge de computadora). */
export function apiFlotante(): VentanaFlotante | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { documentPictureInPicture?: VentanaFlotante }).documentPictureInPicture ?? null;
}

/** La ventanita arranca sin estilos: se le copian los de la página y el tema. */
export function copiarEstilos(destino: Document): void {
  destino.documentElement.className = document.documentElement.className;
  for (const a of Array.from(document.documentElement.attributes)) {
    if (a.name.startsWith("data-")) destino.documentElement.setAttribute(a.name, a.value);
  }
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => destino.head.appendChild(n.cloneNode(true)));
  destino.title = "Grabación de la reunión";
  destino.body.style.margin = "0";
}
