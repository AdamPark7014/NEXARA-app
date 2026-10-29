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
 *   descanso (sábado, domingo o festivo), salvo que ese día tenga guardia.
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

export const CADA_MIN_SIN_ENTRADA = 2;

/**
 * Último turno avisado de cada persona (`AAAA-MM-DD HH:MM`), en `user_preferences`: una fila por
 * persona que se reescribe. Con ella dos instancias de la API no mandan el mismo aviso dos veces.
 */
export const PREF_RECORDATORIO_ENTRADA = 'asistencia.recordatorio_entrada';

/** Sin hora de salida escrita, la jornada se da por terminada 9 h después de la entrada (8 h + comida). */
const SALIDA_POR_OMISION_MIN = 9 * 60;

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Día del mes del n-ésimo lunes (n = 1…5) de un mes. */
function lunesDelMes(anio: number, mes: number, n: number): number {
  const primero = new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay();
  const primerLunes = 1 + ((8 - primero) % 7);
  return primerLunes + (n - 1) * 7;
}

/**
 * Descanso obligatorio de la LFT (art. 74), salvo la jornada electoral: 1 ene, primer lunes de
 * febrero, tercer lunes de marzo, 1 may, 16 sep, tercer lunes de noviembre, 25 dic y el 1 oct de
 * cada seis años en que cambia el Ejecutivo (2024, 2030…).
 */
export function esFestivoDeLey(fecha: string): boolean {
  const m = FECHA_RE.exec(String(fecha ?? '').trim());
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mes === 1 && dia === 1) return true;
  if (mes === 2 && dia === lunesDelMes(anio, 2, 1)) return true;
  if (mes === 3 && dia === lunesDelMes(anio, 3, 3)) return true;
  if (mes === 5 && dia === 1) return true;
  if (mes === 9 && dia === 16) return true;
  if (mes === 10 && dia === 1 && anio >= 2024 && (anio - 2024) % 6 === 0) return true;
  if (mes === 11 && dia === lunesDelMes(anio, 11, 3)) return true;
  if (mes === 12 && dia === 25) return true;
  return false;
}

/**
 * Descansos que da la empresa además de la ley, en los que no se insiste (29-10-2026, aprobado por
 * Adam). El 2 de noviembre no es festivo de la LFT, pero si se descansa y el aviso insiste cada 2 min
 * todo el día, molesta a todo el equipo; si se trabaja, solo se pierde el recordatorio de ese día
 * (retardos, KPI y nómina no leen esta lista).
 */
export const DESCANSOS_ACORDADOS: readonly string[] = ['2026-11-02'];

/**
 * Los acordados más los de `ASISTENCIA_DIAS_DE_DESCANSO=2026-12-24,2026-12-31` (entorno de la API y
 * del worker en `deploy/docker-compose.nexara.yml`). Lo que no es fecha se ignora.
 */
export function descansosDeEmpresa(raw = process.env.ASISTENCIA_DIAS_DE_DESCANSO): Set<string> {
  const extra = String(raw ?? '')
    .split(/[\s,;]+/)
    .map((f) => f.trim())
    .filter((f) => FECHA_RE.test(f));
  return new Set([...DESCANSOS_ACORDADOS, ...extra]);
}

export type DiaDeLaPersona = {
  /** Día en la zona de la jornada, `AAAA-MM-DD`. */
  fecha: string;
  horario: Pick<HorarioKpi, 'entrada' | 'salida' | 'graciaMin' | 'diasLaborables'>;
  conGuardia: boolean;
  /** Falta justificada de ese día. */
  justificada: boolean;
  /** Permiso, vacaciones o incapacidad aprobados que cubren ese día. */
  conPermiso: boolean;
  /** Descansos extra de la empresa (`descansosDeEmpresa`). */
  descansos?: ReadonlySet<string>;
};

/** ¿Se le espera hoy? Sin horario (dirección 24/7) nunca. */
export function seLeEsperaHoy(d: DiaDeLaPersona): boolean {
  if (!d.horario.entrada) return false;
  if (d.justificada || d.conPermiso) return false;
  // El fin de semana solo checa quien tiene guardia, y con guardia se trabaja aunque sea festivo.
  if (d.conGuardia) return true;
  if (esSabadoODomingo(d.fecha)) return false;
  if (esFestivoDeLey(d.fecha) || d.descansos?.has(d.fecha)) return false;
  const dia = diaDeLaSemana(d.fecha);
  return dia != null && d.horario.diasLaborables.includes(dia);
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
  const entrada = minutos(d.horario.entrada);
  if (entrada == null) return null;
  const salidaEscrita = minutos(d.horario.salida);
  const salida = salidaEscrita != null && salidaEscrita > entrada ? salidaEscrita : entrada + SALIDA_POR_OMISION_MIN;
  const ahoraMin = minutoDelDia(ahora);
  if (ahoraMin < entrada || ahoraMin >= salida) return null;

  const inicio = entrada + Math.max(0, Math.round(d.horario.graciaMin ?? 0));
  const minutosTarde = ahoraMin - entrada;

  if (!estado.yaSaludado) {
    // Turno del minuto en curso: si el aviso no llegó a guardarse, el siguiente minuto lo reintenta.
    return { aviso: 'buenos-dias', turno: `${d.fecha} ${hhmm(ahoraMin)}`, minutosTarde };
  }
  if (ahoraMin < inicio) return null;
  const turno = inicio + Math.floor((ahoraMin - inicio) / CADA_MIN_SIN_ENTRADA) * CADA_MIN_SIN_ENTRADA;
  return { aviso: 'sin-entrada', turno: `${d.fecha} ${hhmm(turno)}`, minutosTarde };
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
