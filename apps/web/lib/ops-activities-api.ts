import { buildApiUrl } from "@/lib/api-base";

export type ActivityDetail = {
  id: number;
  anNumber: string;
  titulo: string;
  descripcion?: string | null;
  indicaciones?: string | null;
  estatus: string;
  prioridad?: string | null;
  ticketType?: string | null;
  branchName?: string | null;
  branchAddress?: string | null;
  branchCity?: string | null;
  branchState?: string | null;
  fechaAsignacion?: string;
  fechaInicio?: string | null;
  fechaEntregaEsperada?: string | null;
  fechaFinalizacion?: string | null;
  responsable?: { id: number; nombre: string } | null;
  creador?: { id: number; nombre: string } | null;
  client?: { id: number; name: string } | null;
  activityEvidence?: {
    id: number;
    status?: string | null;
    reviewedAt?: string | null;
    reviewedBy?: { id: number; nombre: string } | null;
  } | null;
  evidencias?: Array<{ id: number; tipo?: string; descripcion?: string; url?: string }>;
};

export type ViaticoRow = {
  id: number;
  montoSolicitado: number | string;
  motivo?: string | null;
  estatus: string;
  fechaSolicitud?: string;
  actividadId?: number | null;
  User?: { nombre?: string };
};

async function apiFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

export function getActivity(token: string, id: number) {
  return apiFetch<ActivityDetail>(`activities/${id}`, token);
}

export async function listViaticsForActivity(token: string, activityId: number) {
  const data = await apiFetch<ViaticoRow[] | { data: ViaticoRow[] }>("viatics", token);
  const rows = Array.isArray(data) ? data : (data?.data ?? []);
  return rows.filter((v) => Number(v.actividadId) === activityId);
}
