/** Formulario moderno de OT — extraído del legacy `ActivitiesTable`. */
import { aInputFecha } from "@/lib/proyecto-plan";
import { estandarDeRegistro, payloadEstandar, type EstandarGuardado } from "@/lib/tiempo-estandar";

export type ActivityProjectMode = 'with_project' | 'without_project';

export const EMPTY_ACTIVITY_FORM = {
  titulo: "",
  indicaciones: "",
  prioridad: "Media",
  responsableId: "",
  tiempoEstimadoMin: "",
  tiempoMaximoMin: "",
  /** Día (y primer día del periodo, si lo hay). */
  fecha: "",
  hora: "09:00",
  /**
   * «Entregar a más tardar» (`HH:MM`, mismo día). Vacío = como siempre: el límite es el fin del
   * día. Con valor, la fecha máxima y la entrega esperada quedan a esa hora y el semáforo, los
   * KPI y el cierre «No cumplida» la toman como el compromiso real (28-10).
   */
  horaCompromiso: "",
  /**
   * Último día del periodo (`AAAA-MM-DD`). Vacío = actividad de un solo momento, como
   * siempre. Con valor, la actividad sigue en la pizarra cada día hasta ese día.
   */
  periodoFin: "",
  /** Etapa del cronograma del proyecto que ejecuta (id, o vacío). */
  projectMilestoneId: "",
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
  /** Complejidad elegida (`BASICA`…`CRITICA`, o vacío) y la que sugirió la IA. */
  complejidad: "",
  complejidadSugerida: "",
  /**
   * Tiempo estándar (§8): lo que se cuenta, el destino, el traslado y el total con su desglose.
   * null = el tipo no tiene estándar o todavía no se calcula. Lo llena `TiempoEstandarCampo`.
   */
  estandar: null as EstandarGuardado | null,
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

/**
 * La hora compromiso de una actividad guardada: su fecha máxima, si cae el mismo día y después
 * del inicio. Igual que antes, una fecha máxima igual al inicio significa «fin del día» y se
 * deja vacía. Con periodo de varios días no aplica.
 */
export function horaCompromisoDe(record: Record<string, unknown>): string {
  if (record.periodoFin) return "";
  const inicio = record.fechaInicio ? new Date(record.fechaInicio as string) : null;
  const maxima = record.fechaMaxima ? new Date(record.fechaMaxima as string) : null;
  if (!inicio || !maxima || Number.isNaN(inicio.getTime()) || Number.isNaN(maxima.getTime())) return "";
  if (maxima.getTime() <= inicio.getTime()) return "";
  if (toDateInputValue(maxima.toISOString()) !== toDateInputValue(inicio.toISOString())) return "";
  return maxima.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** El compromiso vale solo si es después de la hora de inicio. */
export function compromisoValido(hora: string, compromiso: string): boolean {
  return !compromiso || (/^\d{2}:\d{2}$/.test(compromiso) && compromiso > (hora || "09:00"));
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
    // Con periodo, el día de inicio es el del periodo (columna de fecha: se lee sin zona).
    fecha: record.periodoInicio
      ? aInputFecha(record.periodoInicio as string)
      : toDateInputValue(
          (record.fechaInicio as string) ?? (record.fechaEntregaEsperada as string) ?? (record.fechaMaxima as string),
        ),
    periodoFin: record.periodoFin ? aInputFecha(record.periodoFin as string) : "",
    projectMilestoneId: record.projectMilestoneId ? String(record.projectMilestoneId) : "",
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
    horaCompromiso: horaCompromisoDe(record),
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
    complejidad: String(record.complejidad ?? ""),
    complejidadSugerida: String(record.complejidadSugerida ?? ""),
    estandar: estandarDeRegistro(record),
  };
}

function horaLimite(form: ActivityFormState): string {
  const hora = form.hora || "09:00";
  return !form.periodoFin && form.horaCompromiso && compromisoValido(hora, form.horaCompromiso) ? form.horaCompromiso : hora;
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
    // Sin compromiso, la fecha máxima es la de inicio y la API la lee como «fin del día».
    fechaEntregaEsperada: form.fecha
      ? new Date(`${form.fecha}T${horaLimite(form)}:00`).toISOString()
      : undefined,
    fechaMaxima: form.fecha
      ? new Date(`${form.fecha}T${horaLimite(form)}:00`).toISOString()
      : undefined,
    evidencePhotoRequired: (() => {
      const n = Math.round(Number(form.evidencePhotoRequired || 4));
      if (!Number.isFinite(n)) return 4;
      return Math.min(8, Math.max(2, n));
    })(),
    coreKind: form.coreKind || undefined,
    assignmentCharge: form.assignmentCharge || undefined,
    // Al editar, vacío la quita; al crear, solo va si se eligió.
    complejidad: form.complejidad || (options.isEdit ? null : undefined),
    complejidadSugerida: form.complejidadSugerida || undefined,
    // Tiempo estándar: solo va si el tipo lo tiene (cantidad, destino, total y motivo si se cambió).
    ...payloadEstandar(form.estandar),
  };

  // Periodo: del día elegido al día de fin. La API fija la fecha máxima y la entrega al fin
  // del último día. Al editar se manda siempre (null = quitarlo); al crear, solo si hay.
  const periodo = periodoDelFormulario(form);
  if (periodo) {
    payload.periodoInicio = periodo.inicio;
    payload.periodoFin = periodo.fin;
  } else if (options.isEdit) {
    payload.periodoInicio = null;
    payload.periodoFin = null;
  }
  if (form.projectMilestoneId && payload.projectId) {
    payload.projectMilestoneId = Number(form.projectMilestoneId);
  } else if (options.isEdit) {
    payload.projectMilestoneId = null;
  }

  if (!options.isEdit) {
    payload.estatus = "Pendiente";
    if (options.userId) payload.creadoPorId = options.userId;
  }

  return payload;
}

/** Periodo que captura el formulario, o null si es de un solo momento (o va al revés). */
export function periodoDelFormulario(
  form: Pick<ActivityFormState, "fecha" | "periodoFin">,
): { inicio: string; fin: string } | null {
  if (!form.fecha || !form.periodoFin || form.periodoFin < form.fecha) return null;
  return { inicio: form.fecha, fin: form.periodoFin };
}

export function activitySubmitLabel(form: ActivityFormState, isEdit: boolean, tone: 'ops' | 'core' = 'ops'): string {
  if (isEdit) return 'Guardar cambios';
  if (tone === 'core') return form.responsableId ? 'Asignar actividad' : 'Crear actividad';
  if (form.responsableId) return 'Asignar OT';
  return 'Crear OT';
}