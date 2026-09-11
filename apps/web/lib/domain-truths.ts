export type DomainTruth = {
  canonical: string;
  alternate: string;
};

/** Una verdad por dominio — canónico vs legacy/avanzado (capacitación). */
export const DOMAIN_TRUTHS: DomainTruth[] = [
  {
    canonical: 'Almacén (ERP) = stock físico',
    alternate: 'CRM › Catálogo = oferta comercial (precios/SKUs, sin stock)',
  },
  {
    canonical: 'Integra = accesos de oficinas',
    alternate: 'Menú facilities-access = legacy / avanzado',
  },
  {
    canonical: 'Reuniones = operativa',
    alternate: 'Calendario = avanzado / legacy',
  },
  {
    canonical: 'Clientes = CRM',
    alternate: 'ops-service-clients = avanzado',
  },
  {
    canonical: 'Multas / incidencias = RRHH',
    alternate: 'Asistencia / comidas = Operaciones corporativas',
  },
];