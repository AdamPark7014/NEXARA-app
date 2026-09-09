export type ActivityFormState = {
  titulo: string;
  indicaciones: string;
  prioridad: string;
  responsableId: string;
  tiempoEstimadoMin: string;
  tiempoMaximoMin: string;
  fecha: string;
  clientId: string;
  projectId: string;
  ticketType: string;
  ticketTypeCustom: string;
  workType: "ISSUE" | "PREVENTIVE_INVENTORY";
  branchName: string;
  branchNumber: string;
  branchCity: string;
  branchState: string;
  branchAddress: string;
};

export const EMPTY_ACTIVITY_FORM: ActivityFormState = {
  titulo: "",
  indicaciones: "",
  prioridad: "Media",
  responsableId: "",
  tiempoEstimadoMin: "",
  tiempoMaximoMin: "",
  fecha: "",
  clientId: "",
  projectId: "",
  ticketType: "PREVENTIVO",
  ticketTypeCustom: "",
  workType: "ISSUE",
  branchName: "",
  branchNumber: "",
  branchCity: "",
  branchState: "",
  branchAddress: "",
};

export const PRIORIDAD_LIST = ["Baja", "Media", "Alta"];

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
    clientId: record.projectId ? (record.client?.id ?? (record.clientId ? Number(record.clientId) : undefined)) : (record.clientId ? Number(record.clientId) : undefined),
    projectId,
    ticketType: String(record.ticketType ?? "PREVENTIVO"),
    ticketTypeCustom: String(record.ticketTypeCustom ?? ""),
    workType: (record.workType as ActivityFormState["workType"]) ?? "ISSUE",
    branchName: String(record.branchName ?? ""),
    branchNumber: String(record.branchNumber ?? ""),
    branchCity: String(record.branchCity ?? ""),
    branchState: String(record.branchState ?? ""),
    branchAddress: String(record.branchAddress ?? ""),
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
    activityType: form.projectId ? 'CLIENT' : 'INTERNAL',
    ticketType: form.ticketType === "INVENTARIO" ? "PREVENTIVO" : form.ticketType,
    ticketTypeCustom: form.ticketType === "OTRO" ? form.ticketTypeCustom || undefined : undefined,
    workType: form.ticketType === "INVENTARIO" ? "PREVENTIVE_INVENTORY" : form.workType || "ISSUE",
    projectId: form.projectId ? Number(form.projectId) : undefined,
    clientId: form.projectId ? (project?.client.id ?? (form.clientId ? Number(form.clientId) : undefined)) : (form.clientId ? Number(form.clientId) : undefined),
    branchName: form.branchName || undefined,
    branchNumber: form.branchNumber || undefined,
    branchCity: form.branchCity || undefined,
    branchState: form.branchState || undefined,
    branchAddress: form.branchAddress || undefined,
    responsableId: Number(form.responsableId),
    tiempoEstimadoMin: form.tiempoEstimadoMin ? Number(form.tiempoEstimadoMin) : undefined,
    tiempoMaximoMin: form.tiempoMaximoMin ? Number(form.tiempoMaximoMin) : undefined,
    fechaInicio: form.fecha ? new Date(`${form.fecha}T08:00:00`).toISOString() : undefined,
  };

  if (!options.isEdit) {
    payload.estatus = "Pendiente";
    if (options.userId) payload.creadoPorId = options.userId;
  }

  return payload;
}

export function activitySubmitLabel(form: ActivityFormState, isEdit: boolean): string {
  if (isEdit) return 'Guardar cambios';
  if (form.responsableId) return 'Asignar OT';
  return 'Crear OT';
}