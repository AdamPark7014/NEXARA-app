import type { Tone } from "@/components/base";
import type { EstadoAro } from "@/components/pizarra/equipo-estado";
import type { BoardUserStatus, Prioridad, Semaforo } from "@/lib/team-board-api";

/**
 * Tonos de Actividades para las insignias del sistema visual (`Badge` / `StatusBadge`).
 * Sustituyen a los hex de `SEMAFORO_COLORS`, `PRIORIDAD_COLORS` y `STATUS_COLORS`: el
 * color sale de los tokens, así claro y oscuro quedan bien solos.
 */
export const SEMAFORO_TONE: Record<Semaforo, Tone> = {
  rojo: "danger",
  amarillo: "warning",
  verde: "success",
};

export const PRIORIDAD_TONE: Record<Prioridad, Tone> = {
  ALTA: "danger",
  MEDIA: "warning",
  BAJA: "neutral",
};

/** Estado de una persona en el tablero de equipo. */
export const ESTADO_EQUIPO_TONE: Record<BoardUserStatus, Tone> = {
  activo: "success",
  atrasado: "danger",
  libre: "info",
  sin_actividad: "neutral",
  inactivo: "neutral",
};

/** El aro de la foto (trabajando / con retraso / libre). */
export const ARO_TONE: Record<EstadoAro, Tone> = {
  trabajando: "success",
  retraso: "warning",
  libre: "info",
};
