export type IndustryLanding = {
  slug: string;
  name: string;
  painPoint: string;
  outcomes: string[];
};

export type ServiceLanding = {
  slug: string;
  name: string;
  summary: string;
  deliverables: string[];
};

export const INDUSTRY_LANDINGS: IndustryLanding[] = [
  {
    slug: "manufactura",
    name: "Manufactura",
    painPoint: "Paros operativos, baja trazabilidad y costos ocultos por procesos desconectados.",
    outcomes: [
      "Control de produccion en tiempo real",
      "Trazabilidad de ordenes y materiales",
      "Reduccion de tiempo muerto operativo",
    ],
  },
  {
    slug: "logistica",
    name: "Logistica y distribucion",
    painPoint: "Entregas tardias, visibilidad limitada y costos de operacion variables.",
    outcomes: [
      "Seguimiento de rutas e incidencias",
      "Tableros de cumplimiento por zona",
      "Mejor control de inventario en movimiento",
    ],
  },
  {
    slug: "retail",
    name: "Retail y puntos de venta",
    painPoint: "Operacion multi-sucursal con datos fragmentados y reposicion ineficiente.",
    outcomes: [
      "Consolidacion de ventas y stock",
      "Alertas de quiebre de inventario",
      "Estandares operativos por sucursal",
    ],
  },
  {
    slug: "salud",
    name: "Salud",
    painPoint: "Procesos criticos que exigen continuidad, seguridad y cumplimiento.",
    outcomes: [
      "Operacion estable para atencion continua",
      "Mayor control de activos criticos",
      "Menor riesgo de interrupciones tecnologicas",
    ],
  },
  {
    slug: "gobierno",
    name: "Gobierno",
    painPoint: "Necesidad de transparencia, continuidad y estandarizacion operativa.",
    outcomes: [
      "Tableros ejecutivos de seguimiento",
      "Control de procesos y evidencia",
      "Mejora en tiempos de respuesta institucional",
    ],
  },
  {
    slug: "servicios",
    name: "Empresas de servicios",
    painPoint: "Dificultad para escalar operaciones con control de calidad y SLA.",
    outcomes: [
      "Monitoreo de cumplimiento por equipo",
      "Mejor trazabilidad de tickets y tareas",
      "Mayor capacidad de crecimiento operativo",
    ],
  },
];

export const SERVICE_LANDINGS: ServiceLanding[] = [
  {
    slug: "erp-industrial",
    name: "ERP industrial",
    summary: "Integracion de procesos operativos, administrativos y de control en una sola plataforma.",
    deliverables: [
      "Mapa de procesos por area",
      "Implementacion por fases con KPI",
      "Tableros de control para direccion",
    ],
  },
  {
    slug: "ciberseguridad-empresas",
    name: "Ciberseguridad empresarial",
    summary: "Proteccion de infraestructura, datos y continuidad para operaciones de alta demanda.",
    deliverables: [
      "Diagnostico de riesgo y brechas",
      "Controles de acceso y hardening",
      "Monitoreo y respuesta a incidentes",
    ],
  },
  {
    slug: "infraestructura-ti",
    name: "Infraestructura TI",
    summary: "Arquitectura, modernizacion y soporte de infraestructura tecnologica critica.",
    deliverables: [
      "Arquitectura objetivo y roadmap",
      "Implementacion de redes y servidores",
      "Operacion y mantenimiento continuo",
    ],
  },
  {
    slug: "mesa-de-ayuda-ti",
    name: "Mesa de ayuda TI",
    summary: "Soporte especializado para asegurar tiempos de respuesta y continuidad operativa.",
    deliverables: [
      "SLA y flujos de escalamiento",
      "Catalogo de servicio por prioridad",
      "Reportes de desempeno por periodo",
    ],
  },
  {
    slug: "automatizacion-de-procesos",
    name: "Automatizacion de procesos",
    summary: "Digitalizacion de tareas repetitivas para acelerar operacion y reducir errores.",
    deliverables: [
      "Identificacion de cuellos de botella",
      "Flujos automatizados por area",
      "Metricas de eficiencia por proceso",
    ],
  },
  {
    slug: "servicios-gestionados-ti",
    name: "Servicios gestionados TI",
    summary: "Modelo operativo continuo para administrar tecnologia de forma predecible y escalable.",
    deliverables: [
      "Monitoreo proactivo 24/7",
      "Mantenimiento preventivo planificado",
      "Comites de seguimiento ejecutivo",
    ],
  },
];

export type LandingCombination = {
  industry: IndustryLanding;
  service: ServiceLanding;
};

export const getProgrammaticLandings = (): LandingCombination[] => {
  const result: LandingCombination[] = [];

  for (const industry of INDUSTRY_LANDINGS) {
    for (const service of SERVICE_LANDINGS) {
      result.push({ industry, service });
    }
  }

  return result;
};

export const findIndustryLanding = (slug: string) =>
  INDUSTRY_LANDINGS.find((item) => item.slug === slug);

export const findServiceLanding = (slug: string) =>
  SERVICE_LANDINGS.find((item) => item.slug === slug);
