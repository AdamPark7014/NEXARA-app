import { getApiBase } from "./api-base";

/**
 * Cuando el navegador no logra hablar con el servidor, `fetch` rechaza con un `TypeError` cuyo texto
 * es del navegador y está en inglés («Failed to fetch» en Chrome, «Load failed» en Safari…). Más de
 * cien pantallas enseñan ese texto tal cual. Aquí se cambia por una frase que cualquiera entiende,
 * en un solo lugar, sin tocar cada pantalla.
 */
export const MENSAJE_SIN_CONEXION = "No se pudo conectar con el servidor. Revisa tu internet y vuelve a intentarlo.";

const TEXTO_DE_NAVEGADOR =
  /^(failed to fetch|load failed|fetch failed|network request failed|networkerror when attempting to fetch resource\.?|the internet connection appears to be offline\.?|the network connection was lost\.?)$/i;

/** «Failed to fetch», «Load failed»…: así dice cada navegador que no hubo red. */
export function esTextoDeRedCaida(texto: string): boolean {
  return TEXTO_DE_NAVEGADOR.test(texto.trim());
}

/** El fallo fue de red (con el texto del navegador o ya traducido), no una respuesta del servidor. */
export function esErrorDeRed(err: unknown): boolean {
  return err instanceof TypeError && (esTextoDeRedCaida(err.message) || err.message === MENSAJE_SIN_CONEXION);
}

/** Solo las llamadas a nuestra API: mapas, fuentes y demás servicios ajenos se quedan como estaban. */
function esDeLaApi(entrada: RequestInfo | URL): boolean {
  try {
    const cruda = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const url = new URL(cruda, window.location.href);
    if (url.origin === window.location.origin) return true;
    const base = getApiBase();
    return Boolean(base) && url.href.startsWith(base);
  } catch {
    return false;
  }
}

const MARCA = "__nxRedCaida";

/**
 * Envuelve `window.fetch` una sola vez: si una llamada a la API falla por red, rechaza con el mismo
 * tipo de error (`TypeError`, para quien pregunta por él) y la frase clara. Las respuestas del
 * servidor, las cancelaciones (`AbortError`) y los servicios ajenos pasan intactos.
 */
export function traducirFallosDeRed(): () => void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return () => undefined;
  const ventana = window as typeof window & { [MARCA]?: boolean };
  if (ventana[MARCA]) return () => undefined;
  const original = window.fetch;
  const traducido = async function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
    try {
      return await original.apply(this === undefined ? window : (this as typeof window), args);
    } catch (err) {
      if (err instanceof TypeError && esTextoDeRedCaida(err.message) && esDeLaApi(args[0])) {
        const claro = new TypeError(MENSAJE_SIN_CONEXION);
        (claro as TypeError & { cause?: unknown }).cause = err;
        throw claro;
      }
      throw err;
    }
  } as typeof fetch;
  window.fetch = traducido;
  ventana[MARCA] = true;
  return () => {
    if (window.fetch === traducido) window.fetch = original;
    ventana[MARCA] = false;
  };
}
