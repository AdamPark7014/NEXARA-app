import { buildApiUrl } from "@/lib/api-base";

import type { ActivityEvidenceDetail } from "@/lib/evidence-display";

export type ActivityDetail = {
  id: number;
  anNumber: string;
  titulo: string;
  descripcion?: string | null;
  indicaciones?: string | null;
  estatus: string;
  prioridad?: string | null;
  ticketType?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  branchCity?: string | null;
  branchState?: string | null;
  fechaAsignacion?: string;
  fechaInicio?: string | null;
  fechaEntregaEsperada?: string | null;
  fechaFinalizacion?: string | null;
  responsable?: { id: number; nombre: string } | null;
  creador?: { id: number; nombre: string } | null;
  client?: { id: number; name: string } | null;
  activityEvidence?: ActivityEvidenceDetail | null;
  evidencias?: Array<{ id: number; tipo?: string; descripcion?: string; url?: string }>;
  assignees?: Array<{
    id: number;
    rol?: string;
    horasPlan?: number | string | null;
    horasReales?: number | string | null;
    user?: { id: number; nombre: string; email?: string };
  }>;
  fechaMaxima?: string | null;
  tiempoEstimadoMin?: number | null;
  tiempoMaximoMin?: number | null;
  slaAlertedAt?: string | null;
  clientFeedback?: string | null;
  branchLatitude?: number | string | null;
  branchLongitude?: number | string | null;
};

export type ViaticoRow = {
  id: number;
  montoSolicitado: number | string;
  motivo?: string | null;
  estatus: string;
  fechaSolicitud?: string;
  actividadId?: number | null;
  User?: { nombre?: string };
};

async function apiFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
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

export async function listViaticsForActivity(token: string, activityId: number) {
  const data = await apiFetch<ViaticoRow[] | { data: ViaticoRow[] }>("viatics", token);
  const rows = Array.isArray(data) ? data : (data?.data ?? []);
  return rows.filter((v) => Number(v.actividadId) === activityId);
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

export function listActivityMaterials(token: string, activityId: number) {
  return apiFetch<{ movimientos: ActivityMaterialRow[]; costoTotal: number }>(
    `activities/${activityId}/materiales`,
    token,
  );
}

export function listActivityTimeline(token: string, activityId: number) {
  return apiFetch<{ events: ActivityTimelineEvent[] }>(`activities/${activityId}/timeline`, token);
}

export function reassignActivity(
  token: string,
  activityId: number,
  body: { aUsuarioId: number; motivo?: string; retirarAnterior?: boolean },
) {
  return apiFetch<{ reassigned: boolean }>(`activities/${activityId}/reasignar`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
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

export function listAssignableUsers(token: string) {
  return apiFetch<AssignableUserOption[]>("users/assignable", token);
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
