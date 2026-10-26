/**
 * Cadencia del GPS de jornada: un punto cada 30 minutos, de la entrada a la salida.
 *
 * Adam (23-10-2026), viendo el detalle de Iván: «debe tomarse cada media hora, no que se tomó
 * cada minuto casi casi a las ocho y desde entonces no». Había dos problemas a la vez: ráfagas
 * (la checada guardaba un punto y la app mandaba otro segundos después; con una actividad en curso
 * la app mandaba cada 5–10 min) y huecos de horas.
 *
 * Aquí viven las reglas que el servidor aplica a cualquier versión de la app:
 *
 * - Un punto que cae a menos de {@link ESPACIADO_MINIMO_MS} de otro ya guardado de la misma persona
 *   no se guarda (la geocerca de la actividad sí lo mide). Así una app vieja que manda cada 5 min
 *   deja un punto cada ~20–30 min y la checada no se duplica con el primer punto del teléfono.
 * - La hora del punto es la del teléfono al medirlo (`ultimaActualizacion`), para que un punto que
 *   esperó en la cola sin conexión —o tras volver a iniciar sesión— quede en su lugar del recorrido.
 *   Con dos topes: nada del futuro y nada de hace más de un día.
 * - El «latido»: con la jornada abierta y {@link LATIDO_SIN_PUNTO_MS} sin punto, el servidor le pide
 *   al teléfono uno (push de datos en Android; recordatorio visible en iOS, que sin «Siempre» no
 *   puede medir con la app cerrada).
 *
 * Sin Prisma ni Nest: se prueba en `cadencia-jornada.spec.ts`.
 */

/** Lo que la app intenta: un punto cada media hora. */
export const CADENCIA_JORNADA_MS = 30 * 60_000;

/**
 * Separación mínima entre dos puntos guardados. Menos que la cadencia: la alarma de Android es
 * inexacta (puede adelantarse o atrasarse unos minutos) y no se debe tirar un punto bueno.
 */
export const ESPACIADO_MINIMO_MS = 20 * 60_000;

/** Más viejo que esto no se acepta: no dice nada del recorrido de hoy. */
export const ANTIGUEDAD_MAXIMA_MS = 24 * 60 * 60_000;

/** Solo un punto «de ahora» alimenta la geocerca y la ubicación de la entrada. */
export const PUNTO_RECIENTE_MS = 10 * 60_000;

/** Sin punto en este tiempo (con la jornada abierta), el servidor le pide uno al teléfono. */
export const LATIDO_SIN_PUNTO_MS = 35 * 60_000;

/** Android: un latido de datos como mucho cada 30 min por persona. */
export const LATIDO_REPETIR_MS = 30 * 60_000;

/** iOS: el recordatorio es visible; como mucho uno por hora para no volverse ruido. */
export const RECORDATORIO_IOS_REPETIR_MS = 60 * 60_000;

/**
 * Hora con la que se guarda un punto.
 *
 * - Sin hora del teléfono (o inválida): la del servidor.
 * - Del futuro (reloj adelantado): la del servidor.
 * - Más vieja que {@link ANTIGUEDAD_MAXIMA_MS}: `null` (no se guarda).
 */
export function horaDelPunto(cliente: Date | string | null | undefined, ahora: Date): Date | null {
  if (cliente == null || cliente === '') return ahora;
  const t = cliente instanceof Date ? cliente : new Date(cliente);
  if (Number.isNaN(t.getTime())) return ahora;
  const diff = t.getTime() - ahora.getTime();
  // Reloj del teléfono adelantado (poco o mucho): el punto es de ahora, no del futuro.
  if (diff > 0) return ahora;
  if (-diff > ANTIGUEDAD_MAXIMA_MS) return null;
  return t;
}

/** ¿Hay un punto guardado a menos de `espaciadoMs` de `t`? Entonces este no se guarda. */
export function hayPuntoCercano(t: Date, guardados: Date[], espaciadoMs = ESPACIADO_MINIMO_MS): boolean {
  return guardados.some((g) => Math.abs(g.getTime() - t.getTime()) < espaciadoMs);
}

/** ¿El punto es «de ahora»? (no un rezagado de la cola sin conexión). */
export function esPuntoReciente(t: Date, ahora: Date): boolean {
  return ahora.getTime() - t.getTime() <= PUNTO_RECIENTE_MS;
}

export type PlataformaJornada = 'ANDROID' | 'IOS' | 'OTRA';

export function plataformaDeOrigen(origen: string | null | undefined): PlataformaJornada {
  const v = String(origen ?? '').trim().toUpperCase();
  if (v === 'ANDROID') return 'ANDROID';
  if (v === 'IOS') return 'IOS';
  return 'OTRA';
}

/**
 * ¿Toca pedirle un punto al teléfono?
 *
 * @param entradaAt hora de la entrada (inicio de la jornada abierta).
 * @param ultimoPuntoAt último punto guardado desde la entrada (null si no hay).
 * @param ultimoLatidoAt último latido/recordatorio enviado a esta persona (en memoria del API).
 */
export function necesitaLatido(params: {
  ahora: Date;
  entradaAt: Date;
  ultimoPuntoAt: Date | null;
  ultimoLatidoAt: Date | null;
  plataforma: PlataformaJornada;
}): boolean {
  const { ahora, entradaAt, ultimoPuntoAt, ultimoLatidoAt, plataforma } = params;
  // La web no rastrea: no hay a quién pedirle nada.
  if (plataforma === 'OTRA') return false;
  const referencia = ultimoPuntoAt && ultimoPuntoAt > entradaAt ? ultimoPuntoAt : entradaAt;
  if (ahora.getTime() - referencia.getTime() < LATIDO_SIN_PUNTO_MS) return false;
  const repetir = plataforma === 'IOS' ? RECORDATORIO_IOS_REPETIR_MS : LATIDO_REPETIR_MS;
  if (ultimoLatidoAt && ahora.getTime() - ultimoLatidoAt.getTime() < repetir) return false;
  return true;
}

/** «08:20» en hora de México: para el texto del recordatorio. */
export function horaCortaMexico(at: Date, tz = 'America/Mexico_City'): string {
  return at.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
}
