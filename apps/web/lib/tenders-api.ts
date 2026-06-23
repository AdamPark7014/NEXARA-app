import { buildApiUrl } from "@/lib/api-base";

export type TenderType = "PUBLIC_GOV" | "PRIVATE" | "INVITATION" | "CONSOLIDATED";
export type TenderStatus =
  | "PROSPECT"
  | "IN_REVIEW"
  | "PREPARING_BID"
  | "SUBMITTED"
  | "AWARDED"
  | "LOST"
  | "CANCELLED"
  | "DISQUALIFIED";

export type Tender = {
  id: number;
  tenderNumber: string;
  title: string;
  description?: string | null;
  tenderType: TenderType;
  status: TenderStatus;
  conveningEntity: string;
  conveningContact?: string | null;
  conveningEmail?: string | null;
  conveningPhone?: string | null;
  publicationUrl?: string | null;
  externalReference?: string | null;
  budgetCeiling: string | number;
  ourBidAmount: string | number;
  estimatedCost: string | number;
  expectedMargin: string | number;
  guaranteeAmount: string | number;
  currency: string;
  publishDate?: string | null;
  questionsDeadline?: string | null;
  submissionDeadline?: string | null;
  openingDate?: string | null;
  awardDate?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  scope?: string | null;
  technicalRequirements?: string | null;
  legalRequirements?: string | null;
  awardedToCompetitor?: string | null;
  awardNotes?: string | null;
  owner?: { id: number; nombre: string } | null;
  opportunity?: { id: number; title: string; stage: string; value?: string | number } | null;
  documents?: Array<{
    id: number;
    documentType: string;
    name: string;
    url?: string | null;
    notes?: string | null;
    createdAt: string;
  }>;
  events?: Array<{ id: number; eventName: string; description?: string | null; occursAt: string }>;
  _count?: { documents: number; events: number };
};

export type TenderDashboard = {
  byStatus: Array<{ status: TenderStatus; count: number; value: number }>;
  byType: Array<{ tenderType: TenderType; count: number; value: number }>;
  activePipelineValue: number;
  activeExpectedMargin: number;
  winRate: number;
  upcoming: Array<{
    id: number;
    tenderNumber: string;
    title: string;
    conveningEntity: string;
    submissionDeadline: string | null;
    ourBidAmount: string | number;
    status: TenderStatus;
  }>;
};

const request = async (token: string | undefined, path: string, init: RequestInit = {}) => {
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(buildApiUrl(path), { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  return text ? JSON.parse(text) : null;
};

export const getTenders = (token: string, filters?: { status?: string; tenderType?: string; ownerId?: number }): Promise<Tender[]> => {
  const qs = new URLSearchParams();
  if (filters?.status) qs.set("status", filters.status);
  if (filters?.tenderType) qs.set("tenderType", filters.tenderType);
  if (filters?.ownerId) qs.set("ownerId", String(filters.ownerId));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(token, `tenders${suffix}`);
};

export const getTender = (token: string, id: number): Promise<Tender> => request(token, `tenders/${id}`);

export const getTenderDashboard = (token: string): Promise<TenderDashboard> => request(token, "tenders/dashboard");

export const createTender = (token: string, payload: any): Promise<Tender> =>
  request(token, "tenders", { method: "POST", body: JSON.stringify(payload) });

export const updateTender = (token: string, id: number, payload: any): Promise<Tender> =>
  request(token, `tenders/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const setTenderStatus = (
  token: string,
  id: number,
  status: TenderStatus,
  extras?: { awardedToCompetitor?: string; awardNotes?: string },
): Promise<Tender> =>
  request(token, `tenders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...extras }),
  });

export const promoteTenderToOpportunity = (token: string, id: number) =>
  request(token, `tenders/${id}/promote-opportunity`, { method: "POST", body: "{}" });

export const addTenderDocument = (token: string, id: number, payload: any) =>
  request(token, `tenders/${id}/documents`, { method: "POST", body: JSON.stringify(payload) });

export const TENDER_TYPE_LABEL: Record<TenderType, string> = {
  PUBLIC_GOV: "Gobierno",
  PRIVATE: "Privada",
  INVITATION: "Invitación",
  CONSOLIDATED: "Consolidada",
};

export const TENDER_STATUS_LABEL: Record<TenderStatus, string> = {
  PROSPECT: "Prospecto",
  IN_REVIEW: "En revisión",
  PREPARING_BID: "Preparando propuesta",
  SUBMITTED: "Presentada",
  AWARDED: "Adjudicada",
  LOST: "No adjudicada",
  CANCELLED: "Cancelada",
  DISQUALIFIED: "Descalificada",
};

export const TENDER_STATUS_COLOR: Record<TenderStatus, string> = {
  PROSPECT: "#6b7280",
  IN_REVIEW: "#3b82f6",
  PREPARING_BID: "#f59e0b",
  SUBMITTED: "#8b5cf6",
  AWARDED: "#16a34a",
  LOST: "#dc2626",
  CANCELLED: "#6b7280",
  DISQUALIFIED: "#b91c1c",
};
