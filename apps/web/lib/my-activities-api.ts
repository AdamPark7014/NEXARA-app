import { erpFetch } from "@/lib/erp-api";

/** Fila de Mis actividades (GET /me/activities). Fechas en ISO. */
export type MyActivityItem = {
  id: number;
  anNumber: string;
  titulo: string;
  descripcion: string | null;
  estatus: string;
  prioridad: string | null;
  coreKind: string | null;
  ticketTypeCustom: string | null;
  assignmentCharge: string | null;
  fechaInicio: string | null;
  fechaMaxima: string | null;
  fechaAsignacion: string;
  fechaFinalizacion: string | null;
  tiempoEstimadoMin: number | null;
  tiempoMaximoMin: number | null;
  rol: string;
  /** Indicaciones personales de esta persona en la actividad. */
  indicaciones: string | null;
  asignadaPor: { id: number; nombre: string } | null;
  autoAsignada: boolean;
  proyecto: string | null;
  cliente: string | null;
  evidenceStatus: string | null;
  orden: number | null;
  ordenJustificacion: string | null;
  ordenActualizadoAt: string | null;
  /** En despacho, este usuario solo reparte (no sube evidencia). */
  despachador: boolean;
  /** Despachador que todavía no la pasa a nadie. */
  porRepartir: boolean;
  /** Registro de despacho: a quién se pasó después de este usuario. */
  pasadaA: Array<{
    nombre: string;
    rol: string;
    at: string;
    por: string | null;
    evidenceStatus: string | null;
  }>;
};

export type MyActivitiesResponse = {
  /** Encargados de área: pueden reordenar su cola (con justificación). */
  canReorder: boolean;
  /** Encargados de área: pueden auto-asignarse actividades. */
  canSelfAssign: boolean;
  open: MyActivityItem[];
  /** Ya repartidas por este usuario: da seguimiento. */
  seguimiento: MyActivityItem[];
  doneToday: MyActivityItem[];
};

export type ReorderMyActivitiesInput = {
  /** Cola completa en el nuevo orden. */
  activityIds: number[];
  movedActivityId: number;
  justificacion: string;
};

/** Encargados de área: crea una actividad a su propio nombre (POST /me/activities). */
export function createMyActivity(token: string, payload: object): Promise<{ id: number }> {
  return erpFetch<{ id: number }>("me/activities", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Quien reparte un despacho lo pasa a su equipo (POST /me/activities/:id/despacho). */
export function dispatchMyActivity(
  token: string,
  activityId: number,
  input: { userIds: number[]; indicaciones?: string },
): Promise<{ ok: boolean; asignados: number }> {
  return erpFetch<{ ok: boolean; asignados: number }>(`me/activities/${activityId}/despacho`, token, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchMyActivities(token: string): Promise<MyActivitiesResponse> {
  return erpFetch<MyActivitiesResponse>("me/activities", token);
}

export function reorderMyActivities(
  token: string,
  input: ReorderMyActivitiesInput,
): Promise<MyActivitiesResponse> {
  return erpFetch<MyActivitiesResponse>("me/activities/order", token, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
