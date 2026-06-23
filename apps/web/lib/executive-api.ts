/**
 * NEXARA · Executive / Dashboard CEO — cliente API
 * ------------------------------------------------
 * Consume `apps/api/src/executive/executive.controller.ts → GET /executive/c-level`
 * y normaliza la respuesta para `(panels)/erp/executive/page.tsx`.
 *
 * El backend agrega en una sola llamada: ventas, finanzas, operación,
 * mantenimiento, compras, RH y top performers, además de las alertas
 * derivadas que se renderizan arriba del dashboard.
 */
import { buildApiUrl } from "@/lib/api-base";

export type ExecutiveAlert = {
  level: "critical" | "warning" | "info";
  icon: string;
  title: string;
  message: string;
};

export type ExecutiveDashboard = {
  generatedAt: string;
  headlineKpis: {
    revenueMtd: number;
    revenuePrevMonth: number;
    revenueMoMChange: number;
    revenueYtd: number;
    wonOppsMtd: number;
    pipelineValue: number;
    pipelineCount: number;
    cashOnHand: number;
    arOutstanding: number;
    apOutstanding: number;
    workingCapital: number;
  };
  sales: {
    hotLeads: number;
    tendersOpen: number;
    tendersWon: number;
  };
  operations: {
    activeProjects: number;
    otOpen: number;
    otOverdue: number;
    otCompletedMtd: number;
    ticketsOpen: number;
    ticketsClosedMtd: number;
  };
  finance: {
    invoicedMtd: number;
    invoicesCountMtd: number;
    overdueInvoices: number;
  };
  maintenance: {
    activeContracts: number;
    upcomingVisits: number;
  };
  procurement: {
    pendingRequisitions: number;
    pendingPOs: number;
    lowStockItems: number;
  };
  clientsCount: number;
  teamSize: number;
  topSellers: Array<{
    ownerId: number;
    ownerName: string;
    revenue: number;
    wonCount: number;
  }>;
  projectTypeBreakdown: Array<{ type: string; count: number }>;
  alerts: ExecutiveAlert[];
};

/**
 * Trae el snapshot completo C-Level. Requiere token JWT del usuario y permisos
 * de `CONSOLE_ADMIN`, `SALES_REPORTS_VIEW` o `CONTABILIDAD_VIEW` (CEO/dir.
 * operaciones / dir. admin / contabilidad cumplen).
 */
export async function fetchExecutiveDashboard(
  token: string,
): Promise<ExecutiveDashboard> {
  const res = await fetch(buildApiUrl("executive/c-level"), {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Executive API ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as ExecutiveDashboard;
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers de presentación — convierten alertas backend → cards UI.
 * ────────────────────────────────────────────────────────────────── */

export type ExecutiveCardAlert = {
  icon: string;
  title: string;
  desc: string;
  href: string;
  urgency: "danger" | "warning";
  cta: string;
};

const ALERT_ROUTING: Record<string, { href: string; cta: string }> = {
  "Revenue en caída": { href: "/erp/analytics/bi", cta: "Ver KPIs" },
  "Revenue en alza": { href: "/erp/analytics/bi", cta: "Ver KPIs" },
  "OT vencidas": { href: "/ops/activities", cta: "Ir a OT" },
  "Facturas vencidas": { href: "/erp/invoicing", cta: "Cobrar" },
  "Stock bajo": { href: "/erp/warehouse", cta: "Ver stock" },
  "Leads calientes": { href: "/crm/leads", cta: "Atender" },
  "Visitas próximas": { href: "/ops/maintenance/contracts", cta: "Agenda" },
};

export function alertsToCards(alerts: ExecutiveAlert[]): ExecutiveCardAlert[] {
  return alerts.map((a) => {
    const routing = ALERT_ROUTING[a.title] ?? { href: "/erp/dashboard", cta: "Abrir" };
    const urgency: "danger" | "warning" = a.level === "critical" ? "danger" : "warning";
    return {
      icon: a.icon,
      title: a.title,
      desc: a.message,
      href: routing.href,
      cta: routing.cta,
      urgency,
    };
  });
}
