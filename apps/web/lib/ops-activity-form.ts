/** Formulario moderno de OT — extraído del legacy `ActivitiesTable`. */

export type ActivityProjectMode = 'with_project' | 'without_project';

export const EMPTY_ACTIVITY_FORM = {
  titulo: "",
  indicaciones: "",
  prioridad: "Media",
  responsableId: "",
  tiempoEstimadoMin: "",
  tiempoMaximoMin: "",
  fecha: "",
  hora: "09:00",
  clientId: "",
  projectId: "",
  ticketType: "PREVENTIVO",
  ticketTypeCustom: "",
  workType: "ISSUE" as "ISSUE" | "PREVENTIVE_INVENTORY",
  branchName: "",
  branchNumber: "",
  branchCity: "",
  branchState: "",
  branchAddress: "",
  projectMode: 'with_project' as ActivityProjectMode,
  evidencePhotoRequired: "4",
  coreKind: "",
  assignmentCharge: "",
};

export type ActivityFormState = typeof EMPTY_ACTIVITY_FORM;

export const PRIORIDAD_LIST = ["Baja", "Media", "Alta"];

export type OperationalProjectOption = {
  id: number;
  title: string;
  status: string;
  client: { id: number; name: string };
};

export type AssignableUserOption = {
  id: number;
  nombre: string;
  email?: string;
  role?: { nombre: string };
};

export function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formFromActivityRecord(record: Record<string, unknown>): ActivityFormState {
  const client = record.client as { id?: number; name?: string } | null | undefined;
  const projectId = record.projectId ? String(record.projectId) : "";
  return {
    titulo: String(record.titulo ?? ""),
    indicaciones: String(record.indicaciones ?? ""),
    prioridad: String(record.prioridad ?? "Media"),
    responsableId: record.responsableId ? String(record.responsableId) : "",
    tiempoEstimadoMin: record.tiempoEstimadoMin != null ? String(record.tiempoEstimadoMin) : "",
    tiempoMaximoMin: record.tiempoMaximoMin != null ? String(record.tiempoMaximoMin) : "",
    fecha: toDateInputValue(
      (record.fechaInicio as string) ?? (record.fechaEntregaEsperada as string) ?? (record.fechaMaxima as string),
    ),
    hora: (() => {
      const raw =
        (record.fechaInicio as string) ??
        (record.fechaEntregaEsperada as string) ??
        (record.fechaMaxima as string);
      if (!raw) return "09:00";
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return "09:00";
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    })(),
    clientId: record.clientId ? String(record.clientId) : client?.id ? String(client.id) : "",
    projectId,
    ticketType: String(record.ticketType ?? "PREVENTIVO"),
    ticketTypeCustom: String(record.ticketTypeCustom ?? ""),
    workType: (record.workType as ActivityFormState["workType"]) ?? "ISSUE",
    branchName: String(record.branchName ?? ""),
    branchNumber: String(record.branchNumber ?? ""),
    branchCity: String(record.branchCity ?? ""),
    branchState: String(record.branchState ?? ""),
    branchAddress: String(record.branchAddress ?? ""),
    projectMode: record.projectId ? "with_project" : "without_project",
    evidencePhotoRequired: record.evidencePhotoRequired != null ? String(record.evidencePhotoRequired) : "4",
    coreKind: String(record.coreKind ?? ""),
    assignmentCharge: String(record.assignmentCharge ?? ""),
  };
}

export function buildActivityPayload(
  form: ActivityFormState,
  project: OperationalProjectOption | undefined,
  options: { userId?: number; isEdit?: boolean },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    titulo: form.titulo,
    indicaciones: form.indicaciones || undefined,
    prioridad: form.prioridad,
    activityType: form.projectMode === 'with_project' ? 'CLIENT' : 'INTERNAL',
    ticketType: form.ticketType === "INVENTARIO" ? "PREVENTIVO" : form.ticketType,
    ticketTypeCustom: form.ticketType === "OTRO" ? form.ticketTypeCustom || undefined : undefined,
    workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : form.workType || "ISSUE",
    projectId: form.projectMode === 'with_project' && form.projectId ? Number(form.projectId) : undefined,
    clientId: form.projectMode === 'with_project' ? (project?.client.id ?? (form.clientId ? Number(form.clientId) : undefined)) : (form.clientId ? Number(form.clientId) : undefined),
    branchName: form.branchName || undefined,
    branchNumber: form.branchNumber || undefined,
    branchCity: form.branchCity || undefined,
    branchState: form.branchState || undefined,
    branchAddress: form.branchAddress || undefined,
    responsableId: Number(form.responsableId),
    tiempoEstimadoMin: form.tiempoEstimadoMin ? Number(form.tiempoEstimadoMin) : undefined,
    tiempoMaximoMin: form.tiempoMaximoMin ? Number(form.tiempoMaximoMin) : undefined,
    fechaInicio: form.fecha
      ? new Date(`${form.fecha}T${form.hora || "09:00"}:00`).toISOString()
      : undefined,
    fechaEntregaEsperada: form.fecha
      ? new Date(`${form.fecha}T${form.hora || "09:00"}:00`).toISOString()
      : undefined,
    fechaMaxima: form.fecha
      ? new Date(`${form.fecha}T${form.hora || "09:00"}:00`).toISOString()
      : undefined,
    evidencePhotoRequired: (() => {
      const n = Math.round(Number(form.evidencePhotoRequired || 4));
      if (!Number.isFinite(n)) return 4;
      return Math.min(8, Math.max(2, n));
    })(),
    coreKind: form.coreKind || undefined,
    assignmentCharge: form.assignmentCharge || undefined,
  };

  if (!options.isEdit) {
    payload.estatus = "Pendiente";
    if (options.userId) payload.creadoPorId = options.userId;
  }

  return payload;
}

export function activitySubmitLabel(form: ActivityFormState, isEdit: boolean, tone: 'ops' | 'core' = 'ops'): string {
  if (isEdit) return 'Guardar cambios';
  if (tone === 'core') return form.responsableId ? 'Asignar actividad' : 'Crear actividad';
  if (form.responsableId) return 'Asignar OT';
  return 'Crear OT';
}