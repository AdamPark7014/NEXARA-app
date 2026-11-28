/**
 * Latido de las tareas programadas: qué tarea se disparó, cuándo, cuánto tardó y cómo terminó.
 *
 * Es puro (sin Nest, sin base de datos) y vive en la memoria del proceso: un `Map` por nombre de tarea. Lo alimenta
 * `runScheduledJob` y lo lee el vigilante (`evaluar-tareas.ts`). Memoria acotada: un estado por tarea (62 hoy, con
 * tope de 200 por si alguien pasa nombres dinámicos) y un anillo de las últimas 10 corridas de cada una.
 *
 * Regla de oro: REGISTRAR NUNCA PUEDE ROMPER UNA TAREA. Por eso `runScheduledJob` llama cada función de aquí dentro de
 * su propio `try/catch` vacío, y aquí no se lanza nada a propósito.
 *
 * Interruptor de emergencia: `PULSO_LATIDO=0` en el entorno (reiniciar la API) deja de registrar todo. No cambia la
 * tarea: sigue corriendo igual, solo sin dejar rastro en memoria. Con el latido apagado no hay con qué juzgar: el
 * vigilante calla (ni log ni medidores) y `GET /api/pulso/tareas` dice «sin datos» en lugar de «atrasada».
 *
 * LIMITACIÓN CONOCIDA (léela antes de confiar en un «ok»)
 * -------------------------------------------------------
 * El latido dice «la tarea se disparó y terminó (o falló)». NO dice «hizo su trabajo». Una tarea que solo encola
 * trabajo (CT, buzón del SAT) o que devuelve el error en lugar de lanzarlo (precalentar y sondear de INTEGRA) marca
 * `ok` aunque el trabajo real falle. La verdad del trabajo la dan las comprobaciones de salud (C3), que leen
 * `supplier_catalog_sync_runs`, `integra_sync_runs` y la cola.
 */

export type ResultadoTarea = 'ok' | 'error' | 'saltada';

/** Una corrida terminada, para el anillo de las últimas 10. Las vueltas saltadas solo se cuentan, no entran aquí. */
export interface CorridaTarea {
  /** Milisegundos desde 1970 en que arrancó. */
  inicio: number;
  ms: number;
  resultado: 'ok' | 'error';
  /** Ya saneado con `errorCorto`. */
  error?: string;
}

export interface EstadoTarea {
  nombre: string;
  /** Corridas terminadas (con éxito o con error). */
  corridas: number;
  fallos: number;
  /** Vueltas que se saltaron porque la anterior seguía corriendo. */
  saltadas: number;
  ultimoInicio: number | null;
  ultimoFin: number | null;
  ultimoOk: number | null;
  ultimoResultado: ResultadoTarea | null;
  /** Ya saneado con `errorCorto`. */
  ultimoError: string | null;
  duracionUltimaMs: number | null;
  duracionMaxMs: number | null;
  fallosSeguidos: number;
  /** Si no es null, la tarea sigue corriendo desde ese instante. */
  enCursoDesde: number | null;
  /** Cuándo se avisó por última vez de esta tarea (lo usa el vigilante para no repetir el aviso). */
  avisadoAt: number | null;
  /** Hay cambios que el volcado a base de datos (1B) aún no guardó. */
  sucio: boolean;
  /** Últimas 10 corridas terminadas, la más vieja primero. */
  recientes: CorridaTarea[];
}

/** Lo que el volcado guarda y `hidratar` devuelve al arrancar. Las fechas pueden venir como `Date` o como número. */
export interface FilaLatido {
  nombre: string;
  corridas?: number | null;
  fallos?: number | null;
  saltadas?: number | null;
  ultimoInicio?: Date | number | null;
  ultimoFin?: Date | number | null;
  ultimoOk?: Date | number | null;
  ultimoResultado?: string | null;
  ultimoError?: string | null;
  duracionUltimaMs?: number | null;
  duracionMaxMs?: number | null;
  fallosSeguidos?: number | null;
  avisadoAt?: Date | number | null;
}

export const ANILLO_CORRIDAS = 10;
/** Tope de tareas distintas en memoria: hoy son 62; esto solo protege contra nombres armados al vuelo. */
export const MAX_TAREAS_LATIDO = 200;

const estados = new Map<string, EstadoTarea>();
let arranque = Date.now();

/** ¿Está encendido el latido? `PULSO_LATIDO=0` (o false, off, no) lo apaga. Se lee en cada llamada: sin caché. */
export function latidoEncendido(): boolean {
  const valor = (process.env.PULSO_LATIDO ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(valor);
}

function nuevoEstado(nombre: string): EstadoTarea {
  return {
    nombre,
    corridas: 0,
    fallos: 0,
    saltadas: 0,
    ultimoInicio: null,
    ultimoFin: null,
    ultimoOk: null,
    ultimoResultado: null,
    ultimoError: null,
    duracionUltimaMs: null,
    duracionMaxMs: null,
    fallosSeguidos: 0,
    enCursoDesde: null,
    avisadoAt: null,
    sucio: false,
    recientes: [],
  };
}

/** El estado de una tarea, creándolo si hace falta. `null` si ya no caben más nombres (nunca lanza). */
function estadoDe(nombre: string): EstadoTarea | null {
  let estado = estados.get(nombre);
  if (!estado) {
    if (estados.size >= MAX_TAREAS_LATIDO) return null;
    estado = nuevoEstado(nombre);
    estados.set(nombre, estado);
  }
  return estado;
}

function aMs(valor: Date | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const n = valor instanceof Date ? valor.getTime() : Number(valor);
  return Number.isFinite(n) ? n : null;
}

function aEntero(valor: number | null | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** La tarea arrancó. */
function inicio(nombre: string, ahoraMs: number = Date.now()): void {
  if (!latidoEncendido()) return;
  const estado = estadoDe(nombre);
  if (!estado) return;
  estado.ultimoInicio = ahoraMs;
  estado.enCursoDesde = ahoraMs;
  estado.sucio = true;
}

/** La tarea terminó. `ms` es lo que tardó. */
function fin(
  nombre: string,
  resultado: 'ok' | 'error',
  ms: number,
  error?: string,
  ahoraMs: number = Date.now(),
): void {
  if (!latidoEncendido()) return;
  const estado = estadoDe(nombre);
  if (!estado) return;
  const duracion = Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : 0;
  const empezo = estado.enCursoDesde ?? ahoraMs - duracion;
  estado.corridas += 1;
  estado.enCursoDesde = null;
  estado.ultimoFin = ahoraMs;
  estado.ultimoResultado = resultado;
  estado.duracionUltimaMs = duracion;
  estado.duracionMaxMs = Math.max(estado.duracionMaxMs ?? 0, duracion);
  if (resultado === 'ok') {
    estado.ultimoOk = ahoraMs;
    // `ultimoError` se conserva: es el último error que tuvo la tarea, aunque ya se haya recuperado.
    estado.fallosSeguidos = 0;
  } else {
    estado.fallos += 1;
    estado.fallosSeguidos += 1;
    estado.ultimoError = error ?? null;
  }
  estado.recientes.push({ inicio: empezo, ms: duracion, resultado, ...(resultado === 'error' && error ? { error } : {}) });
  if (estado.recientes.length > ANILLO_CORRIDAS) estado.recientes.splice(0, estado.recientes.length - ANILLO_CORRIDAS);
  estado.sucio = true;
}

/** Se saltó una vuelta porque la anterior seguía corriendo. */
function saltada(nombre: string): void {
  if (!latidoEncendido()) return;
  const estado = estadoDe(nombre);
  if (!estado) return;
  estado.saltadas += 1;
  estado.ultimoResultado = 'saltada';
  estado.sucio = true;
}

/** Copia de todos los estados (nadie de afuera puede modificar la memoria del latido). Ordenada por nombre. */
function instantanea(): EstadoTarea[] {
  return [...estados.values()]
    .map((e) => ({ ...e, recientes: e.recientes.map((c) => ({ ...c })) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Devuelve a memoria lo que el volcado guardó (1B), para que un despliegue no borre el historial de las tareas de
 * más de una hora. Solo llena tareas que todavía no tienen estado en este proceso: lo que ya corrió aquí es más
 * reciente que cualquier fila. Las filas hidratadas quedan limpias (`sucio: false`).
 */
function hidratar(filas: FilaLatido[]): number {
  let hidratadas = 0;
  for (const fila of filas ?? []) {
    try {
      if (!fila || typeof fila.nombre !== 'string' || !fila.nombre || estados.has(fila.nombre)) continue;
      const estado = estadoDe(fila.nombre);
      if (!estado) break;
      estado.corridas = aEntero(fila.corridas);
      estado.fallos = aEntero(fila.fallos);
      estado.saltadas = aEntero(fila.saltadas);
      estado.ultimoInicio = aMs(fila.ultimoInicio);
      estado.ultimoFin = aMs(fila.ultimoFin);
      estado.ultimoOk = aMs(fila.ultimoOk);
      estado.ultimoResultado =
        fila.ultimoResultado === 'ok' || fila.ultimoResultado === 'error' || fila.ultimoResultado === 'saltada'
          ? fila.ultimoResultado
          : null;
      estado.ultimoError = typeof fila.ultimoError === 'string' ? fila.ultimoError : null;
      estado.duracionUltimaMs = fila.duracionUltimaMs ?? null;
      estado.duracionMaxMs = fila.duracionMaxMs ?? null;
      estado.fallosSeguidos = aEntero(fila.fallosSeguidos);
      estado.avisadoAt = aMs(fila.avisadoAt);
      estado.sucio = false;
      hidratadas += 1;
    } catch {
      // Una fila rara no debe impedir hidratar las demás.
    }
  }
  return hidratadas;
}

/**
 * El vigilante avisó de esta tarea: no volver a avisar hasta que se recupere.
 *
 * Una tarea que nunca corrió desde el arranque no tiene estado todavía, y es justo la que el vigilante avisa como
 * «atrasada»: por eso aquí SÍ se crea el estado si falta (vacío, solo con `avisadoAt`), si el latido está encendido y
 * quedan lugares. Devuelve `true` si el aviso quedó anotado; `false` si no hubo dónde (latido apagado o tope de nombres
 * lleno), para que quien llama no dé por hecho que se recordará. Nunca lanza.
 */
function marcarAvisada(nombre: string, ahoraMs: number = Date.now()): boolean {
  const estado = estados.get(nombre) ?? (latidoEncendido() ? estadoDe(nombre) : null);
  if (!estado) return false;
  estado.avisadoAt = ahoraMs;
  estado.sucio = true;
  return true;
}

/** La tarea se recuperó: el vigilante vuelve a armar su aviso (si falla otra vez, avisará de nuevo). */
function limpiarAviso(nombre: string): void {
  const estado = estados.get(nombre);
  if (!estado) return;
  estado.avisadoAt = null;
  estado.sucio = true;
}

/** El volcado ya guardó estas tareas. */
function marcarLimpias(nombres: string[]): void {
  for (const nombre of nombres) {
    const estado = estados.get(nombre);
    if (estado) estado.sucio = false;
  }
}

/**
 * Instante en que arrancó este proceso. El vigilante lo usa para dos cosas: dar una gracia corta a las tareas cuyo
 * historial es de antes del reinicio (`ultimoInicio` menor que esto, lo que devuelve `hidratar`) y como referencia de
 * las tareas sin historial. Las que sí tienen historial se juzgan por su silencio real, no desde aquí.
 */
function arranqueMs(): number {
  return arranque;
}

/** Para pruebas: borra todo y vuelve a empezar el reloj de arranque. */
export function reiniciarLatido(ahoraMs: number = Date.now()): void {
  estados.clear();
  arranque = ahoraMs;
}

export const latido = {
  inicio,
  fin,
  saltada,
  instantanea,
  hidratar,
  marcarAvisada,
  limpiarAviso,
  marcarLimpias,
  arranqueMs,
  reiniciar: reiniciarLatido,
};
