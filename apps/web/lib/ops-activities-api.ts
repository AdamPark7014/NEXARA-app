import { buildApiUrl } from "@/lib/api-base";
import { isNonEmployeeEmail } from "@/lib/platform-accounts";

import type { ActivityEvidenceDetail } from "@/lib/evidence-display";
import type { Aceptacion, Semaforo } from "@/lib/actividad-tiempos";
import type { PeriodoActividad } from "@/lib/actividad-periodo";

export type ActivityDetail = {
  id: number;
  anNumber: string;
  titulo: string;
  descripcion?: string | null;
  indicaciones?: string | null;
  estatus: string;
  prioridad?: string | null;
  ticketType?: string | null;
  ticketTypeCustom?: string | null;
  workType?: string | null;
  /** Tipo Core (tarea|proyecto|obra|servicio|comercial). */
  coreKind?: string | null;
  /** Encargo: ejecucion | despacho (en despacho el LEAD solo reparte). */
  assignmentCharge?: string | null;
  projectId?: number | null;
  project?: { id: number; title: string } | null;
  branchName?: string | null;
  branchAddress?: string | null;
  branchCity?: string | null;
  branchState?: string | null;
  fechaAsignacion?: string;
  fechaInicio?: string | null;
  fechaEntregaEsperada?: string | null;
  fechaFinalizacion?: string | null;
  /** Sello ACS Acceso General → Ops */
  acsEnteredAt?: string | null;
  acsExitedAt?: string | null;
  acsLeftSite?: boolean | null;
  acsEntryDoor?: string | null;
  acsEnteredByUser?: { id: number; nombre: string } | null;
  responsable?: { id: number; nombre: string } | null;
  creador?: { id: number; nombre: string } | null;
  client?: {
    id: number;
    name: string;
    salesClients?: Array<{ id: number; name: string }>;
  } | null;
  activityEvidence?: ActivityEvidenceDetail | null;
  evidencias?: Array<{ id: number; tipo?: string; descripcion?: string; url?: string }>;
  assignees?: Array<{
    id: number;
    userId?: number;
    rol?: string;
    horasPlan?: number | string | null;
    horasReales?: number | string | null;
    acsEnteredAt?: string | null;
    acsExitedAt?: string | null;
    acsLeftSite?: boolean | null;
    acsEntryDoor?: string | null;
    retiradoAt?: string | null;
    user?: { id: number; nombre: string; email?: string };
    /** Contrato del 18-09 (opcional: una API anterior no lo manda). */
    aceptacion?: Aceptacion;
    motivoRechazo?: string | null;
    semaforo?: Semaforo;
    minutosPlan?: number | null;
    minutosReales?: number | null;
    excedida?: boolean;
    inicioRealAt?: string | null;
    finRealAt?: string | null;
    saltoPrioridad?: boolean;
  }>;
  /** Resumen de tiempos de la actividad (responsable o primero del equipo). */
  semaforo?: Semaforo | null;
  minutosPlan?: number | null;
  minutosReales?: number | null;
  excedida?: boolean;
  fechaMaxima?: string | null;
  tiempoEstimadoMin?: number | null;
  tiempoMaximoMin?: number | null;
  slaAlertedAt?: string | null;
  clientFeedback?: string | null;
  branchLatitude?: number | string | null;
  branchLongitude?: number | string | null;
  /** Cancelación documentada (solo superiores, con motivo). */
  cancelReason?: string | null;
  cancelledAt?: string | null;
  cancelledById?: number | null;
  cancelledBy?: { id: number; nombre: string } | null;
  /** Periodo de varios días (días `AAAA-MM-DD`); la API manda también `periodo` ya calculado. */
  periodoInicio?: string | null;
  periodoFin?: string | null;
  periodo?: PeriodoActividad | null;
  /** Etapa del cronograma que ejecuta. */
  projectMilestoneId?: number | null;
  projectMilestone?: { id: number; name: string } | null;
};

export type ViaticoRow = {
  id: number;
  montoSolicitado: number | string;
  motivo?: string | null;
  estatus: string;
  fechaSolicitud?: string;
  actividadId?: number | null;
  User?: { nombre?: string };
  /** Partes del gasto cuando el viaje cubrió varias actividades. */
  repartos?: { id: number; actividadId: number; monto: number | string; nota?: string | null }[];
  liquidacion?: {
    entregado: number;
    comprobado: number | null;
    saldo: number | null;
    estado: "SIN_COMPROBAR" | "CUADRADO" | "POR_DEVOLVER" | "POR_REEMBOLSAR";
  };
  /** Lo que carga esta actividad: su parte del reparto, o el total si no hay. */
  montoEnEstaActividad?: number;
};

async function apiFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

export function getActivity(token: string, id: number) {
  return apiFetch<ActivityDetail>(`activities/${id}`, token);
}

/**
 * Viáticos que carga esta actividad.
 *
 * Además de los que cuelgan de ella, entran los repartidos que le imputan una
 * parte: un viaje que cubrió dos servicios paga gasolina para los dos, y la
 * segunda actividad se veía «sin viáticos» aunque estuviera pagando la mitad.
 */
export async function listViaticsForActivity(token: string, activityId: number) {
  const data = await apiFetch<ViaticoRow[] | { data: ViaticoRow[] }>("viatics", token);
  const rows = Array.isArray(data) ? data : (data?.data ?? []);
  return rows
    .filter(
      (v) =>
        Number(v.actividadId) === activityId ||
        (v.repartos ?? []).some((p) => Number(p.actividadId) === activityId),
    )
    .map((v) => {
      const parte = (v.repartos ?? []).find((p) => Number(p.actividadId) === activityId);
      return {
        ...v,
        montoEnEstaActividad:
          (v.repartos?.length ?? 0) > 0
            ? Number(parte?.monto ?? 0)
            : Number(v.montoSolicitado) || 0,
      };
    });
}

export type ActivityTeamMember = {
  id: number;
  rol?: string;
  horasPlan?: number | string | null;
  horasReales?: number | string | null;
  user?: { id: number; nombre: string; email?: string };
};

export type ActivityMaterialRow = {
  id: number;
  quantity: number | string;
  movementType: string;
  totalCost?: number | string | null;
  createdAt: string;
  product?: { id: number; sku?: string; name?: string };
};

export type ActivityTimelineEvent = {
  id: string;
  at: string;
  kind: string;
  title: string;
  subtitle?: string;
  icon: string;
};

export function listActivityTeam(token: string, activityId: number) {
  return apiFetch<ActivityTeamMember[]>(`activities/${activityId}/team`, token);
}

export function addActivityTeamMember(
  token: string,
  activityId: number,
  body: { userId: number; rol?: "LEAD" | "TECNICO" | "APOYO"; indicaciones?: string },
) {
  return apiFetch<ActivityTeamMember>(`activities/${activityId}/team`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listActivityMaterials(token: string, activityId: number) {
  return apiFetch<{ movimientos: ActivityMaterialRow[]; costoTotal: number }>(
    `activities/${activityId}/materiales`,
    token,
  );
}

export function listActivityTimeline(token: string, activityId: number) {
  return apiFetch<{ events: ActivityTimelineEvent[] }>(`activities/${activityId}/timeline`, token);
}

/**
 * «Pasar a otro compañero»: solo superiores de quien la tiene y con motivo (mín. 10). Quien entra
 * continúa con su propia evidencia; quien sale queda retirado con su avance guardado.
 */
export function reassignActivity(
  token: string,
  activityId: number,
  body: { aUsuarioId: number; deUsuarioId?: number; motivo: string; retirarAnterior?: boolean },
) {
  return apiFetch<{ reassigned: boolean }>(`activities/${activityId}/reasignar`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Cancelar con motivo (mín. 10): solo superiores de quien la ejecuta. */
export function cancelActivity(token: string, activityId: number, motivo: string) {
  return apiFetch<ActivityDetail>(`activities/${activityId}/cancelar`, token, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

export type ActivitySuperiorActions = {
  estatus: string;
  cerrada: boolean;
  puedeCancelar: boolean;
  puedePasar: boolean;
  /** Personas cuyo trabajo puede pasar a otro compañero quien consulta. */
  personas: Array<{ userId: number; nombre: string; rol: string; responsable: boolean; ejecuta: boolean }>;
  motivoMinimo: number;
};

export function getActivitySuperiorActions(token: string, activityId: number) {
  return apiFetch<ActivitySuperiorActions>(`activities/${activityId}/acciones`, token);
}

/** Mensaje legible de un error de la API (Nest manda `{ message }`). */
export function apiErrorMessage(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : "";
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(", ");
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
  } catch {
    /* texto plano */
  }
  return raw.trim() || fallback;
}

export type DispatchActivityCard = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  prioridad?: string | null;
  branchName?: string | null;
  branchCity?: string | null;
  fechaEntregaEsperada?: string | null;
  overdue: boolean;
  responsable?: { id: number; nombre: string } | null;
  client?: { id: number; name: string } | null;
};

export type DispatchTechnicianLoad = {
  id: number;
  nombre: string;
  activas: number;
  enCurso: number;
  completadasHoy: number;
};

export type DispatchBoard = {
  columns: {
    pendiente: DispatchActivityCard[];
    en_curso: DispatchActivityCard[];
    por_validar: DispatchActivityCard[];
    completadas_hoy: DispatchActivityCard[];
  };
  technicians: DispatchTechnicianLoad[];
  assignableUsers: Array<{ id: number; nombre: string }>;
  generatedAt: string;
};

export function getDispatchBoard(token: string) {
  return apiFetch<DispatchBoard>("activities/dispatch-board", token);
}

export type ClientTicketRequestRow = {
  id: number;
  description: string;
  urgency: string;
  status: string;
  dueAt?: string | null;
  branchName?: string | null;
  branchNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  client?: { id: number; name: string } | null;
  latitud?: number | null;
  longitud?: number | null;
  activityId?: number | null;
  requestType?: "ISSUE" | "PREVENTIVE_INVENTORY";
};

export type OperationalProjectRow = {
  id: number;
  title: string;
  status: string;
  client: { id: number; name: string };
  /** Ventana planeada del proyecto: de aquí sale el periodo por omisión de sus actividades. */
  startDate?: string | null;
  endDate?: string | null;
};

export function listApprovedTicketRequests(token: string) {
  return apiFetch<ClientTicketRequestRow[]>("client-ticket-requests?status=APPROVED", token);
}

export function getTicketRequest(token: string, id: number) {
  return apiFetch<ClientTicketRequestRow>(`client-ticket-requests/${id}`, token);
}

export function listOperationalProjects(token: string) {
  return apiFetch<OperationalProjectRow[]>("operational-projects", token);
}

export async function listAssignableUsers(token: string) {
  const users = await apiFetch<AssignableUserOption[]>("users/assignable", token);
  // Safety net: Christian/Adam/Claudia/cuenta demo no deben aparecer como responsable asignable.
  return users.filter((u) => !isNonEmployeeEmail(u.email));
}

export type AssignableUserOption = { id: number; nombre: string; email?: string; role?: { nombre: string } };

export function fetchNextAnNumber(token: string) {
  return apiFetch<{ next?: string }>("activities/next-an", token);
}

export function createActivity(token: string, payload: Record<string, unknown>) {
  return apiFetch<{ id: number }>("activities", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateActivity(token: string, id: number, payload: Record<string, unknown>) {
  return apiFetch<ActivityDetail>(`activities/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function assignTicketRequest(token: string, requestId: number, activityId: number) {
  return apiFetch(`client-ticket-requests/${requestId}/assign`, token, {
    method: "PATCH",
    body: JSON.stringify({ activityId }),
  });
}

export function closeTicketRequest(token: string, requestId: number) {
  return apiFetch(`client-ticket-requests/${requestId}/status`, token, {
    method: "PATCH",
    body: JSON.stringify({ status: "CLOSED" }),
  });
}
