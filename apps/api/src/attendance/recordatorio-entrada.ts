/**
 * Recordatorio de entrada (Adam, 29-10-2026): «que la misma plataforma les vaya comentando a todos
 * como de buenos días, ¿ya registraste tu entrada?… notificación push cada dos minutos a cada
 * integrante… de que no han registrado entrada».
 *
 * - A su hora de entrada, un «buenos días» por persona y por día (la única fila de la campana).
 * - Desde su entrada más la tolerancia, mientras no cheque, un push cada 2 minutos con «No has
 *   registrado tu entrada». Solo push: no deja filas. Con la tolerancia, igual que el retardo: oficina
 *   desde las 10:15, cuadrilla desde las 08:15 (29-10-2026, aprobado por Adam).
 * - Para al checar, al llegar su hora de salida, con falta justificada, permiso o vacaciones, y en su
 *   descanso (sábado o domingo salvo guardia, o un festivo en que no le toca trabajar). Si dirección
 *   marcó el festivo con horario propio, se le espera con ese horario (`festivos/festivos-reglas.ts`).
 * - Al checar pasa al recordatorio de la jornada (`activities/recordatorios-jornada`): uno u otro,
 *   nunca los dos.
 *
 * El horario es el de cada quien (`horarioDePersona`, el mismo que mide retardos): oficina entra a
 * las 10:00 y la cuadrilla de campo a las 08:00, cada uno con su gracia. Módulo puro: sin Nest ni Prisma.
 */
import { workDayAtClock, workDayStart } from '../common/time/workday.js';
import { horaAviso } from '../notifications/notification-push-meta.js';
import { primerNombre } from '../celebrations/celebraciones.js';
import { diaDeLaSemana, esSabadoODomingo } from '../guardias/guardias-reglas.js';
import type { HorarioKpi } from '../me/kpis-equipo.js';
import type { ComoLeToca } from '../festivos/festivos-reglas.js';

export const CADA_MIN_SIN_ENTRADA = 2;

/**
 * Último turno avisado de cada persona (`AAAA-MM-DD HH:MM`), en `user_preferences`: una fila por
 * persona que se reescribe. Con ella dos instancias de la API no mandan el mismo aviso dos veces.
 */
export const PREF_RECORDATORIO_ENTRADA = 'asistencia.recordatorio_entrada';

/** Sin hora de salida escrita, la jornada se da por terminada 9 h después de la entrada (8 h + comida). */
const SALIDA_POR_OMISION_MIN = 9 * 60;

export type DiaDeLaPersona = {
  /** Día en la zona de la jornada, `AAAA-MM-DD`. */
  fecha: string;
  horario: Pick<HorarioKpi, 'entrada' | 'salida' | 'graciaMin' | 'diasLaborables'>;
  conGuardia: boolean;
  /** Falta justificada de ese día. */
  justificada: boolean;
  /** Permiso, vacaciones o incapacidad aprobados que cubren ese día. */
  conPermiso: boolean;
  /** Si ese día es festivo, cómo le toca (`comoLeToca`); null o ausente si no lo es. */
  festivo?: ComoLeToca | null;
};

/** ¿Se le espera hoy? Sin horario (dirección 24/7) nunca. */
export function seLeEsperaHoy(d: DiaDeLaPersona): boolean {
  if (!d.horario.entrada) return false;
  if (d.justificada || d.conPermiso) return false;
  const dia = diaDeLaSemana(d.fecha);
  // El fin de semana solo checa quien tiene guardia.
  const deSiempre = d.conGuardia || (!esSabadoODomingo(d.fecha) && dia != null && d.horario.diasLaborables.includes(dia));
  // Un festivo con horario propio se trabaja aunque no sea su día de siempre; uno con la jornada
  // completa, solo si lo era.
  if (d.festivo) return d.festivo.trabaja && (d.festivo.horario != null || deSiempre);
  return deSiempre;
}

function minutos(hm: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((hm ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Minuto del día (0–1439) en la zona de la jornada. */
export function minutoDelDia(ahora: Date): number {
  return Math.floor((ahora.getTime() - workDayStart(ahora).getTime()) / 60_000);
}

export type AvisoDeEntrada = {
  aviso: 'buenos-dias' | 'sin-entrada';
  /** Turno `AAAA-MM-DD HH:MM`: el mismo para todas las corridas que caen en él. */
  turno: string;
  /** Minutos desde su hora de entrada (0 si aún no llega). */
  minutosTarde: number;
  /** Hora de entrada de ese día (`HH:MM`): la suya, o la del festivo con horario propio. */
  entrada: string;
};

/**
 * Qué aviso le toca en este minuto, o null.
 *
 * - Quien ya checó no recibe nada de aquí: desde su entrada lo atiende el recordatorio de la
 *   jornada (`activities/recordatorios-jornada`, «sin actividad» y «por vencer»). Así nadie recibe
 *   los dos a la vez.
 * - Entre su entrada y su salida, quien aún no recibió el «buenos días» lo recibe primero, aunque
 *   el servidor haya arrancado tarde.
 * - Desde la entrada más la tolerancia, un «sin entrada» por turno de 2 min.
 */
export function avisoQueToca(
  ahora: Date,
  d: DiaDeLaPersona,
  estado: { yaEntro: boolean; yaSaludado: boolean },
): AvisoDeEntrada | null {
  if (estado.yaEntro || !seLeEsperaHoy(d)) return null;
  const propio = d.festivo?.horario ?? null;
  const entrada = minutos(propio?.entrada ?? d.horario.entrada);
  if (entrada == null) return null;
  const salidaEscrita = minutos(propio?.salida ?? d.horario.salida);
  const salida = salidaEscrita != null && salidaEscrita > entrada ? salidaEscrita : entrada + SALIDA_POR_OMISION_MIN;
  const ahoraMin = minutoDelDia(ahora);
  if (ahoraMin < entrada || ahoraMin >= salida) return null;

  const inicio = entrada + Math.max(0, Math.round(d.horario.graciaMin ?? 0));
  const minutosTarde = ahoraMin - entrada;
  const base = { minutosTarde, entrada: hhmm(entrada) };

  if (!estado.yaSaludado) {
    // Turno del minuto en curso: si el aviso no llegó a guardarse, el siguiente minuto lo reintenta.
    return { aviso: 'buenos-dias', turno: `${d.fecha} ${hhmm(ahoraMin)}`, ...base };
  }
  if (ahoraMin < inicio) return null;
  const turno = inicio + Math.floor((ahoraMin - inicio) / CADA_MIN_SIN_ENTRADA) * CADA_MIN_SIN_ENTRADA;
  return { aviso: 'sin-entrada', turno: `${d.fecha} ${hhmm(turno)}`, ...base };
}

/** «10:00 a. m.» de la hora de entrada de ese día. */
export function horaDeEntrada(ahora: Date, entrada: string): string {
  const [hh, mm] = entrada.split(':').map(Number);
  return horaAviso(workDayAtClock(ahora, hh, mm));
}

function duracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function avisoBuenosDias(p: {
  nombre: string | null | undefined;
  /** Hora de entrada de su horario, ya escrita («10:00 a. m.»). */
  horario: string;
  minutosTarde: number;
}): { title: string; message: string } {
  const nombre = primerNombre(p.nombre);
  const title = nombre ? `Buenos días, ${nombre} ☀️` : 'Buenos días ☀️';
  // Las horas terminan en «a. m.»/«p. m.»: los textos no les ponen otro punto detrás.
  if (p.minutosTarde > 0) {
    return {
      title,
      message: `Aún no registras tu entrada (tu horario empezó a las ${p.horario}): regístrala en la app.`,
    };
  }
  return { title, message: `¿Ya registraste tu entrada? Tu horario empieza a las ${p.horario}` };
}

export function avisoSinEntrada(p: { horario: string; minutosTarde: number }): { title: string; message: string } {
  return {
    title: 'No has registrado tu entrada',
    message:
      `Tu horario empezó a las ${p.horario} (van ${duracion(p.minutosTarde)}). Regístrala en la app: ` +
      `este aviso se repite cada ${CADA_MIN_SIN_ENTRADA} minutos hasta que la registres.`,
  };
}
