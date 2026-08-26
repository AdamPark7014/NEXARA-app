/**
 * NEXARA · Customer 360 snapshot (CRM + OPS + finanzas)
 */
import { apiRequest, parseResponseJson } from "@/lib/api-base";

export type ClientSnapshotStats = {
  branches: number;
  activities: number;
  operationalProjects: number;
  maintenanceContracts: number;
  ticketRequests: number;
  activitiesLast90d: number;
  activitiesOpen: number;
  opportunitiesOpen: number;
  pipelineValue: number;
  activeContracts: number;
  monthlyContractRevenue: number;
  pendingInvoices: number;
  totalSalesProjects: number;
};

export type ClientSnapshot = {
  salesClient: Record<string, unknown>;
  linked: boolean;
  client?: Record<string, unknown> | null;
  stats: ClientSnapshotStats;
  activities: Array<Record<string, unknown>>;
  operationalProjects: Array<Record<string, unknown>>;
  salesProjects: Array<Record<string, unknown>>;
  maintenanceContracts: Array<Record<string, unknown>>;
  ticketRequests: Array<Record<string, unknown>>;
  quotes: Array<Record<string, unknown>>;
  opportunities: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
};

export async function fetchSalesClientSnapshot(token: string, salesClientId: number): Promise<ClientSnapshot> {
  const res = await apiRequest(`ventas/clientes/${salesClientId}/snapshot`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Snapshot falló (${res.status})`);
  }
  const data = await parseResponseJson<ClientSnapshot>(res);
  if (!data) throw new Error("Respuesta vacía del servidor");
  return data;
}

export type HealthTier = "HEALTHY" | "AT_RISK" | "CRITICAL";

export function computeClientHealth(stats: ClientSnapshotStats, status?: string | null): {
  tier: HealthTier;
  score: number;
  label: string;
} {
  let score = 100;
  if (status === "Inactivo" || status === "INACTIVE") score -= 25;
  if (stats.activitiesOpen > 3) score -= 10;
  if (stats.pendingInvoices > 0) score -= 15;
  if (stats.ticketRequests > 2) score -= 10;
  if (stats.opportunitiesOpen === 0 && stats.totalSalesProjects === 0) score -= 5;

  if (score >= 75) return { tier: "HEALTHY", score, label: "Saludable" };
  if (score >= 50) return { tier: "AT_RISK", score, label: "En riesgo" };
  return { tier: "CRITICAL", score, label: "Crítico" };
}
