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

export type TeamBoardUser = {
  id: number;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  puesto: string | null;
  status: BoardUserStatus;
  currentActivity: TeamBoardActivity | null;
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
  activo: "#22c55e",
  atrasado: "#ef4444",
  inactivo: "#94a3b8",
  sin_actividad: "#3b82f6",
};

export function fetchTeamBoard(token: string): Promise<TeamBoardResponse> {
  return erpFetch<TeamBoardResponse>("me/board", token);
}
