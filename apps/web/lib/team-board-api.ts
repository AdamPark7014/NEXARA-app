import { erpFetch } from "@/lib/erp-api";
import { isNonEmployeeEmail } from "@/lib/platform-accounts";
import type { PeriodoActividad } from "@/lib/actividad-periodo";

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
  /** Hora real de arranque, no la programada. */
  inicioRealAt?: string | null;
  finRealAt?: string | null;
  asignadoPor?: { id: number; nombre: string } | null;
  aceptacion?: BoardAceptacion;
  /** Actividad de varios días: sigue en la pizarra cada día hasta su fin. */
  periodo?: PeriodoActividad | null;
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
  activo: "Activo",
  atrasado: "Atrasado",
  libre: "Terminó",
  sin_actividad: "Sin actividad",
  inactivo: "Inactivo",
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
  rojo: "Atención",
  amarillo: "Va justa",
  verde: "En orden",
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

export type RangoPreset = "hoy" | "semana" | "mes" | "personalizado";

export const RANGO_LABELS: Record<RangoPreset, string> = {
  hoy: "Hoy",
  semana: "Semana",
  mes: "Mes",
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

/** Semana = del lunes a hoy; mes = del día 1 a hoy. */
export function rangoDePreset(preset: RangoPreset, hoy: string = fechaMx()): BoardRange {
  if (preset === "semana") {
    const [y, m, d] = hoy.split("-").map(Number);
    const dow = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0 = domingo
    return { desde: suma(hoy, -((dow + 6) % 7)), hasta: hoy };
  }
  if (preset === "mes") return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
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

export function fetchTeamBoardHistory(
  token: string,
  userId: number,
): Promise<TeamBoardHistoryItem[]> {
  return erpFetch<TeamBoardHistoryItem[]>(`me/board/${userId}/history`, token);
}
