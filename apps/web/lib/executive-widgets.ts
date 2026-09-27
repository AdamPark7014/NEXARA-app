import type { CommandWidget } from "@/components/command-center/CommandCenterRail";

export type ExecutiveDashboardSnapshot = {
  operations?: {
    otOverdue?: number;
    otOpen?: number;
    ticketsOpen?: number;
  };
  finance?: {
    overdueInvoices?: number;
  };
  procurement?: {
    pendingRequisitions?: number;
    pendingPOs?: number;
    lowStockItems?: number;
  };
  sales?: {
    hotLeads?: number;
    tendersOpen?: number;
  };
  alerts?: Array<{ level: string; title: string }>;
};

const count = (n: number, one: string, many: string) => `${n.toLocaleString("es-MX")} ${n === 1 ? one : many}`;

/** Accesos que solo aparecen cuando algo del snapshot ejecutivo requiere atención. */
export function buildExecutiveDynamicWidgets(
  data: ExecutiveDashboardSnapshot | null | undefined,
): CommandWidget[] {
  if (!data) return [];

  const widgets: CommandWidget[] = [];
  const otOverdue = data.operations?.otOverdue ?? 0;
  const tickets = data.operations?.ticketsOpen ?? 0;
  const overdueInvoices = data.finance?.overdueInvoices ?? 0;
  const requisitions = data.procurement?.pendingRequisitions ?? 0;
  const lowStock = data.procurement?.lowStockItems ?? 0;
  const hotLeads = data.sales?.hotLeads ?? 0;
  const critical = (data.alerts ?? []).filter((a) => a.level === "critical").length;

  if (critical > 0) {
    widgets.push({ id: "dyn-alerts", label: count(critical, "alerta crítica", "alertas críticas"), href: "/erp/notifications-center", icon: "🚨", alert: true });
  }
  if (otOverdue > 0) {
    widgets.push({ id: "dyn-ot-overdue", label: count(otOverdue, "orden de trabajo vencida", "órdenes de trabajo vencidas"), href: "/erp/pizarra", icon: "⚠️", alert: true });
  }
  if (overdueInvoices > 0) {
    widgets.push({ id: "dyn-ar-overdue", label: count(overdueInvoices, "factura vencida", "facturas vencidas"), href: "/erp/invoicing", icon: "💳", alert: true });
  }
  if (tickets > 5) {
    widgets.push({ id: "dyn-tickets", label: count(tickets, "ticket abierto", "tickets abiertos"), href: "/erp/notifications-center", icon: "🎫" });
  }
  if (requisitions > 0) {
    widgets.push({ id: "dyn-req", label: count(requisitions, "requisición por revisar", "requisiciones por revisar"), href: "/erp/procurement", icon: "📦" });
  }
  if (lowStock > 0) {
    widgets.push({ id: "dyn-stock", label: count(lowStock, "producto bajo mínimo", "productos bajo mínimo"), href: "/erp/warehouse", icon: "📉" });
  }
  if (hotLeads >= 3) {
    widgets.push({ id: "dyn-leads", label: count(hotLeads, "prospecto caliente", "prospectos calientes"), href: "/erp/cotizaciones", icon: "🔥" });
  }

  return widgets;
}

export type ExecutiveBiDrillLink = {
  id: string;
  label: string;
  href: string;
  desc: string;
};

/** Enlaces para profundizar desde la vista ejecutiva hacia Analítica. */
export function buildExecutiveBiDrillLinks(
  data: ExecutiveDashboardSnapshot | null | undefined,
  headline?: { revenueMoMChange?: number; pipelineValue?: number },
): ExecutiveBiDrillLink[] {
  const links: ExecutiveBiDrillLink[] = [
    {
      id: "bi-intelligence",
      label: "Hallazgos y recomendaciones",
      href: "/erp/analytics/bi?section=intelligence",
      desc: "Qué pasa, por qué y qué hacer",
    },
    {
      id: "bi-margins",
      label: "Margen por línea de negocio",
      href: "/erp/analytics/bi?section=margins",
      desc: "Presupuesto contra costo real",
    },
  ];

  if (!data) return links;

  const mom = headline?.revenueMoMChange ?? 0;
  if (mom < 0) {
    links.unshift({
      id: "bi-margins-alert",
      label: `Ingresos ${mom}% vs mes anterior`,
      href: "/erp/analytics/bi?section=margins",
      desc: "Revisa márgenes y causas",
    });
  }

  if ((data.operations?.otOverdue ?? 0) > 0 || (data.operations?.otOpen ?? 0) > 10) {
    links.push({
      id: "bi-engineers",
      label: "Productividad de ingenieros",
      href: "/erp/analytics/bi?section=engineers",
      desc: "Órdenes cerradas y tiempos",
    });
  }

  if ((data.procurement?.lowStockItems ?? 0) > 0) {
    links.push({
      id: "bi-clients",
      label: "Rentabilidad por cliente",
      href: "/erp/analytics/bi?section=clients",
      desc: "Qué clientes dejan más margen",
    });
  }

  if ((headline?.pipelineValue ?? 0) > 0) {
    links.push({
      id: "bi-pipeline",
      label: "Cotizaciones en curso",
      href: "/erp/cotizaciones",
      desc: "Oportunidades abiertas",
    });
  }

  return links.slice(0, 6);
}
