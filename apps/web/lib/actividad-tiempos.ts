/**
 * Prioridad, semáforo y tiempos de una actividad en la web.
 * Espejo de `apps/api/src/activities/actividad-tiempos.ts` (contrato del 18-09).
 */

export type Prioridad = "ALTA" | "MEDIA" | "BAJA";
export type Semaforo = "rojo" | "amarillo" | "verde";
export type Aceptacion = "PENDIENTE" | "ACEPTADA" | "RECHAZADA";

const ALTA = new Set(["alta", "urgente", "critica", "crítica", "p0", "p1", "high", "urgent"]);
const BAJA = new Set(["baja", "low", "p3", "p4"]);

/** Acepta los textos viejos («Alta», «urgente», «P1»); lo desconocido queda en MEDIA. */
export function normalizarPrioridad(valor?: string | null): Prioridad {
  const v = String(valor ?? "").trim().toLowerCase();
  if (ALTA.has(v)) return "ALTA";
  if (BAJA.has(v)) return "BAJA";
  return "MEDIA";
}

export const PRIORIDAD_UI: Record<Prioridad, { label: string; color: string; hint: string }> = {
  ALTA: { label: "Alta", color: "#dc2626", hint: "Urgente" },
  MEDIA: { label: "Media", color: "#d97706", hint: "Esta semana" },
  BAJA: { label: "Baja", color: "#16a34a", hint: "Puede esperar" },
};

export const SEMAFORO_UI: Record<Semaforo, { label: string; color: string }> = {
  rojo: { label: "Atención", color: "#dc2626" },
  amarillo: { label: "Pendiente", color: "#d97706" },
  verde: { label: "En orden", color: "#16a34a" },
};

/** «2 h 35 min», «45 min»; null cuando no hay nada que mostrar. */
export function formatoMinutos(min?: number | null): string | null {
  if (min == null || !Number.isFinite(min) || min < 0) return null;
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** «Plan 2 h · real 2 h 35 min» para la tarjeta y el detalle. */
export function textoPlanVsReal(minutosPlan?: number | null, minutosReales?: number | null): string | null {
  const plan = formatoMinutos(minutosPlan);
  const real = formatoMinutos(minutosReales);
  if (!plan && !real) return null;
  if (plan && real) return `Plan ${plan} · real ${real}`;
  if (plan) return `Plan ${plan}`;
  return `Real ${real}`;
}
