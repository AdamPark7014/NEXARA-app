import type { GeocercaAlerta } from "@/lib/activity-geofence";
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
  /** Última reprogramación de día/hora (quién, cuándo, de → a). */
  ultimaReprogramacion: {
    at: string;
    por: string | null;
    de: string | null;
    a: string;
    motivo: string | null;
  } | null;
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

/** Quien reparte un despacho cambia su día y hora (PATCH /me/activities/:id/reprogramar). */
export function reprogramarDespacho(
  token: string,
  activityId: number,
  input: { fecha: string; motivo?: string },
): Promise<{ ok: boolean; fechaNueva: string }> {
  return erpFetch<{ ok: boolean; fechaNueva: string }>(`me/activities/${activityId}/reprogramar`, token, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Evidencia de una persona del equipo (GET /me/activities/:id/evidencias). */
export type TeamEvidenceMember = {
  userId: number;
  nombre: string;
  puesto: string | null;
  avatarUrl: string | null;
  rol: string;
  /** En despacho solo reparte (no sube evidencias). */
  reparte: boolean;
  asignadoAt: string;
  asignadoPor: string | null;
  retiradoAt: string | null;
  indicaciones: string | null;
  pasoA: Array<{ nombre: string; at: string }>;
  progressPct: number;
  /** Puedo aprobarla o devolverla (ya la envió y soy su superior en la cadena). */
  puedoRevisar: boolean;
  /** Pasos que le devolvieron y está corrigiendo. */
  rejectedSteps: string[];
  /** Eficiencia (1–5) de su última revisión. */
  eficienciaScore: number | null;
  /** Más reciente primero. */
  revisiones: TeamEvidenceReview[];
  /**
   * Salidas de la zona de 100 m alrededor de su punto de inicio, la más reciente primero.
   * Opcional: una API anterior a la geocerca no lo manda.
   */
  alertasZona?: GeocercaAlerta[];
  evidence: TeamEvidence | null;
};

/** Lo que subió una persona (también la copia guardada al devolverla). */
export type TeamEvidenceSnapshot = {
  entryPhotoUrl: string | null;
  entryLatitude: number | null;
  entryLongitude: number | null;
  entryPhotoUploadedAt: string | null;
  evidencePhotos: string[];
  evidencePhotosGeo: Array<{ latitude: number; longitude: number; capturedAt: string | null } | null> | null;
  evidencePhotosUploadedAt: string | null;
  serviceSheetPdfUrl: string | null;
  serviceSheetUploadedAt: string | null;
  serviceSheetData: unknown;
  serviceSheetCompletedAt: string | null;
  exitPhotoUrl: string | null;
  exitLatitude: number | null;
  exitLongitude: number | null;
  exitPhotoUploadedAt: string | null;
};

export type TeamEvidence = TeamEvidenceSnapshot & {
  status: string;
  completedAt: string | null;
  reviewStatus: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  /** Cuándo envió la corrección de lo que se le devolvió. */
  correctionSubmittedAt?: string | null;
};

export type TeamEvidenceReview = {
  id: number;
  decision: "APROBADA" | "DEVUELTA_PASOS" | "DEVUELTA_TODO";
  pasos: string[];
  observaciones: string;
  calificacion: number | null;
  at: string;
  revisor: string | null;
  /** Copia de lo devuelto (null en aprobaciones). */
  snapshot: TeamEvidenceSnapshot | null;
};

export type TeamEvidenceResponse = {
  activity: {
    id: number;
    anNumber: string;
    titulo: string;
    estatus: string;
    coreKind: string | null;
    assignmentCharge: string | null;
    evidencePhotoRequired: number;
    fechaFinalizacion: string | null;
  };
  /** todo: toda la cadena · equipo: de ti hacia abajo · propio: solo lo tuyo. */
  alcance: "todo" | "equipo" | "propio";
  creador: string | null;
  responsable: string | null;
  /** No puedes revisar a nadie de lo que ves (p. ej. quien la creó). */
  soloLectura: boolean;
  resumen: { ejecutores: number; terminaron: number; aprobadas: number; porRevisarMias: number };
  members: TeamEvidenceMember[];
};

export type RevisarEvidenciaInput = {
  decision: "aprobar" | "devolver";
  pasos?: string[];
  /** Devolver todo: rehace sus evidencias desde cero. */
  todo?: boolean;
  observaciones: string;
  /** Eficiencia de 1 a 5. */
  calificacion: number;
};

export function fetchTeamEvidence(token: string, activityId: number): Promise<TeamEvidenceResponse> {
  return erpFetch<TeamEvidenceResponse>(`me/activities/${activityId}/evidencias`, token);
}

/** Superior en la cadena aprueba o devuelve la evidencia de alguien (POST …/evidencias/:userId/revision). */
export function revisarEvidencia(
  token: string,
  activityId: number,
  userId: number,
  input: RevisarEvidenciaInput,
): Promise<TeamEvidenceResponse> {
  return erpFetch<TeamEvidenceResponse>(`me/activities/${activityId}/evidencias/${userId}/revision`, token, {
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
