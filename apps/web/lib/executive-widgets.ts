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

/** Widgets dinámicos derivados del snapshot ejecutivo (alertas operativas). */
export function buildExecutiveDynamicWidgets(
  data: ExecutiveDashboardSnapshot | null | undefined,
): CommandWidget[] {
  if (!data) return [];

  const widgets: CommandWidget[] = [];
  const ops = data.operations;
  const fin = data.finance;
  const proc = data.procurement;
  const sales = data.sales;

  if ((ops?.otOverdue ?? 0) > 0) {
    widgets.push({
      id: "dyn-ot-overdue",
      label: `${ops!.otOverdue} OT vencidas`,
      href: "/ops/dispatch",
      icon: "⚠️",
      hint: "Centro de despacho",
    });
  }
  if ((ops?.ticketsOpen ?? 0) > 5) {
    widgets.push({
      id: "dyn-tickets",
      label: `${ops!.ticketsOpen} tickets abiertos`,
      href: "/ops/support",
      icon: "🎫",
      hint: "Bandeja de soporte",
    });
  }
  if ((fin?.overdueInvoices ?? 0) > 0) {
    widgets.push({
      id: "dyn-ar-overdue",
      label: `${fin!.overdueInvoices} facturas vencidas`,
      href: "/erp/invoicing",
      icon: "💳",
      hint: "Cobranza",
    });
  }
  if ((proc?.pendingRequisitions ?? 0) > 0) {
    widgets.push({
      id: "dyn-req",
      label: `${proc!.pendingRequisitions} requisiciones`,
      href: "/erp/procurement",
      icon: "📦",
      hint: "Compras",
    });
  }
  if ((proc?.lowStockItems ?? 0) > 0) {
    widgets.push({
      id: "dyn-stock",
      label: `${proc!.lowStockItems} SKUs críticos`,
      href: "/erp/warehouse",
      icon: "📉",
      hint: "Almacén",
    });
  }
  if ((sales?.hotLeads ?? 0) >= 3) {
    widgets.push({
      id: "dyn-leads",
      label: `${sales!.hotLeads} leads calientes`,
      href: "/crm/leads",
      icon: "🔥",
      hint: "Pipeline comercial",
    });
  }

  const critical = (data.alerts ?? []).filter((a) => a.level === "critical").length;
  if (critical > 0) {
    widgets.push({
      id: "dyn-alerts",
      label: `${critical} alertas críticas`,
      href: "/erp/notifications-center",
      icon: "🚨",
      hint: "Centro de notificaciones",
    });
  }

  return widgets;
}

export type ExecutiveBiDrillLink = {
  id: string;
  label: string;
  href: string;
  desc: string;
};

/** Enlaces de drill-down desde vista ejecutiva hacia BI. */
export function buildExecutiveBiDrillLinks(
  data: ExecutiveDashboardSnapshot | null | undefined,
  headline?: { revenueMoMChange?: number; pipelineValue?: number },
): ExecutiveBiDrillLink[] {
  const links: ExecutiveBiDrillLink[] = [
    {
      id: "bi-intelligence",
      label: "Inteligencia y recomendaciones",
      href: "/erp/analytics/bi?section=intelligence",
      desc: "Qué pasa, por qué y qué hacer",
    },
    {
      id: "bi-margins",
      label: "Margen por línea de negocio",
      href: "/erp/analytics/bi?section=margins",
      desc: "Presupuesto vs costo",
    },
  ];

  if (!data) return links;

  const mom = headline?.revenueMoMChange ?? 0;
  if (mom < 0) {
    links.unshift({
      id: "bi-margins-alert",
      label: `Ingresos ${mom}% vs mes anterior`,
      href: "/erp/analytics/bi?section=margins",
      desc: "Revisar márgenes y drivers",
    });
  }

  if ((data.operations?.otOverdue ?? 0) > 0 || (data.operations?.otOpen ?? 0) > 10) {
    links.push({
      id: "bi-engineers",
      label: "Eficiencia de ingenieros",
      href: "/erp/analytics/bi?section=engineers",
      desc: "Cierre de OT y tiempos",
    });
  }

  if ((data.procurement?.lowStockItems ?? 0) > 0) {
    links.push({
      id: "bi-clients",
      label: "ROI por cliente",
      href: "/erp/analytics/bi?section=clients",
      desc: "Drill-down a Customer 360",
    });
  }

  if ((headline?.pipelineValue ?? 0) > 0) {
    links.push({
      id: "bi-pipeline",
      label: "Pipeline y forecast",
      href: "/crm/pipeline",
      desc: "Oportunidades activas",
    });
  }

  return links.slice(0, 6);
}
