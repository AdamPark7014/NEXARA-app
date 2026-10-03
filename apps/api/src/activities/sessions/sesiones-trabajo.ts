/**
 * Sesiones de trabajo: la aritmética del tiempo real de una actividad.
 *
 * Lo pidió el dueño así: «Las actividades tienen tiempo indefinido; ninguna puede durar
 * más de 12 horas, eso es imposible… deben reiniciarlas a diario, de lo contrario los KPI
 * toman productividad irreal». El tiempo de una persona en una actividad ya no es un solo
 * intervalo (inicio → fin, con noches y fines de semana dentro) sino la suma de sus
 * sesiones, y cada sesión:
 *
 * - nunca cuenta más de 12 horas, y
 * - nunca pasa del final del día (hora de México) en que empezó.
 *
 * Archivo puro a propósito (nada de Prisma ni de Nest): son cuentas con zonas horarias
 * —el contenedor corre en UTC— y aquí se prueban sin base de datos.
 */
import { WORKDAY_TIMEZONE, workDayEnd } from '../../common/time/workday.js';

/** Tope de una sesión y de cualquier tiempo estimado: 12 horas. */
export const TOPE_SESION_MIN = 12 * 60;
export const HORAS_MAX_ACTIVIDAD = TOPE_SESION_MIN / 60;

export const MENSAJE_TOPE_12H =
  'Una actividad no puede durar más de 12 horas. Si lleva más días, se reanuda cada día.';

/** Motivo de la pausa que pone un jefe: mínimo para que diga algo. */
export const MOTIVO_PAUSA_MIN = 10;
export const MOTIVO_PAUSA_MAX = 500;

/**
 * Por qué se cerró una sesión:
 * - FIN: foto de salida (terminó su parte).
 * - PAUSA: la detuvo la propia persona o su jefe.
 * - SALIDA: checó su salida del día.
 * - TOPE_12H / CORTE_DIA: nadie la cerró; se corta sola.
 */
export type MotivoFinSesion = 'FIN' | 'PAUSA' | 'SALIDA' | 'TOPE_12H' | 'CORTE_DIA';

export type SesionTrabajo = {
  startedAt: Date;
  /** null = sigue corriendo. */
  endedAt: Date | null;
  endReason?: string | null;
  endedById?: number | null;
  nota?: string | null;
  endedBy?: { id: number; nombre: string } | null;
};

/** Tramo en milisegundos. */
export type TramoMs = { inicio: number; fin: number };

/**
 * Hasta dónde puede contar una sesión, pase lo que pase: 12 horas o el final del día
 * en que empezó, lo que llegue antes. El motivo dice cuál de los dos la cortó.
 */
export function topeDeSesion(
  startedAt: Date,
  tz: string = WORKDAY_TIMEZONE,
): { at: Date; motivo: 'TOPE_12H' | 'CORTE_DIA' } {
  const doceHoras = startedAt.getTime() + TOPE_SESION_MIN * 60_000;
  const finDelDia = workDayEnd(startedAt, tz).getTime();
  return doceHoras <= finDelDia
    ? { at: new Date(doceHoras), motivo: 'TOPE_12H' }
    : { at: new Date(finDelDia), motivo: 'CORTE_DIA' };
}

/**
 * Corte de una sesión que sigue abierta en la base pero ya no puede contar
 * (pasaron sus 12 horas o terminó su día). null si todavía corre o ya estaba cerrada.
 */
export function sesionVencida(
  sesion: Pick<SesionTrabajo, 'startedAt' | 'endedAt'>,
  ahora: Date,
  tz: string = WORKDAY_TIMEZONE,
): { at: Date; motivo: 'TOPE_12H' | 'CORTE_DIA' } | null {
  if (sesion.endedAt) return null;
  const tope = topeDeSesion(sesion.startedAt, tz);
  return ahora.getTime() >= tope.at.getTime() ? tope : null;
}

/**
 * Hasta dónde cuenta de verdad una sesión: su cierre (o ahora, si corre), sin pasar
 * nunca de su tope. Un cierre guardado después del tope —un reloj mal puesto, una
 * corrección a mano— tampoco lo rebasa.
 */
export function finEfectivo(
  sesion: Pick<SesionTrabajo, 'startedAt' | 'endedAt'>,
  ahora: Date,
  tz: string = WORKDAY_TIMEZONE,
): Date {
  const hasta = (sesion.endedAt ?? ahora).getTime();
  const tope = topeDeSesion(sesion.startedAt, tz).at.getTime();
  return new Date(Math.max(sesion.startedAt.getTime(), Math.min(hasta, tope)));
}

/** Ordena y funde tramos que se tocan o se enciman; descarta los vacíos. */
export function unirTramos(tramos: TramoMs[]): TramoMs[] {
  const validos = tramos
    .filter((t) => Number.isFinite(t.inicio) && Number.isFinite(t.fin) && t.fin > t.inicio)
    .map((t) => ({ inicio: t.inicio, fin: t.fin }))
    .sort((a, b) => a.inicio - b.inicio);
  const out: TramoMs[] = [];
  for (const t of validos) {
    const ultimo = out[out.length - 1];
    if (ultimo && t.inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, t.fin);
    else out.push(t);
  }
  return out;
}

/** Lo que está en `a` y también en `b`. */
export function cruzarTramos(a: TramoMs[], b: TramoMs[]): TramoMs[] {
  const A = unirTramos(a);
  const B = unirTramos(b);
  const out: TramoMs[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const inicio = Math.max(A[i].inicio, B[j].inicio);
    const fin = Math.min(A[i].fin, B[j].fin);
    if (fin > inicio) out.push({ inicio, fin });
    if (A[i].fin < B[j].fin) i += 1;
    else j += 1;
  }
  return out;
}

/** Minutos completos que cubren los tramos, sin contar dos veces lo encimado. */
export function minutosDeTramosMs(tramos: TramoMs[]): number {
  const ms = unirTramos(tramos).reduce((s, t) => s + (t.fin - t.inicio), 0);
  return Math.floor(ms / 60_000);
}

/**
 * Tramos que de verdad contaron. Dos sesiones encimadas (un doble toque, un reintento)
 * se funden: nunca suman dos veces el mismo minuto.
 */
export function tramosDeSesiones(
  sesiones: Array<Pick<SesionTrabajo, 'startedAt' | 'endedAt'>>,
  ahora: Date,
  tz: string = WORKDAY_TIMEZONE,
): TramoMs[] {
  return unirTramos(
    sesiones
      .filter((s) => s.startedAt instanceof Date && !Number.isNaN(s.startedAt.getTime()))
      .map((s) => ({ inicio: s.startedAt.getTime(), fin: finEfectivo(s, ahora, tz).getTime() })),
  );
}

/** Minutos de una persona en una actividad = suma de sus sesiones. */
export function minutosDeSesiones(
  sesiones: Array<Pick<SesionTrabajo, 'startedAt' | 'endedAt'>>,
  ahora: Date,
  tz: string = WORKDAY_TIMEZONE,
): number {
  return minutosDeTramosMs(tramosDeSesiones(sesiones, ahora, tz));
}

export type FuenteDeTrabajo = {
  /** Inicio y fin del intervalo de antes (`inicioRealAt`/`finRealAt` o las fotos). */
  inicio: Date | null;
  fin: Date | null;
  sesiones?: SesionTrabajo[] | null;
  ahora: Date;
  tz?: string;
};

/**
 * Tramos trabajados de una persona en una actividad.
 *
 * - Con sesiones: sus sesiones, cada una con su tope.
 * - Sin sesiones y ya terminada (dato de antes de esta regla): su intervalo de siempre,
 *   pero nunca más de 12 horas.
 * - Sin sesiones y aún abierta: se mide como una sesión que empezó en su inicio. Es lo
 *   mismo que queda guardado en cuanto la persona la reanuda, así el número no brinca.
 */
export function tramosTrabajados(f: FuenteDeTrabajo): TramoMs[] {
  const tz = f.tz ?? WORKDAY_TIMEZONE;
  if (f.sesiones?.length) return tramosDeSesiones(f.sesiones, f.ahora, tz);
  if (!f.inicio || Number.isNaN(f.inicio.getTime())) return [];
  if (f.fin) {
    const tope = f.inicio.getTime() + TOPE_SESION_MIN * 60_000;
    return unirTramos([{ inicio: f.inicio.getTime(), fin: Math.min(f.fin.getTime(), tope) }]);
  }
  return tramosDeSesiones([{ startedAt: f.inicio, endedAt: null }], f.ahora, tz);
}

/** Minutos trabajados; null mientras no haya iniciado (no es cero: aún no empieza). */
export function minutosTrabajados(f: FuenteDeTrabajo): number | null {
  if (!f.sesiones?.length && !f.inicio) return null;
  return minutosDeTramosMs(tramosTrabajados(f));
}

export type EstadoTrabajo = {
  /** Su reloj corre ahora mismo. */
  enCurso: boolean;
  /** Ya la inició, no la ha terminado y su reloj está detenido: hay que reanudarla. */
  enPausa: boolean;
  /** Por qué se detuvo. null si corre, no ha iniciado o ya terminó. */
  pausaTipo: MotivoFinSesion | null;
  pausadaAt: Date | null;
  /** Quién la pausó (solo en PAUSA). */
  pausadaPor: { id: number; nombre: string } | null;
  motivoPausa: string | null;
  /** Desde cuándo corre la sesión abierta. */
  sesionAbiertaDesde: Date | null;
};

const SIN_ESTADO: EstadoTrabajo = {
  enCurso: false,
  enPausa: false,
  pausaTipo: null,
  pausadaAt: null,
  pausadaPor: null,
  motivoPausa: null,
  sesionAbiertaDesde: null,
};

const MOTIVOS = new Set<string>(['FIN', 'PAUSA', 'SALIDA', 'TOPE_12H', 'CORTE_DIA']);

/**
 * ¿Corre, está en pausa o ninguna de las dos? No hay un estatus nuevo («En Proceso» lo
 * leen demasiadas pantallas): la pausa se deduce de las sesiones.
 */
export function estadoDeTrabajo(f: FuenteDeTrabajo & { terminada?: boolean }): EstadoTrabajo {
  const tz = f.tz ?? WORKDAY_TIMEZONE;
  if (f.terminada || f.fin) return { ...SIN_ESTADO };
  const sesiones: SesionTrabajo[] = f.sesiones?.length
    ? f.sesiones
    : f.inicio
      ? [{ startedAt: f.inicio, endedAt: null }]
      : [];
  if (!sesiones.length) return { ...SIN_ESTADO };

  const abierta = sesiones
    .filter((s) => !s.endedAt && !sesionVencida(s, f.ahora, tz))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  if (abierta) return { ...SIN_ESTADO, enCurso: true, sesionAbiertaDesde: abierta.startedAt };

  const ultima = [...sesiones].sort(
    (a, b) => finEfectivo(b, f.ahora, tz).getTime() - finEfectivo(a, f.ahora, tz).getTime(),
  )[0];
  // Abierta en la base pero ya vencida: el cierre perezoso todavía no pasó por aquí.
  const vencida = sesionVencida(ultima, f.ahora, tz);
  const tipo: MotivoFinSesion = vencida
    ? vencida.motivo
    : MOTIVOS.has(String(ultima.endReason))
      ? (ultima.endReason as MotivoFinSesion)
      : 'PAUSA';
  const esPausa = tipo === 'PAUSA';
  return {
    enCurso: false,
    enPausa: true,
    pausaTipo: tipo,
    pausadaAt: finEfectivo(ultima, f.ahora, tz),
    pausadaPor: esPausa ? (ultima.endedBy ?? null) : null,
    motivoPausa: esPausa ? (ultima.nota?.trim() || null) : null,
    sesionAbiertaDesde: null,
  };
}

/**
 * ¿Sirve este tiempo estimado? Devuelve el mensaje de error, o null si se puede guardar.
 *
 * Vacío o cero sigue siendo «sin estimado» (las apps instaladas no siempre lo mandan);
 * lo que no pasa es un estimado de más de 12 horas.
 */
export function errorDeHorasPlan(horas: unknown): string | null {
  if (horas == null || horas === '') return null;
  const n = Number(horas);
  if (!Number.isFinite(n)) return 'El tiempo estimado no es válido.';
  return n > HORAS_MAX_ACTIVIDAD ? MENSAJE_TOPE_12H : null;
}

/** Igual, para un estimado en minutos (`Activity.tiempoEstimadoMin`). */
export function errorDeMinutosPlan(minutos: unknown): string | null {
  if (minutos == null || minutos === '') return null;
  const n = Number(minutos);
  if (!Number.isFinite(n)) return 'El tiempo estimado no es válido.';
  return n > TOPE_SESION_MIN ? MENSAJE_TOPE_12H : null;
}

/** Motivo de pausa limpio, o null si no alcanza el mínimo. */
export function motivoDePausa(valor: unknown): string | null {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto.length >= MOTIVO_PAUSA_MIN ? texto.slice(0, MOTIVO_PAUSA_MAX) : null;
}
