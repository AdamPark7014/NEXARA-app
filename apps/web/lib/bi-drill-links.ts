/** Enlaces desde las recomendaciones de Analítica hacia los módulos donde se actúa. */
export function biRecommendationHref(action: string): string | null {
  const a = action.toLowerCase();
  if (/sla|ot\b|despacho|cuadrilla/.test(a)) return '/erp/pizarra';
  if (/factura|cobro|moros|vencid/.test(a)) return '/erp/invoicing';
  if (/stock|inventario|almacén/.test(a)) return '/erp/warehouse';
  if (/pipeline|oportunidad|venta/.test(a)) return '/erp/cotizaciones';
  if (/cliente|cuenta|roi/.test(a)) return '/erp/clientes';
  if (/proyecto|margen|presupuesto/.test(a)) return '/erp/proyectos';
  if (/ingeniero|técnico|campo/.test(a)) return '/erp/hr';
  return null;
}

export type BiQuickLink = { href: string; label: string; desc: string };

/** Accesos a otros módulos desde el tablero de Analítica. */
export function buildBiQuickLinks(opts?: {
  topClientId?: number | null;
  hasSlaRisk?: boolean;
}): BiQuickLink[] {
  const links: BiQuickLink[] = [
    { href: '/erp/executive', label: 'Vista ejecutiva', desc: 'Indicadores clave del negocio' },
    { href: '/erp/cotizaciones', label: 'Cotizaciones', desc: 'Oportunidades abiertas' },
  ];

  if (opts?.topClientId) {
    links.unshift({
      href: `/erp/clientes/${opts.topClientId}`,
      label: 'Cliente más rentable',
      desc: 'Ficha completa del cliente',
    });
  }

  if (opts?.hasSlaRisk) {
    links.push({
      href: '/erp/pizarra',
      label: 'Actividades del equipo',
      desc: 'Órdenes atrasadas en campo',
    });
  }

  return links;
}
