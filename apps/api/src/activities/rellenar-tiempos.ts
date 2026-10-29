/**
 * Relleno de una sola vez (29-10-2026) de las actividades abiertas que quedaron sin tiempo estándar,
 * sin tiempo estimado o sin entrega, con las reglas de `tiempo-entrega.ts`. Idempotente: solo llena
 * lo que está vacío y nunca borra. Lo corre `scripts/rellenar-tiempos-abiertas.cjs` dentro del
 * contenedor de la API (simulacro por omisión; `--escribir` para guardar).
 *
 * La entrega de las que no tenían: el fin del día de su inicio (o de su asignación). Si ya se
 * entregó después de ese día, el fin del día en que se entregó, para no volverla «tarde» de golpe.
 */
import { workDayEnd } from '../common/time/workday.js';
import type { EstandarCalculado } from './tiempo-entrega.js';

export const ESTATUS_CERRADOS = ['Finalizada', 'Cancelada', 'No cumplida', 'Completada', 'Cerrada'];

export type FilaAbierta = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  creadoPorId: number;
  responsableId: number;
  tiempoEstimadoMin: number | null;
  tiempoEstandarMin: number | null;
  complejidad: string | null;
  complejidadSugerida: string | null;
  unidades: unknown;
  fechaInicio: Date | null;
  fechaAsignacion: Date | null;
  fechaEntregaEsperada: Date | null;
  fechaMaxima: Date | null;
  periodoFin: Date | null;
  /** Cuándo la entregó quien la ejecuta (evidencia completa o fin real); null = no la ha entregado. */
  entregadaAt: Date | null;
};

export type PlanRelleno = {
  cambios: Record<string, unknown>;
  /** Por qué la entrega no es el fin del día de su inicio. */
  nota: string | null;
};

/** Qué se le pone a una fila (solo lo que le falta). `est` = estándar leído de su título. */
export function planDeRelleno(fila: FilaAbierta, est: EstandarCalculado | null): PlanRelleno {
  const cambios: Record<string, unknown> = {};
  let nota: string | null = null;
  if (fila.tiempoEstandarMin == null && est) {
    cambios.tiempoEstandarMin = est.totalMin;
    cambios.estandarDesglose = [...est.desglose, ...est.supuestos.map((s) => ({ concepto: `Supuesto: ${s}`, minutos: 0 }))];
    if (!fila.complejidad && est.complejidad) cambios.complejidad = est.complejidad;
    if (!fila.unidades && est.unidades) cambios.unidades = est.unidades;
  }
  const estandar = fila.tiempoEstandarMin ?? (cambios.tiempoEstandarMin as number | undefined) ?? null;
  if (fila.tiempoEstimadoMin == null && estandar) cambios.tiempoEstimadoMin = estandar;

  if (!fila.periodoFin) {
    if (!fila.fechaEntregaEsperada && !fila.fechaMaxima) {
      const base = fila.fechaInicio ?? fila.fechaAsignacion;
      if (base) {
        let limite = workDayEnd(base);
        if (fila.entregadaAt && fila.entregadaAt > limite) {
          limite = workDayEnd(fila.entregadaAt);
          nota = 'se entregó después del día de su inicio: entrega al fin del día en que se entregó (no cambia su «a tiempo»)';
        }
        cambios.fechaEntregaEsperada = limite;
        cambios.fechaMaxima = limite;
      }
    } else if (!fila.fechaEntregaEsperada) {
      cambios.fechaEntregaEsperada = fila.fechaMaxima;
    } else if (!fila.fechaMaxima) {
      cambios.fechaMaxima = fila.fechaEntregaEsperada;
    }
  }
  return { cambios, nota };
}

/** «A tiempo» con el límite que tendría (sin límite cuenta a tiempo, como en los KPI). */
export function aTiempo(entregadaAt: Date | null, limite: Date | null): boolean | null {
  if (!entregadaAt) return null;
  return !limite || entregadaAt.getTime() <= limite.getTime();
}
