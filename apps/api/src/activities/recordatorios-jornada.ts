import { workClock } from '../common/time/workday.js';
import { chainExecutorIds, type ChainMember } from './activity-superiors.js';
import { UMBRAL_POR_VENCER_MIN } from './semaforo-actividad.js';

/**
 * Recordatorios insistentes durante la jornada (Adam, 29-10-2026):
 * - Quien está en jornada sin una actividad corriendo recibe push cada ~5 min hasta que abra una.
 * - Quien tiene una actividad sin entregar a 30 min o menos de su límite (o ya pasada) recibe push
 *   cada ~10 min hasta que la entregue o cheque su salida.
 * La jornada la marca su checada: antes de la entrada y después de la salida no se avisa nada.
 */

export const CADA_SIN_ACTIVIDAD_MIN = 5;
export const CADA_POR_VENCER_MIN = 10;
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
    message: 'Crea tu siguiente actividad o pídela a tu encargado. Este aviso se repite hasta que tengas una en curso.',
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
