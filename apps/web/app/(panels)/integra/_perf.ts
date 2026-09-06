/**
 * Marcas de tiempo del arranque de la consola.
 *
 * Sin números no se sabe si algo mejoró: «se nota más rápido» es una opinión.
 * Aquí se fijan los tres hitos que de verdad describen entrar en el muro, y se
 * miden con `performance.mark` para que salgan también en la pestaña Rendimiento
 * del navegador, no solo en la consola.
 *
 *   1. `rejilla-visible`  — el primer píxel de rejilla. Hasta aquí la pantalla
 *                           está muerta; es lo que el operador vive como lento.
 *   2. `lista-camaras`    — el inventario listo para pintar (sembrado o real).
 *   3. `primer-mosaico`   — el primer cuadro con imagen de verdad.
 *
 * Cada hito se registra **una sola vez**: el primero es el que cuenta. Un
 * repintado posterior no puede empeorar un número ya ganado.
 */

export const HITOS = {
  /** La rejilla —con sus huecos— ya está en pantalla. */
  rejillaVisible: "integra:rejilla-visible",
  /** Hay lista de cámaras con la que pintar (siembra o respuesta del servidor). */
  listaCamaras: "integra:lista-camaras",
  /** El primer mosaico reporta imagen (vivo o respaldo por instantáneas). */
  primerMosaico: "integra:primer-mosaico",
} as const;

export type Hito = (typeof HITOS)[keyof typeof HITOS];

/** Cómo se registró la lista: sembrada de caché o traída del servidor. */
export type OrigenLista = "semilla" | "servidor";

const registrados = new Map<string, number>();

/** Reloj mínimo que necesitan las marcas. Inyectable para poder probarlas. */
export type RelojPerf = {
  now(): number;
  mark?(nombre: string): unknown;
};

function relojPorDefecto(): RelojPerf | null {
  if (typeof performance === "undefined") return null;
  return performance;
}

/**
 * ¿Se escriben los hitos en consola? Siempre que la consola exista: son tres
 * líneas por carga de página y son justo el dato que hay que pedirle a quien
 * reporta «entrar tarda». Se puede callar con `?perf=0`.
 */
export function perfEnConsola(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !window.location.search.includes("perf=0");
  } catch {
    return true;
  }
}

/**
 * Registra un hito y devuelve los milisegundos desde que empezó la navegación.
 * Si el hito ya estaba registrado devuelve el valor original sin tocar nada.
 */
export function marcarHito(
  nombre: string,
  opciones?: { reloj?: RelojPerf | null; detalle?: string },
): number | null {
  const previo = registrados.get(nombre);
  if (previo != null) return previo;
  const reloj = opciones?.reloj === undefined ? relojPorDefecto() : opciones.reloj;
  if (!reloj) return null;
  const ms = Math.round(reloj.now());
  registrados.set(nombre, ms);
  try {
    reloj.mark?.(nombre);
  } catch {
    /* un mark duplicado no puede tumbar la página */
  }
  if (perfEnConsola() && typeof console !== "undefined") {
    const cola = opciones?.detalle ? ` (${opciones.detalle})` : "";
    console.info(`[integra:perf] ${nombre} · ${ms} ms${cola}`);
  }
  return ms;
}

/** Los hitos registrados hasta ahora, en el orden en que ocurrieron. */
export function hitosRegistrados(): Record<string, number> {
  const salida: Record<string, number> = {};
  for (const [nombre, ms] of [...registrados].sort((a, b) => a[1] - b[1])) {
    salida[nombre] = ms;
  }
  return salida;
}

/**
 * Resumen de una línea por hito, más los tramos entre ellos. Es lo que se pega
 * en un informe: los tramos dicen dónde se va el tiempo, no solo cuándo acabó.
 */
export function resumenHitos(): string {
  const entradas = Object.entries(hitosRegistrados());
  if (entradas.length === 0) return "sin hitos registrados";
  const lineas: string[] = [];
  let anterior: number | null = null;
  for (const [nombre, ms] of entradas) {
    const tramo = anterior == null ? "" : ` (+${ms - anterior} ms)`;
    lineas.push(`${nombre}: ${ms} ms${tramo}`);
    anterior = ms;
  }
  return lineas.join("\n");
}

/** Borra los hitos. Solo para pruebas: en la página cada carga arranca limpia. */
export function reiniciarHitos(): void {
  registrados.clear();
}

declare global {
  interface Window {
    /** `__integraPerf()` en la consola del navegador imprime el resumen. */
    __integraPerf?: () => string;
  }
}

/** Deja el resumen al alcance de la consola del navegador. */
export function exponerResumenEnConsola(): void {
  if (typeof window === "undefined") return;
  window.__integraPerf = resumenHitos;
}
