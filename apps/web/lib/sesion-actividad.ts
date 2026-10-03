/**
 * Sesiones de trabajo de una actividad en la web: «En pausa», «Reanudar» y «Pausar».
 * Espejo de `apps/api/src/activities/sessions/sesiones-trabajo.ts`.
 *
 * El reloj de una actividad ya no corre de corrido desde que se inicia: corre por
 * sesiones. Se detiene con una pausa (propia o del jefe), al checar salida, a las
 * 12 horas o al terminar el día, y se reanuda cada día. «En pausa» no es un estatus
 * —la actividad sigue «En Proceso»—: lo dicen estos campos.
 */
import { erpFetch } from "@/lib/erp-api";

/** Por qué se detuvo el reloj. */
export type PausaTipo = "FIN" | "PAUSA" | "SALIDA" | "TOPE_12H" | "CORTE_DIA";

/** Lo que mandan `me/activities`, la pizarra y el detalle. Opcional: una API anterior no lo trae. */
export type SesionActividad = {
  /** Su reloj corre ahora mismo. */
  enCurso?: boolean;
  /** Ya la inició, no la ha entregado y su reloj está detenido. */
  enPausa?: boolean;
  pausaTipo?: PausaTipo | null;
  pausadaAt?: string | null;
  /** Quién la pausó (la propia persona o su jefe). */
  pausadaPor?: { id: number; nombre: string } | null;
  motivoPausa?: string | null;
  sesionAbiertaDesde?: string | null;
};

/** Ninguna actividad dura más de 12 horas: ni su estimado ni una sesión. */
export const HORAS_MAX_ACTIVIDAD = 12;
export const MINUTOS_MAX_ACTIVIDAD = HORAS_MAX_ACTIVIDAD * 60;
export const MENSAJE_TOPE_12H =
  "Una actividad no puede durar más de 12 horas. Si lleva más días, se reanuda cada día.";

/** El jefe siempre dice por qué pausa. */
export const MOTIVO_PAUSA_MIN = 10;
export const MOTIVO_PAUSA_MAX = 500;

const cerrada = (estatus?: string | null) => /finalizada|completada|cancelada|aprobada/i.test(estatus ?? "");

const primerNombre = (nombre?: string | null) => (nombre ?? "").trim().split(/\s+/).slice(0, 2).join(" ");

/**
 * Una línea que explica la pausa: quién y por qué, o qué la detuvo.
 * `propia` cambia la persona del verbo: «tu salida» para quien la ejecuta, «su salida» para su jefe.
 */
export function textoPausa(
  s: SesionActividad,
  opciones: { miId?: number | null; propia?: boolean } = {},
): string | null {
  if (!s.enPausa) return null;
  const propia = opciones.propia ?? true;
  const motivo = s.motivoPausa?.trim();
  switch (s.pausaTipo) {
    case "SALIDA":
      return propia ? "Se detuvo al marcar tu salida." : "Se detuvo al marcar su salida.";
    case "TOPE_12H":
      return "Se detuvo sola al cumplir 12 horas.";
    case "CORTE_DIA":
      return "Se detuvo sola al terminar el día.";
    default: {
      const quien = s.pausadaPor;
      const yo = quien != null && opciones.miId != null && quien.id === opciones.miId;
      const sujeto = yo ? "La pausaste" : quien ? `La pausó ${primerNombre(quien.nombre)}` : "Está en pausa";
      return motivo ? `${sujeto}: ${motivo}` : `${sujeto}.`;
    }
  }
}

/** ¿Se pinta «Reanudar»? Solo a quien la ejecuta, con el reloj detenido y la actividad abierta. */
export function puedeReanudar(a: SesionActividad & { despachador?: boolean | null; estatus?: string | null }): boolean {
  if (!a.enPausa || a.despachador) return false;
  return !cerrada(a.estatus);
}

/** ¿Se pinta «Pausar»? Solo hay algo que pausar mientras el reloj corre. */
export function puedePausar(a: SesionActividad & { estatus?: string | null }): boolean {
  return Boolean(a.enCurso) && !cerrada(a.estatus);
}

/** Error del motivo que escribe el jefe, o null si alcanza. */
export function errorMotivoPausa(texto: string): string | null {
  const n = texto.trim().length;
  if (n < MOTIVO_PAUSA_MIN) return `Escribe por qué la pausas (mínimo ${MOTIVO_PAUSA_MIN} caracteres).`;
  if (n > MOTIVO_PAUSA_MAX) return `El motivo no puede pasar de ${MOTIVO_PAUSA_MAX} caracteres.`;
  return null;
}

/** Horas y minutos de la rueda, sin pasar del tope: 12 h 30 min se queda en 12 h. */
export function toparDuracion(
  horas: number,
  minutos: number,
  topeMinutos: number = MINUTOS_MAX_ACTIVIDAD,
): { horas: number; minutos: number } {
  const h = Math.max(0, Math.floor(Number(horas) || 0));
  const m = Math.max(0, Math.min(59, Math.floor(Number(minutos) || 0)));
  const total = Math.min(h * 60 + m, Math.max(0, Math.floor(topeMinutos)));
  return { horas: Math.floor(total / 60), minutos: total % 60 };
}

export type EstadoSesionRespuesta = SesionActividad & { ok: boolean; minutosReales: number | null };

/** Pausar mi actividad (POST /me/activities/:id/pausar). El motivo es opcional. */
export function pausarMiActividad(token: string, activityId: number, motivo?: string): Promise<EstadoSesionRespuesta> {
  return erpFetch<EstadoSesionRespuesta>(`me/activities/${activityId}/pausar`, token, {
    method: "POST",
    body: JSON.stringify(motivo?.trim() ? { motivo: motivo.trim() } : {}),
  });
}

/** Reanudar mi actividad (POST /me/activities/:id/reanudar): mi reloj vuelve a correr. */
export function reanudarMiActividad(token: string, activityId: number): Promise<EstadoSesionRespuesta> {
  return erpFetch<EstadoSesionRespuesta>(`me/activities/${activityId}/reanudar`, token, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * Un jefe pausa la actividad en curso de alguien de su equipo
 * (POST /me/board/:userId/activities/:id/pausar). Motivo obligatorio.
 */
export function pausarActividadDeEquipo(
  token: string,
  userId: number,
  activityId: number,
  motivo: string,
): Promise<EstadoSesionRespuesta> {
  return erpFetch<EstadoSesionRespuesta>(`me/board/${userId}/activities/${activityId}/pausar`, token, {
    method: "POST",
    body: JSON.stringify({ motivo: motivo.trim() }),
  });
}
