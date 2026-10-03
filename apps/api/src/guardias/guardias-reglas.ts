/**
 * Guardias de fin de semana.
 *
 * Regla del dueño: el sábado y el domingo solo abre jornada quien tiene guardia ese día.
 * A quien la tiene no se le aplica la geocerca de oficina —trabaja donde lo manden— y su
 * entrada sale sola al iniciar su primer servicio o tarea del día, con la ubicación y la
 * hora de ese inicio.
 *
 * «Sábado» y «domingo» son los de la zona de la jornada (`WORKDAY_TIMEZONE`, México), no
 * los del servidor: el contenedor corre en UTC y el viernes a las 18:00 ya es sábado ahí.
 */
import { WORKDAY_TIMEZONE, workDateColumn, workDateKey } from '../common/time/workday.js';

export const MENSAJE_FIN_DE_SEMANA_SIN_GUARDIA =
  'Hoy es fin de semana: solo quien tiene guardia puede checar. Pide a tu encargado que te programe.';

/** Tipos de actividad cuyo inicio genera la entrada de quien tiene guardia. */
export const TIPOS_QUE_ABREN_JORNADA = ['servicio', 'tarea'] as const;

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 0 = domingo … 6 = sábado de una fecha `AAAA-MM-DD`; null si no es una fecha real. */
export function diaDeLaSemana(fecha: string): number | null {
  const m = FECHA_RE.exec(String(fecha ?? '').trim());
  if (!m) return null;
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mes - 1, d));
  // `Date.UTC(2026, 1, 30)` "existe" (es el 2 de marzo): se descarta.
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mes - 1 || t.getUTCDate() !== d) return null;
  return t.getUTCDay();
}

export function esSabadoODomingo(fecha: string): boolean {
  const dia = diaDeLaSemana(fecha);
  return dia === 0 || dia === 6;
}

/** ¿Este instante cae en sábado o domingo en la zona de la jornada? */
export function esFinDeSemana(instante: Date, tz = WORKDAY_TIMEZONE): boolean {
  return esSabadoODomingo(workDateKey(instante, tz));
}

/** `AAAA-MM-DD` → valor para la columna `@db.Date` (medianoche UTC de ese día). */
export function fechaColumna(fecha: string): Date {
  const m = FECHA_RE.exec(fecha.trim());
  if (!m) throw new Error(`Fecha inválida: ${fecha}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Columna `@db.Date` → `AAAA-MM-DD`. */
export function fechaClave(columna: Date): string {
  return columna.toISOString().slice(0, 10);
}

/**
 * Cómo queda la persona frente a la regla ese día.
 *
 * - `ENTRE_SEMANA`: la regla no aplica.
 * - `CON_GUARDIA` / `SIN_GUARDIA`: fin de semana, con o sin guardia programada.
 * - `SIN_DATOS`: fin de semana pero no se pudo leer la tabla (pruebas con Prisma simulado,
 *   arranque sin la migración, error de base). Quien llama se comporta como antes de la
 *   regla: no saber no es motivo para dejar a nadie sin checar.
 */
export type DiaDeGuardia = 'ENTRE_SEMANA' | 'CON_GUARDIA' | 'SIN_GUARDIA' | 'SIN_DATOS';

type Db = { guardia?: { findFirst?: (args: any) => Promise<unknown> }; [modelo: string]: any };

export async function diaDeGuardia(
  db: Db,
  p: { userId: number; companyId: number; at: Date },
): Promise<DiaDeGuardia> {
  if (!esFinDeSemana(p.at)) return 'ENTRE_SEMANA';
  if (typeof db?.guardia?.findFirst !== 'function') return 'SIN_DATOS';
  try {
    const fila = await db.guardia.findFirst({
      where: { userId: p.userId, companyId: p.companyId, fecha: workDateColumn(p.at) },
      select: { id: true },
    });
    return fila ? 'CON_GUARDIA' : 'SIN_GUARDIA';
  } catch {
    return 'SIN_DATOS';
  }
}
