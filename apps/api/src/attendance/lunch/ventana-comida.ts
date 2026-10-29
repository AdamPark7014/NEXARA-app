/**
 * Ventana de comida según el horario de cada quien (29-10-2026, «aprueba todo» de Adam):
 *
 * - Oficina (entra a las 10:00 o después, o sin horario propio): fija, de 15:00 a 16:00. Sale en
 *   ese rango y regresa a más tardar a las 16:05.
 * - Quien entra antes de las 10:00 (la cuadrilla de campo, de 08:00 a 17:00): una hora libre entre
 *   su entrada + 5 h y su salida (13:00 a 17:00). Sale cuando quiera dentro de ese rango, con tiempo
 *   para la hora completa, y regresa a más tardar 65 min después de salir, sin pasar de su salida
 *   + 5 min.
 *
 * Fuera de eso se pide justificación y queda por revisar. Lo usan la checada de comida, sus
 * avisos y la entrega calculada de actividades. Módulo puro.
 */

export const MINUTOS_DE_COMIDA = 60;
/** Tolerancia para volver de comer. */
export const TOLERANCIA_REGRESO_MIN = 5;
/** Antes de esta hora de entrada, la comida es libre dentro de la tarde. */
const ENTRADA_DE_OFICINA_MIN = 10 * 60;

export type VentanaComida = {
  tipo: 'fija' | 'libre';
  /** Desde cuándo se puede salir a comer (`HH:MM`). */
  desde: string;
  /** Hasta cuándo dura la ventana (`HH:MM`): en la fija, la hora de regreso; en la libre, la salida. */
  hasta: string;
  minutos: number;
  /** Para los mensajes: «3:00 a 4:00 p.m.» o «una hora entre 1:00 y 5:00 p.m.». */
  texto: string;
};

function minutos(hm: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hm ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** «3:00», «1:00» (reloj de 12 h, sin a. m./p. m.). */
function reloj12(min: number): string {
  const h = Math.floor(min / 60) % 12 || 12;
  return `${h}:${String(min % 60).padStart(2, '0')}`;
}

const sufijo = (min: number) => (min >= 12 * 60 ? 'p.m.' : 'a.m.');

/** La ventana de comida de un horario (`horarioDePersona`). */
export function ventanaDeComida(horario: { entrada?: string | null; salida?: string | null } | null | undefined): VentanaComida {
  const entrada = minutos(horario?.entrada);
  if (entrada == null || entrada >= ENTRADA_DE_OFICINA_MIN) {
    return { tipo: 'fija', desde: '15:00', hasta: '16:00', minutos: MINUTOS_DE_COMIDA, texto: '3:00 a 4:00 p.m.' };
  }
  const desde = entrada + 5 * 60;
  const salida = minutos(horario?.salida);
  const hasta = salida != null && salida > desde + MINUTOS_DE_COMIDA ? salida : entrada + 9 * 60;
  return {
    tipo: 'libre',
    desde: hhmm(desde),
    hasta: hhmm(hasta),
    minutos: MINUTOS_DE_COMIDA,
    texto: `una hora entre ${reloj12(desde)} y ${reloj12(hasta)} ${sufijo(hasta)}`,
  };
}

/** Última hora (minuto del día) para salir a comer sin justificar. */
export function ultimaSalida(v: VentanaComida): number {
  const hasta = minutos(v.hasta)!;
  return v.tipo === 'fija' ? hasta : hasta - v.minutos;
}

/** ¿Sale a comer a tiempo? (minuto del día en la zona de la jornada) */
export function salidaATiempo(v: VentanaComida, minutoSalida: number): boolean {
  return minutoSalida >= minutos(v.desde)! && minutoSalida <= ultimaSalida(v);
}

/** Minuto del día en que ya debe estar de regreso, según a qué hora salió. */
export function regresoLimite(v: VentanaComida, minutoSalida: number | null): number {
  const hasta = minutos(v.hasta)!;
  if (v.tipo === 'fija' || minutoSalida == null) return hasta + TOLERANCIA_REGRESO_MIN;
  return Math.min(minutoSalida + v.minutos + TOLERANCIA_REGRESO_MIN, hasta + TOLERANCIA_REGRESO_MIN);
}

/** Minuto del día del aviso «tu hora de comida empieza en 10 minutos». */
export function minutoDelAvisoDeComida(v: VentanaComida): number {
  return minutos(v.desde)! - 10;
}

/** `HH:MM` de un minuto del día. */
export function aHoraMinuto(min: number): string {
  return hhmm(min);
}

/** Minuto del día de un `HH:MM` de la ventana. */
export function aMinutos(hm: string): number {
  return minutos(hm) ?? 0;
}

/**
 * Qué aviso de comida le toca en este minuto, a quien está en jornada (checó entrada y no ha
 * salido) y tiene horario:
 * - «por salir»: desde 10 min antes de que abra su ventana hasta que abre, si no ha salido a comer;
 * - «regresa»: ya pasó su hora de regreso y no ha registrado que volvió.
 * Cada uno se manda una vez al día (lo decide quien llama con `yaAvisado…`).
 */
export function avisoDeComidaQueToca(p: {
  ventana: VentanaComida;
  minuto: number;
  /** Minuto del día en que salió a comer; null si no ha salido. */
  salida: number | null;
  regreso: number | null;
  yaAvisadoSalida: boolean;
  yaAvisadoRegreso: boolean;
}): 'por-salir' | 'regresa' | null {
  if (p.salida == null) {
    const aviso = minutoDelAvisoDeComida(p.ventana);
    return !p.yaAvisadoSalida && p.minuto >= aviso && p.minuto < aMinutos(p.ventana.desde) ? 'por-salir' : null;
  }
  if (p.regreso != null || p.yaAvisadoRegreso) return null;
  return p.minuto >= regresoLimite(p.ventana, p.salida) ? 'regresa' : null;
}

export function textoAvisoDeComida(aviso: 'por-salir' | 'regresa', v: VentanaComida): { title: string; message: string } {
  if (aviso === 'regresa') {
    return { title: 'Tu hora de comida terminó', message: 'Registra tu regreso con una foto al retomar labores' };
  }
  return {
    title: 'Tu hora de comida empieza en 10 minutos',
    message:
      v.tipo === 'libre'
        ? `Registra tu salida a comer con foto desde la app. Tienes ${v.texto}`
        : 'Registra tu salida a comer con foto desde la app',
  };
}
