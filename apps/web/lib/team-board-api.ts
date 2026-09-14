import { erpFetch } from "@/lib/erp-api";

export type BoardActivityBucket = "daily" | "projects" | "services";
export type BoardUserStatus = "activo" | "inactivo" | "atrasado" | "libre" | "sin_actividad";

export type TeamBoardActivity = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  fechaMaxima: string | null;
  bucket: BoardActivityBucket;
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
  users: TeamBoardUser[];
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

export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins)) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${m.toString().padStart(2, "0")} min`;
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "Sin entrada";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin entrada";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function fetchTeamBoard(token: string): Promise<TeamBoardResponse> {
  return erpFetch<TeamBoardResponse>("me/board", token);
}

export function fetchTeamBoardUser(token: string, userId: number): Promise<TeamBoardUser> {
  return erpFetch<TeamBoardUser>(`me/board/${userId}`, token);
}

export function fetchTeamBoardHistory(
  token: string,
  userId: number,
): Promise<TeamBoardHistoryItem[]> {
  return erpFetch<TeamBoardHistoryItem[]>(`me/board/${userId}/history`, token);
}
