import { workClock } from '../common/time/workday.js';
import { chainExecutorIds, type ChainMember } from './activity-superiors.js';
import { UMBRAL_POR_VENCER_MIN } from './semaforo-actividad.js';

/**
 * Recordatorios durante la jornada (Adam, 29-10-2026; espaciados el 01-11, Programa Velocidad Core):
 * - Quien está en jornada sin una actividad corriendo recibe push a los 10, 20 y 40 min, con un
 *   máximo de 6 al día. Cada 5 min sumaban 564 en un día y se leía el 61 %.
 * - Quien tiene una actividad sin entregar a 30 min o menos de su límite (o ya pasada) recibe push
 *   cada ~30 min hasta que la entregue o cheque su salida.
 * La jornada la marca su checada: antes de la entrada y después de la salida no se avisa nada.
 * Van como `recordatorio`: suenan y no ensucian la bandeja (`presupuesto-avisos.ts`).
 */

export const ESCALONES_SIN_ACTIVIDAD_MIN = [10, 20, 40];
export const TOPE_SIN_ACTIVIDAD_DIA = 6;
export const CADA_POR_VENCER_MIN = 30;
/** Desde cuánto antes del límite se insiste: lo mismo que pinta el semáforo en ámbar. */
export const VENTANA_POR_VENCER_MIN = UMBRAL_POR_VENCER_MIN;

/** Lunes a sábado, de 7:00 a 20:00 (hora de México): fuera de eso no se manda nada. */
export function horarioDeRecordatorios(ahora: Date): boolean {
  const { weekday, hour } = workClock(ahora);
  return weekday !== 0 && hour >= 7 && hour < 20;
}

/** En jornada, fuera de su comida y sin ningún reloj de actividad corriendo. */
export function necesitaActividad(p: { enJornada: boolean; enComida: boolean; relojCorriendo: boolean }): boolean {
  return p.enJornada && !p.enComida && !p.relojCorriendo;
}

/**
 * ¿Toca avisar? `desde` = desde cuándo no tiene reloj (su entrada, el último reloj que cerró o su
 * regreso de comer); `enviadosHoy` = los avisos de hoy. Empezar una actividad reinicia los escalones.
 */
export function tocaAvisoSinActividad(p: { desde: Date; enviadosHoy: Date[]; ahora: Date }): boolean {
  if (p.enviadosHoy.length >= TOPE_SIN_ACTIVIDAD_DIA) return false;
  const minutos = (p.ahora.getTime() - p.desde.getTime()) / 60_000;
  const enEstaRacha = p.enviadosHoy.filter((e) => e.getTime() >= p.desde.getTime()).length;
  const escalon = ESCALONES_SIN_ACTIVIDAD_MIN[enEstaRacha];
  return escalon != null && minutos >= escalon;
}

/** Texto del aviso de «sin actividad», según tenga algo abierto sin iniciar o nada. */
export function avisoSinActividad(abiertas: number): { title: string; message: string } {
  if (abiertas > 0) {
    return {
      title: 'No tienes ninguna actividad en curso',
      message:
        abiertas === 1
          ? 'Tienes 1 actividad abierta: iníciala o reanúdala ahora.'
          : `Tienes ${abiertas} actividades abiertas: inicia o reanuda la que sigue.`,
    };
  }
  return {
    title: 'No tienes ninguna actividad abierta',
    message: 'Crea tu siguiente actividad o pídela a tu encargado.',
  };
}

/** Minutos que faltan para el límite (negativo: ya pasó). null si no tiene límite. */
export function minutosAlLimite(limite: Date | null, ahora: Date): number | null {
  if (!limite) return null;
  return Math.floor((limite.getTime() - ahora.getTime()) / 60_000);
}

/**
 * Sin entregar, en jornada y a 30 min o menos del límite (o ya pasado), con el límite en el mismo
 * día: el cumplimiento es del día. Lo de días anteriores no se persigue cada 10 min para siempre.
 */
export function tocaAvisoPorVencer(p: {
  minutos: number | null;
  entregada: boolean;
  enJornada: boolean;
  limiteEsDeHoy: boolean;
}): boolean {
  return p.enJornada && p.limiteEsDeHoy && !p.entregada && p.minutos != null && p.minutos <= VENTANA_POR_VENCER_MIN;
}

function duracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function avisoPorVencer(p: { anNumber: string; titulo: string; minutos: number }): {
  title: string;
  message: string;
} {
  const nombre = `${p.anNumber} · ${(p.titulo || '').trim() || 'Actividad'}`;
  if (p.minutos > 0) {
    return { title: `${p.anNumber} vence en ${duracion(p.minutos)}`, message: `${nombre}. Termínala y envía tu evidencia.` };
  }
  if (p.minutos === 0) {
    return { title: `${p.anNumber} vence ahora`, message: `${nombre}. Termínala y envía tu evidencia.` };
  }
  return {
    title: `${p.anNumber} ya pasó su límite (${duracion(-p.minutos)})`,
    message: `${nombre}. Entrégala antes de checar tu salida: al salir, lo que no entregaste queda como no cumplido.`,
  };
}

/** Quienes la ejecutan (en despacho, quien solo reparte no cuenta). Sin equipo, el responsable. */
export function ejecutoresDeActividad(a: {
  responsableId: number;
  assignmentCharge: string | null;
  assignees: Array<{ userId: number; rol: string; asignadoAt: Date }>;
}): number[] {
  const members: ChainMember[] = a.assignees.map((m) => ({
    userId: m.userId,
    rol: String(m.rol),
    asignadoAt: new Date(m.asignadoAt),
  }));
  const ids = chainExecutorIds({ responsableId: a.responsableId, assignmentCharge: a.assignmentCharge, members });
  return ids.length ? ids : [a.responsableId];
}

/** Ya la entregó: su fin real o su evidencia completa (lo mismo que mira el cierre por salida). */
export function yaEntrego(
  userId: number,
  a: {
    assignees: Array<{ userId: number; finRealAt: Date | null }>;
    activityEvidences: Array<{ userId: number; status: string | null }>;
  },
): boolean {
  const asig = a.assignees.find((m) => m.userId === userId);
  if (asig?.finRealAt) return true;
  return a.activityEvidences.some((e) => e.userId === userId && e.status === 'COMPLETED');
}
