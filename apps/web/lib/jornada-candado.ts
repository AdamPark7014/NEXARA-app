export const CODIGO_JORNADA_NO_ABIERTA = "JORNADA_NO_ABIERTA";
export const MENSAJE_JORNADA_NO_ABIERTA = "Registra tu entrada para empezar a trabajar";

export type ErrorJornada = { code: string; message: string; status?: number };

/** Extrae code/message de un Error cuya message es JSON del API (erpFetch/asistente). */
export function errorDeJornada(err: unknown): ErrorJornada | null {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { code?: unknown; message?: unknown; statusCode?: number };
    const code = typeof parsed.code === "string" ? parsed.code : "";
    if (code !== CODIGO_JORNADA_NO_ABIERTA) return null;
    const message = Array.isArray(parsed.message)
      ? parsed.message.filter((m): m is string => typeof m === "string").join(", ")
      : typeof parsed.message === "string"
        ? parsed.message
        : MENSAJE_JORNADA_NO_ABIERTA;
    return { code, message: message || MENSAJE_JORNADA_NO_ABIERTA, status: parsed.statusCode ?? 409 };
  } catch {
    if (raw.includes(CODIGO_JORNADA_NO_ABIERTA)) return { code: CODIGO_JORNADA_NO_ABIERTA, message: MENSAJE_JORNADA_NO_ABIERTA, status: 409 };
    return null;
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
let abierta = false;

export function barreraJornadaActiva(): boolean { return abierta; }
export function abrirBarreraJornada(): void {
  if (abierta) return;
  abierta = true;
  listeners.forEach((l) => l());
}
export function cerrarBarreraJornada(): void {
  if (!abierta) return;
  abierta = false;
  listeners.forEach((l) => l());
}
export function suscribirBarreraJornada(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Si el error es JORNADA_NO_ABIERTA, abre la barrera y devuelve true. */
export function manejarErrorJornada(err: unknown): boolean {
  if (!errorDeJornada(err)) return false;
  abrirBarreraJornada();
  return true;
}
const MARCA_VIGIA = "__nxVigiaJornada";

/**
 * Vigila todas las respuestas del navegador, no solo las de `erpFetch`: más de cien pantallas llaman
 * a la API con `fetch` directo (solicitar herramienta, viáticos, almacén…) y ahí la barrera nunca se
 * abría: solo salía el renglón de error. Con el 409 `JORNADA_NO_ABIERTA` abre la barrera y deja la
 * respuesta intacta para quien la pidió. Se instala una sola vez; devuelve cómo quitarla.
 */
export function vigilarRespuestasDeJornada(): () => void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return () => undefined;
  const ventana = window as typeof window & { [MARCA_VIGIA]?: boolean };
  if (ventana[MARCA_VIGIA]) return () => undefined;
  const original = window.fetch;
  const vigilado = async function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
    const res = await original.apply(this === undefined ? window : (this as typeof window), args);
    if (res.status === 409) {
      // Se lee una copia: el cuerpo original queda sin tocar para la pantalla que hizo la petición.
      void res
        .clone()
        .text()
        .then((texto) => {
          if (texto.includes(CODIGO_JORNADA_NO_ABIERTA)) abrirBarreraJornada();
        })
        .catch(() => undefined);
    }
    return res;
  } as typeof fetch;
  window.fetch = vigilado;
  ventana[MARCA_VIGIA] = true;
  return () => {
    if (window.fetch === vigilado) window.fetch = original;
    ventana[MARCA_VIGIA] = false;
  };
}
