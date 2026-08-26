/** Enlaces de drill-down desde recomendaciones de inteligencia BI hacia módulos operativos. */
export function biRecommendationHref(action: string): string | null {
  const a = action.toLowerCase();
  if (/sla|ot\b|despacho|cuadrilla/.test(a)) return '/ops/dispatch';
  if (/factura|cobro|moros|vencid/.test(a)) return '/erp/invoicing';
  if (/stock|inventario|almacén/.test(a)) return '/erp/warehouse';
  if (/pipeline|oportunidad|venta/.test(a)) return '/crm/pipeline';
  if (/cliente|cuenta|roi/.test(a)) return '/crm/clients';
  if (/proyecto|margen|presupuesto/.test(a)) return '/crm/projects';
  if (/ingeniero|técnico|campo/.test(a)) return '/erp/hr';
  return null;
}

export type BiQuickLink = { href: string; label: string; desc: string };

/** Accesos rápidos en el tablero BI. */
export function buildBiQuickLinks(opts?: {
  topClientId?: number | null;
  hasSlaRisk?: boolean;
}): BiQuickLink[] {
  const links: BiQuickLink[] = [
    {
      href: '/erp/executive',
      label: 'Command Center',
      desc: 'Vista ejecutiva consolidada',
    },
    {
      href: '/erp/analytics/bi?section=intelligence',
      label: 'Inteligencia',
      desc: 'Qué pasa y qué hacer',
    },
    {
      href: '/erp/analytics/bi?section=margins',
      label: 'Márgenes',
      desc: 'Por línea de negocio',
    },
    {
      href: '/crm/pipeline',
      label: 'Pipeline',
      desc: 'Oportunidades abiertas',
    },
  ];

  if (opts?.topClientId) {
    links.unshift({
      href: `/crm/clients/${opts.topClientId}`,
      label: 'Top cliente ROI',
      desc: 'Customer 360',
    });
  }

  if (opts?.hasSlaRisk) {
    links.push({
      href: '/ops/dispatch',
      label: 'Centro de despacho',
      desc: 'OTs y SLA en campo',
    });
  }

  return links;
}
