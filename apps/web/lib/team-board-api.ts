import { erpFetch } from "@/lib/erp-api";
import { isNonEmployeeEmail } from "@/lib/platform-accounts";
import type { PeriodoActividad } from "@/lib/actividad-periodo";
import type { PausaTipo } from "@/lib/sesion-actividad";

export type BoardActivityBucket = "daily" | "projects" | "services";
export type BoardUserStatus = "activo" | "inactivo" | "atrasado" | "libre" | "sin_actividad";
export type Prioridad = "ALTA" | "MEDIA" | "BAJA";
export type Semaforo = "rojo" | "amarillo" | "verde";
export type BoardAceptacion = "PENDIENTE" | "ACEPTADA" | "RECHAZADA";

/** Rango de la pizarra en `AAAA-MM-DD`; sin nada, la API responde el día de hoy. */
export type BoardRange = { desde?: string | null; hasta?: string | null };

export type TeamBoardActivity = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  fechaMaxima: string | null;
  bucket: BoardActivityBucket;
  /** Actividad de varios días (API vieja: no viene). */
  periodo?: PeriodoActividad | null;
  /** Ya la inició pero su reloj está detenido (pausa, salida del día o corte automático). */
  enPausa?: boolean;
};

export type TeamBoardOpenActivity = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  evidenceStatus: string;
  progressPct: number;
  coreKind: string | null;
  assignmentCharge?: string | null;
  fechaFinalizacion: string | null;
  /** Indicaciones del assignee (p. ej. Cupo: N personas). */
  indicaciones?: string | null;
  /** Emails del equipo activo: dice si un despacho ya se repartió. */
  teamEmails?: string[];
  /** Día/hora programada (reprogramable por quien reparte). */
  fechaInicio?: string | null;
  /** Contrato C (API vieja: puede no venir). */
  prioridad?: Prioridad;
  semaforo?: Semaforo;
  minutosPlan?: number | null;
  minutosReales?: number | null;
  excedida?: boolean;
  /** Pasó la hora de inicio sin arrancar, o el tope sin terminarse. */
  atrasada?: boolean;
  /** Minutos de ese atraso, para «Atrasada · 2 h». */
  minutosAtraso?: number | null;
  /** Hora real de arranque, no la programada. */
  inicioRealAt?: string | null;
  finRealAt?: string | null;
  asignadoPor?: { id: number; nombre: string } | null;
  aceptacion?: BoardAceptacion;
  /** Actividad de varios días: sigue en la pizarra cada día hasta su fin. */
  periodo?: PeriodoActividad | null;
  /**
   * Sesiones de trabajo (API nueva; opcional). `enCurso`: su reloj corre. `enPausa`: ya la
   * inició y está detenida (pausa, salida del día o corte automático): hay que reanudarla.
   */
  enCurso?: boolean;
  enPausa?: boolean;
  pausaTipo?: PausaTipo | null;
  pausadaAt?: string | null;
  pausadaPor?: { id: number; nombre: string } | null;
  motivoPausa?: string | null;
  sesionAbiertaDesde?: string | null;
};

/** Contrato C: cómo le fue a la persona en el rango consultado. */
export type BoardKpis = {
  asignadas: number;
  cerradas: number;
  aTiempo: number;
  aTiempoPct: number | null;
  minutosPlan: number;
  minutosReales: number;
  eficienciaPct: number | null;
  minutosAsistidos: number | null;
  minutosEnActividad: number;
  productividadPct: number | null;
  rechazadas: number;
};

export type TeamBoardUser = {
  id: number;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  puesto: string | null;
  status: BoardUserStatus;
  currentActivity: TeamBoardActivity | null;
  openActivities?: TeamBoardOpenActivity[];
  clockInAt: string | null;
  workedMinutes: number | null;
  activityStartedAt: string | null;
  activityElapsedMinutes: number | null;
  /** Atrasado: minutos pasados de la fecha máxima de lo que está haciendo. */
  currentLateMinutes?: number | null;
  /** Libre: desde cuándo no tiene nada abierto (terminó su última actividad de hoy). */
  idleSinceAt?: string | null;
  /** Libre: última actividad que terminó hoy y con cuánto atraso (null = sin fecha máxima). */
  lastFinished?: {
    id: number;
    anNumber: string;
    titulo: string;
    finishedAt: string;
    lateMinutes: number | null;
  } | null;
  /** Actividades suyas entregadas que nadie ha aprobado. */
  enEsperaAprobacion?: number;
  /** Actividades con evidencia devuelta que está corrigiendo. */
  enCorreccion?: number;
  /** Contrato C (API vieja: puede no venir). */
  kpis?: BoardKpis;
  /** Quien mira puede pausarle una actividad (mismo alcance que para asignarle). */
  puedePausar?: boolean;
};

export type TeamBoardHistoryItem = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  coreKind: string | null;
  /** Subtipo de tarea (Levantamiento, Junta…) o texto libre de «Otro». */
  ticketTypeCustom?: string | null;
  assignmentCharge?: string | null;
  fechaAsignacion: string;
  fechaFinalizacion: string | null;
  /** La sacaron del equipo: sigue en su historial, no en sus KPI. */
  retirado?: boolean;
  retiradoAt?: string | null;
  prioridad?: Prioridad;
  semaforo?: Semaforo;
  minutosPlan?: number | null;
  minutosReales?: number | null;
  evidence: {
    status: string;
    progressPct: number;
    entryPhotoUrl: string | null;
    evidencePhotos: string[];
    exitPhotoUrl: string | null;
    serviceSheetPdfUrl: string | null;
    serviceSheetData: unknown;
  } | null;
};

export type TeamBoardResponse = {
  scope: "company" | "subtree";
  /** Rango que respondió la API, en `AAAA-MM-DD`. */
  desde?: string;
  hasta?: string;
  users: TeamBoardUser[];
  /** Pipeline de flujo (Ola C). */
  workflow?: WorkflowPipeline;
};

/** Conteo pipeline: asignada → iniciada → evidencia → cerrada + peer rejects + SLA. */
export type WorkflowPipeline = {
  assigned: number;
  started: number;
  evidence: number;
  closed: number;
  peerRejected: number;
  slaOnTime: number;
  slaLate: number;
  slaPct: number | null;
};

/** Cada número de «Flujo del periodo» se puede pedir por separado: qué actividades lo componen. */
export type WorkflowBucket =
  | "assigned"
  | "started"
  | "evidence"
  | "closed"
  | "peerRejected"
  | "slaOnTime"
  | "slaLate";

export const WORKFLOW_BUCKET_LABELS: Record<WorkflowBucket, string> = {
  assigned: "Asignadas",
  started: "Iniciadas",
  evidence: "Con evidencias",
  closed: "Cerradas",
  peerRejected: "Rechazadas entre compañeros",
  slaOnTime: "A tiempo",
  slaLate: "Tarde / vencidas",
};

export type WorkflowBucketItem = {
  id: number;
  activityId: number | null;
  anNumber: string | null;
  titulo: string;
  estatus: string | null;
  persona: { id: number; nombre: string; avatarUrl: string | null; puesto: string | null } | null;
  fecha: string;
  detalle: string | null;
};

export type WorkflowBucketResponse = {
  scope: "company" | "subtree";
  desde: string;
  hasta: string;
  bucket: WorkflowBucket;
  items: WorkflowBucketItem[];
};

/** Contrato C: lo que repartió quien mira. */
export type AsignadaPorMiItem = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  coreKind: string | null;
  assignmentCharge?: string | null;
  fechaAsignacion: string;
  fechaMaxima: string | null;
  fechaFinalizacion: string | null;
  /** Actividad de varios días (API vieja: no viene). */
  periodo?: PeriodoActividad | null;
  persona: { id: number; nombre: string; avatarUrl: string | null; puesto: string | null };
  prioridad: Prioridad;
  semaforo: Semaforo;
  minutosPlan: number | null;
  minutosReales: number | null;
  excedida: boolean;
  terminada: boolean;
  retirado: boolean;
  aceptacion: BoardAceptacion;
  /** Solo histórico: rechazos de antes del 18-09 (ya no se puede rechazar). */
  motivoRechazo: string | null;
  /** Hora real en que la inició; null = sin iniciar (API anterior: no viene). */
  inicioRealAt?: string | null;
};

export type AsignadasPorMiResponse = {
  desde: string;
  hasta: string;
  items: AsignadaPorMiItem[];
};

export const STATUS_LABELS: Record<BoardUserStatus, string> = {
  activo: "Trabajando",
  atrasado: "Atrasado",
  libre: "Libre",
  sin_actividad: "Sin nada asignado",
  inactivo: "Sin entrada hoy",
};

export const STATUS_COLORS: Record<BoardUserStatus, string> = {
  activo: "#16a34a",
  atrasado: "#dc2626",
  libre: "#0891b2",
  sin_actividad: "#94a3b8",
  inactivo: "#94a3b8",
};

export const SEMAFORO_COLORS: Record<Semaforo, string> = {
  rojo: "#dc2626",
  amarillo: "#d97706",
  verde: "#16a34a",
};

export const SEMAFORO_LABELS: Record<Semaforo, string> = {
  rojo: "Atrasada",
  amarillo: "Por vencer",
  verde: "En tiempo",
};

export const PRIORIDAD_LABELS: Record<Prioridad, string> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

export const PRIORIDAD_COLORS: Record<Prioridad, string> = {
  ALTA: "#dc2626",
  MEDIA: "#d97706",
  BAJA: "#64748b",
};

/** Porcentaje de KPI; `null` = no hay con qué calcularlo todavía. */
export function formatPct(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  return `${Math.round(valor)} %`;
}

export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins)) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${m.toString().padStart(2, "0")} min`;
}

export type RangoPreset = "hoy" | "semana" | "semana_pasada" | "mes" | "mes_pasado" | "personalizado";

export const RANGO_LABELS: Record<RangoPreset, string> = {
  hoy: "Hoy",
  semana: "Semana",
  semana_pasada: "Semana pasada",
  mes: "Mes",
  mes_pasado: "Mes pasado",
  personalizado: "Personalizado",
};

/** Día de hoy en hora de México (`AAAA-MM-DD`), que es como razona la API. */
export function fechaMx(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function suma(dia: string, dias: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}

/**
 * Semana = del lunes a hoy; mes = del día 1 a hoy. Los «pasados» son periodos cerrados:
 * de lunes a domingo de la semana anterior y del 1 al último día del mes anterior.
 */
export function rangoDePreset(preset: RangoPreset, hoy: string = fechaMx()): BoardRange {
  const [y, m, d] = hoy.split("-").map(Number);
  const lunes = suma(hoy, -((new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() + 6) % 7));
  if (preset === "semana") return { desde: lunes, hasta: hoy };
  if (preset === "semana_pasada") return { desde: suma(lunes, -7), hasta: suma(lunes, -1) };
  if (preset === "mes") return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  if (preset === "mes_pasado") {
    const finAnterior = suma(`${hoy.slice(0, 7)}-01`, -1);
    return { desde: `${finAnterior.slice(0, 7)}-01`, hasta: finAnterior };
  }
  return { desde: hoy, hasta: hoy };
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "Sin entrada";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin entrada";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/** `?desde=&hasta=` solo cuando hay rango: sin nada, la API responde hoy. */
export function rangeQuery(rango?: BoardRange): string {
  const q = new URLSearchParams();
  if (rango?.desde) q.set("desde", rango.desde);
  if (rango?.hasta) q.set("hasta", rango.hasta);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function fetchTeamBoard(token: string, rango?: BoardRange): Promise<TeamBoardResponse> {
  const board = await erpFetch<TeamBoardResponse>(`me/board${rangeQuery(rango)}`, token);
  // Safety net: Christian/Adam/Claudia/cuenta demo no deben verse como equipo/empleados.
  return { ...board, users: (board.users ?? []).filter((u) => !isNonEmployeeEmail(u.email)) };
}

export function fetchTeamBoardUser(
  token: string,
  userId: number,
  rango?: BoardRange,
): Promise<TeamBoardUser> {
  return erpFetch<TeamBoardUser>(`me/board/${userId}${rangeQuery(rango)}`, token);
}

export function fetchAsignadasPorMi(
  token: string,
  rango?: BoardRange,
): Promise<AsignadasPorMiResponse> {
  return erpFetch<AsignadasPorMiResponse>(`me/board/asignadas-por-mi${rangeQuery(rango)}`, token);
}

/** Detalle de un balde del pipeline (qué actividades componen ese número). */
export function fetchWorkflowBucket(
  token: string,
  bucket: WorkflowBucket,
  rango?: BoardRange,
): Promise<WorkflowBucketResponse> {
  return erpFetch<WorkflowBucketResponse>(`me/kpis/flujo/${bucket}${rangeQuery(rango)}`, token);
}

export function fetchTeamBoardHistory(
  token: string,
  userId: number,
): Promise<TeamBoardHistoryItem[]> {
  return erpFetch<TeamBoardHistoryItem[]>(`me/board/${userId}/history`, token);
}
