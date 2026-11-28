/**
 * Rastro de los trabajos de la cola que fallaron del todo (agotaron sus intentos), en la memoria del proceso.
 *
 * Es puro (sin Nest, sin base de datos): un anillo de `FALLOS_COLA_MAX` entradas. Lo alimenta `JobQueueService` en los
 * tres puntos donde un trabajo se da por perdido y lo leerá el volcado a base de datos (C8), que se lleva las entradas
 * pendientes con `drenar()` para que un despliegue no las borre.
 *
 * Por qué existe aparte del DLQ del servicio: el DLQ guarda el trabajo completo (con su `payload`) y crece sin tope; esto
 * guarda solo lo que se puede mostrar y persistir sin riesgo.
 *   - `error` ya pasa por `errorCorto`: una línea, sin correos, tokens ni números largos.
 *   - `claves` son los NOMBRES de las llaves del payload, nunca sus valores (un payload puede traer correos o datos de
 *     clientes). Un nombre que no parece un identificador se reemplaza por `[clave]`.
 *
 * Regla de oro, igual que el latido: REGISTRAR NUNCA PUEDE ROMPER A LA COLA. Nada de aquí lanza.
 */

import { errorCorto } from '../common/cron/error-corto.js';

export const FALLOS_COLA_MAX = 200;
/** Cuántas llaves de payload se anotan por fallo, y cuánto mide cada nombre. */
export const CLAVES_MAX = 20;
const CLAVE_LARGO_MAX = 48;
const COLA_LARGO_MAX = 120;
const JOB_ID_LARGO_MAX = 120;

const CLAVE_SEGURA = /^[A-Za-z0-9_.-]{1,48}$/;

/** Un trabajo perdido, tal como se guarda y se vuelca. */
export interface FalloCola {
  /** Nombre del trabajo (`supplier.ct.sync`), no el de la cola de BullMQ. */
  cola: string;
  jobId: string;
  intentos: number;
  /** Ya saneado con `errorCorto`. */
  error: string;
  /** Nombres de las llaves del payload; nunca sus valores. */
  claves: string[];
  /** Milisegundos desde 1970 en que se registró. */
  ocurridoMs: number;
}

export interface EntradaFalloCola {
  cola: string;
  jobId: string | number | null | undefined;
  intentos: number;
  /** Cualquier valor lanzado: aquí se sanea. */
  error: unknown;
  /** Nombres de llaves (usa `clavesDe(payload)` para sacarlos de un payload). */
  claves?: readonly string[];
  ahoraMs?: number;
}

interface Guardado extends FalloCola {
  /** Falta volcarlo a la base. */
  pendiente: boolean;
}

const anillo: Guardado[] = [];
let totalRegistrados = 0;

/** Nombres seguros de las llaves de un payload (nunca valores). Un valor que no sea objeto da lista vacía. */
export function clavesDe(payload: unknown): string[] {
  try {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return [];
    const nombres: string[] = [];
    for (const llave of Object.keys(payload)) {
      const nombre = CLAVE_SEGURA.test(llave) ? llave.slice(0, CLAVE_LARGO_MAX) : '[clave]';
      if (!nombres.includes(nombre)) nombres.push(nombre);
      if (nombres.length >= CLAVES_MAX) break;
    }
    return nombres;
  } catch {
    return [];
  }
}

function limpiarClaves(claves: readonly string[] | undefined): string[] {
  if (!Array.isArray(claves)) return [];
  const nombres: string[] = [];
  for (const clave of claves) {
    if (typeof clave !== 'string') continue;
    const nombre = CLAVE_SEGURA.test(clave) ? clave.slice(0, CLAVE_LARGO_MAX) : '[clave]';
    if (!nombres.includes(nombre)) nombres.push(nombre);
    if (nombres.length >= CLAVES_MAX) break;
  }
  return nombres;
}

function aEntero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Anota un trabajo perdido. Devuelve lo que quedó guardado, o `null` si no se pudo (nunca lanza).
 * Con el anillo lleno se va el más viejo.
 */
export function registrarFalloCola(entrada: EntradaFalloCola): FalloCola | null {
  try {
    const guardado: Guardado = {
      cola: String(entrada.cola ?? '').slice(0, COLA_LARGO_MAX),
      jobId: String(entrada.jobId ?? '').slice(0, JOB_ID_LARGO_MAX),
      intentos: aEntero(entrada.intentos),
      error: errorCorto(entrada.error),
      claves: limpiarClaves(entrada.claves),
      ocurridoMs: Number.isFinite(entrada.ahoraMs) ? Number(entrada.ahoraMs) : Date.now(),
      pendiente: true,
    };
    anillo.push(guardado);
    if (anillo.length > FALLOS_COLA_MAX) anillo.splice(0, anillo.length - FALLOS_COLA_MAX);
    totalRegistrados += 1;
    return copiar(guardado);
  } catch {
    return null;
  }
}

function copiar({ pendiente: _pendiente, ...fallo }: Guardado): FalloCola {
  return { ...fallo, claves: [...fallo.claves] };
}

/** Los fallos guardados, el más nuevo primero. Copias: nadie de afuera modifica el anillo. */
export function fallosRecientes(): FalloCola[] {
  return anillo.map(copiar).reverse();
}

/**
 * Entrega, la más vieja primero, lo que aún no se volcó y lo marca como entregado: una segunda llamada devuelve vacío.
 * Siguen en el anillo para `fallosRecientes()`. Si el volcado falla, `devolverFallos` los deja pendientes otra vez.
 */
export function drenarFallosCola(): FalloCola[] {
  const pendientes = anillo.filter((f) => f.pendiente);
  for (const f of pendientes) f.pendiente = false;
  return pendientes.map(copiar);
}

/** El volcado no pudo guardar estos fallos: vuelven a quedar pendientes (si aún siguen en el anillo). */
export function devolverFallos(fallos: readonly FalloCola[]): void {
  for (const fallo of fallos ?? []) {
    const guardado = anillo.find(
      (f) => f.cola === fallo.cola && f.jobId === fallo.jobId && f.ocurridoMs === fallo.ocurridoMs,
    );
    if (guardado) guardado.pendiente = true;
  }
}

/** Cuántos fallos se han registrado desde que arrancó el proceso (no baja cuando el anillo se llena). */
export function totalFallosCola(): number {
  return totalRegistrados;
}

/** Para pruebas: vacía el anillo y el contador. */
export function reiniciarFallosCola(): void {
  anillo.length = 0;
  totalRegistrados = 0;
}

export const fallosCola = {
  registrar: registrarFalloCola,
  recientes: fallosRecientes,
  drenar: drenarFallosCola,
  devolver: devolverFallos,
  total: totalFallosCola,
  reiniciar: reiniciarFallosCola,
  clavesDe,
};
