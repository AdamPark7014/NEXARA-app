import { erpFetch } from "@/lib/erp-api";

export type BoardActivityBucket = "daily" | "projects" | "services";
export type BoardUserStatus = "activo" | "inactivo" | "atrasado" | "sin_actividad";

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
};

export type TeamBoardHistoryItem = {
  id: number;
  anNumber: string;
  titulo: string;
  estatus: string;
  coreKind: string | null;
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
  inactivo: "Inactivo",
  sin_actividad: "Sin actividad",
};

export const STATUS_COLORS: Record<BoardUserStatus, string> = {
  activo: "#16a34a",
  atrasado: "#dc2626",
  inactivo: "#94a3b8",
  sin_actividad: "#2563eb",
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
