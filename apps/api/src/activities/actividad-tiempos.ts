/**
 * Reglas puras de aceptación, prioridad y tiempo de una actividad.
 *
 * Viven aparte del servicio para que Android, iOS y la web lean exactamente
 * las mismas definiciones (contrato del 18-09, sección B) y para poder probarlas
 * sin base de datos.
 */

export type Prioridad = 'ALTA' | 'MEDIA' | 'BAJA';
export type Aceptacion = 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
export type Semaforo = 'rojo' | 'amarillo' | 'verde';

/** Umbral de «ya casi se acaba el tiempo» (amarillo mientras sigue en curso). */
export const UMBRAL_AMARILLO = 0.8;

/** Radio a partir del cual iniciar lejos del sitio del cliente genera aviso. */
export const RADIO_SITIO_M = 300;

const ALTA = new Set(['alta', 'urgente', 'critica', 'crítica', 'p0', 'p1', 'high', 'urgent']);
const BAJA = new Set(['baja', 'low', 'p3', 'p4']);

/**
 * Prioridad normalizada. Acepta los textos viejos («Alta», «urgente», «P1») y
 * cualquier cosa desconocida o vacía cae en MEDIA: nunca devuelve null, porque
 * el semáforo y el orden dependen de tener siempre un valor.
 */
export function normalizarPrioridad(valor?: string | null): Prioridad {
  const v = String(valor ?? '').trim().toLowerCase();
  if (ALTA.has(v)) return 'ALTA';
  if (BAJA.has(v)) return 'BAJA';
  return 'MEDIA';
}

/** ALTA primero, luego MEDIA (o sin prioridad), luego BAJA. */
export function rangoPrioridad(valor?: string | null): number {
  const p = normalizarPrioridad(valor);
  return p === 'ALTA' ? 0 : p === 'BAJA' ? 2 : 1;
}

/** `horasPlan` (Decimal de Prisma, número o texto) a minutos enteros; null si no hay plan. */
export function minutosPlan(horasPlan: unknown): number | null {
  if (horasPlan == null) return null;
  const n = Number(horasPlan);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 60);
}

/**
 * Minutos realmente dedicados: del inicio real al fin real, o a «ahora» si sigue en curso.
 * null mientras no haya iniciado (no es cero: es que todavía no empieza).
 */
export function minutosReales(
  inicioRealAt?: Date | string | null,
  finRealAt?: Date | string | null,
  ahora: Date = new Date(),
): number | null {
  const inicio = aFecha(inicioRealAt);
  if (!inicio) return null;
  const fin = aFecha(finRealAt) ?? ahora;
  const min = Math.round((fin.getTime() - inicio.getTime()) / 60_000);
  return min > 0 ? min : 0;
}

/** Pasó de su tiempo estimado. Sin plan o sin iniciar, nunca está excedida. */
export function estaExcedida(plan: number | null, reales: number | null): boolean {
  if (plan == null || plan <= 0 || reales == null) return false;
  return reales > plan;
}

/** Estado de la aceptación a partir de las dos marcas de tiempo. */
export function aceptacionDe(fila: {
  aceptadaAt?: Date | null;
  rechazadaAt?: Date | null;
}): Aceptacion {
  if (fila.rechazadaAt) return 'RECHAZADA';
  if (fila.aceptadaAt) return 'ACEPTADA';
  return 'PENDIENTE';
}

/**
 * La foto de entrada acepta sola: las apps publicadas no tienen botón de aceptar,
 * así que empezar el trabajo vale como aceptación.
 */
export function debeAutoAceptar(fila: { aceptadaAt?: Date | null }): boolean {
  return !fila.aceptadaAt;
}

/**
 * Regla del dueño (18-09): «El asignado de realizar una tarea/actividad no tiene
 * opción de aceptar o rechazar las actividades asignadas, únicamente iniciarlas».
 * Es lo que recibe una app instalada que todavía intenta rechazar.
 */
export const MENSAJE_SIN_RECHAZO =
  'Ya no se rechazan actividades: iníciala o habla con tu jefe para reasignarla';

export type CambiosAlIniciar = {
  /** Lo que se guarda en `ActivityAssignee` (vacío = nada que cambiar). */
  data: {
    aceptadaAt?: Date;
    rechazadaAt?: null;
    motivoRechazo?: null;
    inicioRealAt?: Date;
  };
  aceptadaAt: Date;
  inicioRealAt: Date | null;
  /** Se marcó el inicio en esta llamada (para avisar y mover el estatus una sola vez). */
  recienIniciada: boolean;
};

/**
 * Qué guarda «Iniciar actividad» en la fila de quien la recibe:
 * - El inicio real se marca la primera vez y ya no se mueve (tocarlo otra vez, o la
 *   foto de entrada después, respetan esa hora).
 * - Iniciar vale como aceptación y limpia un rechazo de antes de la regla.
 * - Quien solo reparte un despacho no la ejecuta: queda constancia de que la vio,
 *   sin inicio real (su trabajo es pasarla a su gente).
 */
export function cambiosAlIniciar(
  fila: { aceptadaAt?: Date | null; rechazadaAt?: Date | null; inicioRealAt?: Date | null },
  opciones: { despachador?: boolean; ahora?: Date } = {},
): CambiosAlIniciar {
  const ahora = opciones.ahora ?? new Date();
  const data: CambiosAlIniciar['data'] = {};
  if (!fila.aceptadaAt) data.aceptadaAt = ahora;
  if (fila.rechazadaAt) {
    data.rechazadaAt = null;
    data.motivoRechazo = null;
  }
  const marcarInicio = !opciones.despachador && !fila.inicioRealAt;
  if (marcarInicio) data.inicioRealAt = ahora;
  return {
    data,
    aceptadaAt: fila.aceptadaAt ?? ahora,
    inicioRealAt: fila.inicioRealAt ?? (marcarInicio ? ahora : null),
    recienIniciada: marcarInicio,
  };
}

/**
 * Semáforo del contrato:
 * - rojo: vencida (pasó `fechaMaxima`), excedida, o prioridad ALTA sin iniciar.
 * - amarillo: prioridad MEDIA sin iniciar, o en curso con más del 80 % del plan consumido.
 * - verde: lo demás (incluida la que ya terminó a tiempo).
 */
export function semaforoDe(params: {
  prioridad?: string | null;
  fechaMaxima?: Date | string | null;
  inicioRealAt?: Date | string | null;
  finRealAt?: Date | string | null;
  minutosPlan?: number | null;
  minutosReales?: number | null;
  /** Cerrada (finalizada, aprobada o cancelada): ya no se le exige fecha. */
  cerrada?: boolean;
  ahora?: Date;
}): Semaforo {
  const ahora = params.ahora ?? new Date();
  const plan = params.minutosPlan ?? null;
  const reales = params.minutosReales ?? null;
  if (estaExcedida(plan, reales)) return 'rojo';

  const terminada = Boolean(aFecha(params.finRealAt)) || Boolean(params.cerrada);
  if (terminada) return 'verde';

  const maxima = aFecha(params.fechaMaxima);
  if (maxima && maxima.getTime() < ahora.getTime()) return 'rojo';

  const iniciada = Boolean(aFecha(params.inicioRealAt));
  if (!iniciada) {
    const prioridad = normalizarPrioridad(params.prioridad);
    if (prioridad === 'ALTA') return 'rojo';
    if (prioridad === 'MEDIA') return 'amarillo';
    return 'verde';
  }

  if (plan != null && plan > 0 && reales != null && reales >= plan * UMBRAL_AMARILLO) return 'amarillo';
  return 'verde';
}

/** Vista de tiempos y semáforo que consumen `me/activities`, el detalle y las apps. */
export function tiemposDto(
  fila: {
    aceptadaAt?: Date | null;
    rechazadaAt?: Date | null;
    motivoRechazo?: string | null;
    inicioRealAt?: Date | null;
    finRealAt?: Date | null;
    horasPlan?: unknown;
    saltoPrioridad?: boolean | null;
  },
  actividad: {
    prioridad?: string | null;
    fechaMaxima?: Date | null;
    estatus?: string | null;
  },
  ahora: Date = new Date(),
) {
  const plan = minutosPlan(fila.horasPlan);
  const reales = minutosReales(fila.inicioRealAt, fila.finRealAt, ahora);
  const cerrada = esCerrada(actividad.estatus);
  return {
    aceptacion: aceptacionDe(fila),
    motivoRechazo: fila.motivoRechazo ?? null,
    prioridad: normalizarPrioridad(actividad.prioridad),
    semaforo: semaforoDe({
      prioridad: actividad.prioridad,
      fechaMaxima: actividad.fechaMaxima ?? null,
      inicioRealAt: fila.inicioRealAt ?? null,
      finRealAt: fila.finRealAt ?? null,
      minutosPlan: plan,
      minutosReales: reales,
      cerrada,
      ahora,
    }),
    minutosPlan: plan,
    minutosReales: reales,
    excedida: estaExcedida(plan, reales),
    inicioRealAt: fila.inicioRealAt ?? null,
    finRealAt: fila.finRealAt ?? null,
    saltoPrioridad: Boolean(fila.saltoPrioridad),
  };
}

/** Estatus cerrados (mismo criterio que el resto de actividades). */
export function esCerrada(estatus?: string | null): boolean {
  return /finalizada|completada|cancelada|aprobada/.test(String(estatus ?? '').toLowerCase());
}

/** `horasPlan` válido para guardar (Decimal 6,2): entre 0 y 999.99 horas, o null. */
export function horasPlanValidas(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(999.99, Math.round(n * 100) / 100);
}

function aFecha(valor?: Date | string | null): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}
