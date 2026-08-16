/**
 * NEXARA · Incidencias y recomendaciones de servicio — cliente API
 * ----------------------------------------------------------------
 * Consume `apps/api/src/activities/activity-issues.controller.ts`.
 * Usado por el detalle de actividad en OPS.
 *
 * Ambas cosas vivían en `ServiceSheet.observations`, texto libre: no se podía
 * contar cuántas veces se fue en balde por falta de material, ni cuánta
 * facturación nace de lo que ve el técnico en sitio.
 */
import { buildApiUrl } from "@/lib/api-base";

export const INCIDENT_TYPES = [
  "ACCESO_DENEGADO",
  "FALTA_MATERIAL",
  "FALLA_EQUIPO",
  "CONDICION_INSEGURA",
  "CLIMA",
  "ALCANCE_ADICIONAL",
  "RETRASO_CLIENTE",
  "DANO_INSTALACION",
  "OTRO",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  ACCESO_DENEGADO: "No dieron acceso",
  FALTA_MATERIAL: "Faltó material",
  FALLA_EQUIPO: "Falló el equipo",
  CONDICION_INSEGURA: "Condición insegura",
  CLIMA: "Clima",
  ALCANCE_ADICIONAL: "Alcance adicional",
  RETRASO_CLIENTE: "Retraso del cliente",
  DANO_INSTALACION: "Daño en la instalación",
  OTRO: "Otro",
};

export const INCIDENT_SEVERITIES = ["BAJA", "MEDIA", "ALTA", "CRITICA"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
  CRITICA: "Crítica",
};

export const RECOMMENDATION_TYPES = [
  "CORRECTIVO",
  "PREVENTIVO",
  "MEJORA",
  "ACTUALIZACION",
  "CAPACITACION",
  "AMPLIACION",
] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const RECOMMENDATION_TYPE_LABEL: Record<RecommendationType, string> = {
  CORRECTIVO: "Correctivo",
  PREVENTIVO: "Preventivo",
  MEJORA: "Mejora",
  ACTUALIZACION: "Actualización",
  CAPACITACION: "Capacitación",
  AMPLIACION: "Ampliación",
};

export const RECOMMENDATION_PRIORITIES = ["BAJA", "MEDIA", "ALTA", "URGENTE"] as const;
export type RecommendationPriority = (typeof RECOMMENDATION_PRIORITIES)[number];

export const PRIORITY_LABEL: Record<RecommendationPriority, string> = {
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export type RecommendationStatus =
  | "ABIERTA"
  | "COTIZADA"
  | "ACEPTADA"
  | "RECHAZADA"
  | "DESCARTADA";

export const RECOMMENDATION_STATUS_LABEL: Record<RecommendationStatus, string> = {
  ABIERTA: "Abierta",
  COTIZADA: "Cotizada",
  ACEPTADA: "Aceptada",
  RECHAZADA: "Rechazada",
  DESCARTADA: "Descartada",
};

type UserBrief = { id: number; nombre: string };

export type Incident = {
  id: number;
  activityId: number;
  tipo: IncidentType;
  severidad: IncidentSeverity;
  descripcion: string;
  accionTomada: string | null;
  horasPerdidas: string | number | null;
  reportadoPor?: UserBrief | null;
  resueltoPor?: UserBrief | null;
  resueltoAt: string | null;
  createdAt: string;
};

export type Recommendation = {
  id: number;
  activityId: number;
  tipo: RecommendationType;
  prioridad: RecommendationPriority;
  estado: RecommendationStatus;
  descripcion: string;
  costoEstimado: string | number | null;
  cotizacionId: number | null;
  cotizacion?: { id: number; quoteNumber: string; status: string; total: string | number } | null;
  creadoPor?: UserBrief | null;
  cerradoAt: string | null;
  createdAt: string;
};

export type IncidentSummary = {
  total: number;
  abiertas: number;
  horasPerdidas: number;
  porTipo: Array<{ tipo: IncidentType; conteo: number; horasPerdidas: number }>;
  porSeveridad: Array<{ severidad: IncidentSeverity; conteo: number }>;
};

async function apiFetch<T = unknown>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(buildApiUrl(path), { ...init, headers });
  const text = await res.text();

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      if (json?.message) {
        message = Array.isArray(json.message) ? json.message.join(", ") : String(json.message);
      }
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  return (text ? JSON.parse(text) : null) as T;
}

// ── Incidencias ───────────────────────────────────────────────────────────

export const listIncidents = async (token: string, activityId: number): Promise<Incident[]> => {
  const data = await apiFetch<Incident[]>(`activities/${activityId}/incidencias`, token);
  return Array.isArray(data) ? data : [];
};

export const addIncident = (
  token: string,
  activityId: number,
  body: {
    tipo: IncidentType;
    severidad?: IncidentSeverity;
    descripcion: string;
    accionTomada?: string;
    horasPerdidas?: number;
  },
) =>
  apiFetch<Incident>(`activities/${activityId}/incidencias`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const resolveIncident = (
  token: string,
  activityId: number,
  incidentId: number,
  accionTomada?: string,
) =>
  apiFetch<Incident>(`activities/${activityId}/incidencias/${incidentId}/resolver`, token, {
    method: "PATCH",
    body: JSON.stringify({ accionTomada }),
  });

export const reopenIncident = (token: string, activityId: number, incidentId: number) =>
  apiFetch<{ reopened: boolean }>(
    `activities/${activityId}/incidencias/${incidentId}/reabrir`,
    token,
    { method: "PATCH" },
  );

export const getIncidentSummary = (token: string, range?: { desde?: string; hasta?: string }) => {
  const q = new URLSearchParams();
  if (range?.desde) q.set("desde", range.desde);
  if (range?.hasta) q.set("hasta", range.hasta);
  const suffix = q.toString() ? `?${q}` : "";
  return apiFetch<IncidentSummary>(`activities/reportes/incidencias${suffix}`, token);
};

// ── Recomendaciones ───────────────────────────────────────────────────────

export const listRecommendations = async (
  token: string,
  activityId: number,
): Promise<Recommendation[]> => {
  const data = await apiFetch<Recommendation[]>(`activities/${activityId}/recomendaciones`, token);
  return Array.isArray(data) ? data : [];
};

export const addRecommendation = (
  token: string,
  activityId: number,
  body: {
    tipo: RecommendationType;
    prioridad?: RecommendationPriority;
    descripcion: string;
    costoEstimado?: number;
  },
) =>
  apiFetch<Recommendation>(`activities/${activityId}/recomendaciones`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateRecommendation = (
  token: string,
  activityId: number,
  recommendationId: number,
  body: Partial<{
    estado: RecommendationStatus;
    prioridad: RecommendationPriority;
    cotizacionId: number | null;
    costoEstimado: number | null;
  }>,
) =>
  apiFetch<Recommendation>(`activities/${activityId}/recomendaciones/${recommendationId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

/** Lo que Ingeniería detectó y Ventas todavía no ha convertido. */
export const listPendingRecommendations = (token: string) =>
  apiFetch<{ total: number; valorPotencial: number; recomendaciones: Recommendation[] }>(
    "activities/reportes/recomendaciones-abiertas",
    token,
  );
