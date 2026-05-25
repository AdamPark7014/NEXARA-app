import { buildApiUrl } from "@/lib/api-base";

export type CrmActivityType = "CALL" | "EMAIL" | "MEETING" | "TASK" | "WHATSAPP" | "VISIT" | "NOTE";
export type CrmActivityStatus = "PENDING" | "COMPLETED" | "CANCELLED" | "OVERDUE";

export type CrmActivity = {
  id: number;
  activityType: CrmActivityType;
  status: CrmActivityStatus;
  subject: string;
  description?: string | null;
  dueDate: string;
  completedAt?: string | null;
  outcome?: string | null;
  leadId?: number | null;
  opportunityId?: number | null;
  tenderId?: number | null;
  ownerId?: number | null;
  owner?: { id: number; nombre: string } | null;
  lead?: { id: number; name?: string | null; company?: string | null } | null;
  opportunity?: { id: number; title: string; stage: string; value?: number } | null;
  tender?: { id: number; tenderNumber: string; title?: string } | null;
  createdAt: string;
};

export type AgendaPayload = {
  pendingToday: CrmActivity[];
  overdue: CrmActivity[];
  upcoming: CrmActivity[];
  recentlyCompleted: CrmActivity[];
  countersByType: Array<{ type: CrmActivityType; count: number }>;
};

const req = async (token: string | undefined, path: string, init: RequestInit = {}) => {
  const headers: Record<string, string> = { ...(init.headers as any) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(buildApiUrl(path), { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  return text ? JSON.parse(text) : null;
};

export const listCrmActivities = (token: string, filters?: any): Promise<CrmActivity[]> => {
  const qs = new URLSearchParams();
  Object.entries(filters || {}).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)));
  return req(token, `crm-activities${qs.toString() ? `?${qs.toString()}` : ""}`);
};

export const getMyAgenda = (token: string): Promise<AgendaPayload> =>
  req(token, `crm-activities/my-agenda`);

export const createCrmActivity = (token: string, payload: any): Promise<CrmActivity> =>
  req(token, `crm-activities`, { method: "POST", body: JSON.stringify(payload) });

export const completeCrmActivity = (token: string, id: number, outcome?: string) =>
  req(token, `crm-activities/${id}/complete`, { method: "PATCH", body: JSON.stringify({ outcome }) });

export const updateCrmActivity = (token: string, id: number, payload: any) =>
  req(token, `crm-activities/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const deleteCrmActivity = (token: string, id: number) =>
  req(token, `crm-activities/${id}`, { method: "DELETE" });

export const ACTIVITY_TYPE_LABEL: Record<CrmActivityType, string> = {
  CALL: "📞 Llamada",
  EMAIL: "📧 Email",
  MEETING: "🤝 Reunión",
  TASK: "✅ Tarea",
  WHATSAPP: "💬 WhatsApp",
  VISIT: "🚗 Visita",
  NOTE: "📝 Nota",
};

export const ACTIVITY_STATUS_COLOR: Record<CrmActivityStatus, string> = {
  PENDING: "#3b82f6",
  COMPLETED: "#16a34a",
  CANCELLED: "#6b7280",
  OVERDUE: "#dc2626",
};
