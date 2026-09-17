import { buildApiUrl } from "@/lib/api-base";

export type OperationalProject = {
  id: number;
  title: string;
  description?: string | null;
  projectType?: string | null;
  scopeSummary?: string | null;
  status: string;
  startDate: string;
  endDate?: string | null;
  siteCount?: number | null;
  salesProjectId?: number | null;
  salesProject?: { id: number; name: string; status: string } | null;
  vendor?: { id: number; nombre: string; email?: string } | null;
  client?: {
    id: number;
    name: string;
    salesClients?: Array<{ id: number; name: string }>;
  } | null;
  activities?: Array<{ id: number; anNumber: string; titulo: string; estatus: string }>;
  engineers?: Array<{ id: number; engineer?: { id: number; nombre: string } }>;
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  // Desactivar un proyecto lo deja ON_HOLD: en pantalla es «Inactivo».
  ON_HOLD: "Inactivo",
  COMPLETED: "Completado",
};

export function formatOperationalProjectStatus(status?: string | null): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

/** Proyecto desactivado por Christian (status ON_HOLD). */
export const isInactiveOperationalProject = (status?: string | null) => status === "ON_HOLD";

/** Mensaje legible de un error de la API: `{ message }` de Nest (p. ej. el 403 en español) o el texto tal cual. */
function opsProjectErrorMessage(text: string, fallback: string): string {
  const raw = text.trim();
  if (!raw || /<html|<!doctype/i.test(raw)) return fallback;
  try {
    const payload = JSON.parse(raw) as { message?: unknown };
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
    if (Array.isArray(payload?.message) && payload.message.length > 0) return String(payload.message[0]);
    return fallback;
  } catch {
    return raw;
  }
}

async function opsProjectRequest<T>(path: string, token: string, init: RequestInit = {}, fallbackError: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(opsProjectErrorMessage(text, fallbackError));
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

export function listOperationalProjects(token: string, filters?: { status?: string }) {
  const qs = filters?.status ? `?status=${encodeURIComponent(filters.status)}` : "";
  return opsProjectRequest<OperationalProject[]>(`operational-projects${qs}`, token, {}, "No se pudieron cargar los proyectos");
}

export function getOperationalProject(token: string, id: number) {
  return opsProjectRequest<OperationalProject>(`operational-projects/${id}`, token, {}, "No se pudo cargar el proyecto");
}

/** Poner o quitar ON_HOLD por aquí solo lo acepta la API para Christian (403 a los demás). */
export function updateOperationalProjectStatus(token: string, id: number, status: string, notes?: string) {
  return opsProjectRequest<OperationalProject>(
    `operational-projects/${id}/status`,
    token,
    { method: "PATCH", body: JSON.stringify({ status, notes }) },
    "No se pudo actualizar el estado",
  );
}

/** Solo Christian: deja el proyecto «Inactivo» (ON_HOLD). */
export function deactivateOperationalProject(token: string, id: number) {
  return opsProjectRequest<OperationalProject>(
    `operational-projects/${id}/desactivar`,
    token,
    { method: "POST" },
    "No se pudo desactivar el proyecto",
  );
}

/** Solo Christian: regresa el proyecto a «Activo». */
export function reactivateOperationalProject(token: string, id: number) {
  return opsProjectRequest<OperationalProject>(
    `operational-projects/${id}/reactivar`,
    token,
    { method: "POST" },
    "No se pudo reactivar el proyecto",
  );
}

/** Solo Christian: borrado lógico; desaparece de listas y sus actividades conservan el historial. */
export function deleteOperationalProject(token: string, id: number) {
  return opsProjectRequest<{ ok: boolean; id?: number }>(
    `operational-projects/${id}`,
    token,
    { method: "DELETE" },
    "No se pudo eliminar el proyecto",
  );
}

export type UpdateOperationalProjectPayload = {
  title?: string;
  description?: string;
  scopeSummary?: string;
  endDate?: string | null;
  siteCount?: number;
  projectType?: string;
};

export function updateOperationalProject(token: string, id: number, dto: UpdateOperationalProjectPayload) {
  return opsProjectRequest<OperationalProject>(
    `operational-projects/${id}`,
    token,
    { method: "PATCH", body: JSON.stringify(dto) },
    "No se pudo actualizar el proyecto",
  );
}

export function assignProjectEngineer(token: string, projectId: number, engineerId: number) {
  return opsProjectRequest<OperationalProject>(
    `operational-projects/${projectId}/engineers`,
    token,
    { method: "POST", body: JSON.stringify({ engineerId }) },
    "No se pudo asignar ingeniero",
  );
}

export function removeProjectEngineer(token: string, projectId: number, engineerId: number) {
  return opsProjectRequest<void>(
    `operational-projects/${projectId}/engineers/${engineerId}`,
    token,
    { method: "DELETE" },
    "No se pudo quitar ingeniero",
  );
}

export type CreateOperationalProjectPayload = {
  title: string;
  clientId: number;
  vendorId: number;
  startDate: string;
  projectType?: string;
  description?: string;
  scopeSummary?: string;
  endDate?: string;
  siteCount?: number;
};

export function createOperationalProject(token: string, dto: CreateOperationalProjectPayload) {
  return opsProjectRequest<OperationalProject>(
    "operational-projects",
    token,
    { method: "POST", body: JSON.stringify(dto) },
    "No se pudo crear el proyecto",
  );
}
