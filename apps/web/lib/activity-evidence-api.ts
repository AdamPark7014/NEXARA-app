import { buildApiUrl } from "@/lib/api-base";

export type EvidenceReviewRow = {
  id: number;
  estatus: string;
  aprobada: boolean;
  fechaEvidencia?: string | null;
  revisadoEn?: string | null;
  completedAt?: string | null;
  actividad: {
    id: number;
    anNumber: string;
    titulo?: string;
    branchName?: string | null;
    branchCity?: string | null;
    responsable?: { nombre: string } | null;
    creador?: { nombre: string } | null;
  };
  user?: { nombre: string } | null;
  aprobadoPor?: { nombre: string } | null;
};

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

export function listEvidenceReviewHistory(token: string) {
  return apiFetch<EvidenceReviewRow[]>("activity-evidence/review-history", token);
}

export function evidenceStatusVariant(estatus: string): "positive" | "warning" | "neutral" | "danger" {
  const s = estatus.toLowerCase();
  if (s.includes("aprob")) return "positive";
  if (s.includes("rechaz")) return "danger";
  if (s.includes("pend")) return "warning";
  return "neutral";
}
