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
};

export type MyActivitiesResponse = {
  /** Encargados de área: pueden reordenar su cola (con justificación). */
  canReorder: boolean;
  /** Encargados de área: pueden auto-asignarse actividades. */
  canSelfAssign: boolean;
  open: MyActivityItem[];
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
