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
      "Control de producción en tiempo real",
      "Trazabilidad de órdenes y materiales",
      "Reducción de tiempo muerto operativo",
    ],
  },
  {
    slug: "seguridad-electronica",
    name: "Seguridad electrónica",
    painPoint: "Instalaciones vulnerables, sin monitoreo en tiempo real ni registros de acceso confiables.",
    outcomes: [
      "Cobertura de videovigilancia completa en sitio",
      "Acceso a grabaciones 24/7 desde cualquier dispositivo",
      "Mayor disuasión y respuesta ante incidentes",
    ],
  },
  {
    slug: "pymes-y-startups",
    name: "PyMEs y startups",
    painPoint: "Operaciones limitadas por tecnología desactualizada y sin soporte especializado.",
    outcomes: [
      "Infraestructura robusta desde el primer día",
      "Soporte técnico claro y sin sorpresas",
      "Escalabilidad tecnológica para crecer sin fricción",
    ],
  },
  {
    slug: "logistica",
    name: "Logística y distribución",
    painPoint: "Entregas tardías, visibilidad limitada y costos de operación variables.",
    outcomes: [
      "Seguimiento de rutas e incidencias",
      "Tableros de cumplimiento por zona",
      "Mejor control de inventario en movimiento",
    ],
  },
  {
    slug: "retail",
    name: "Retail y puntos de venta",
    painPoint: "Operación multisucursal con datos fragmentados y reposición ineficiente.",
    outcomes: [
      "Consolidación de ventas y stock",
      "Alertas de quiebre de inventario",
      "Estándares operativos por sucursal",
    ],
  },
  {
    slug: "salud",
    name: "Salud",
    painPoint: "Procesos críticos que exigen continuidad, seguridad y cumplimiento.",
    outcomes: [
      "Operación estable para atención continua",
      "Mayor control de activos críticos",
      "Menor riesgo de interrupciones tecnológicas",
    ],
  },
  {
    slug: "gobierno",
    name: "Gobierno",
    painPoint: "Necesidad de transparencia, continuidad y estandarización operativa.",
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
    summary: "Integración de procesos operativos, administrativos y de control en una sola plataforma.",
    deliverables: [
      "Mapa de procesos por área",
      "Implementación por fases con KPI",
      "Tableros de control para dirección",
    ],
  },
  {
    slug: "camaras-cctv",
    name: "Cámaras CCTV e IP",
    summary: "Diseño, instalación y puesta en marcha de sistemas de videovigilancia IP y analógica HD para empresas.",
    deliverables: [
      "Estudio de sitio y plano de cobertura",
      "Instalación de cámaras IP/HD interior y exterior",
      "Configuración de NVR/DVR y acceso remoto 24/7",
    ],
  },
  {
    slug: "equipo-de-computo",
    name: "Equipo de cómputo",
    summary: "Venta, renta, mantenimiento y soporte de equipo de cómputo para empresas y oficinas.",
    deliverables: [
      "Diagnóstico del parque tecnológico actual",
      "Propuesta de renovación o renta de equipos",
      "Mantenimiento preventivo y correctivo programado",
    ],
  },
  {
    slug: "redes-y-conectividad",
    name: "Redes y Wi‑Fi empresarial",
    summary: "Diseño e instalación de infraestructura de red: cableado estructurado, Wi‑Fi y conectividad WAN.",
    deliverables: [
      "Plano de distribución de red y site survey",
      "Instalación de cableado Cat6/Cat6A y equipos activos",
      "Configuración, pruebas de rendimiento y entrega documentada",
    ],
  },
  {
    slug: "soporte-ti-pyme",
    name: "Soporte TI para PyMEs",
    summary: "Mesa de ayuda, soporte en sitio y gestión de activos tecnológicos para pequeñas y medianas empresas.",
    deliverables: [
      "Catálogo de servicios y SLA definidos",
      "Atención remota y visitas programadas en sitio",
      "Reportes mensuales de estado tecnológico",
    ],
  },
  {
    slug: "ciberseguridad-empresas",
    name: "Ciberseguridad empresarial",
    summary: "Protección de infraestructura, datos y continuidad para operaciones de alta demanda.",
    deliverables: [
      "Diagnóstico de riesgo y brechas",
      "Controles de acceso y hardening",
      "Monitoreo y respuesta a incidentes",
    ],
  },
  {
    slug: "infraestructura-ti",
    name: "Infraestructura TI",
    summary: "Arquitectura, modernización y soporte de infraestructura tecnológica crítica.",
    deliverables: [
      "Arquitectura objetivo y hoja de ruta",
      "Implementación de redes y servidores",
      "Operación y mantenimiento continuo",
    ],
  },
  {
    slug: "mesa-de-ayuda-ti",
    name: "Mesa de ayuda TI",
    summary: "Soporte especializado para asegurar tiempos de respuesta y continuidad operativa.",
    deliverables: [
      "SLA y flujos de escalamiento",
      "Catálogo de servicio por prioridad",
      "Reportes de desempeño por periodo",
    ],
  },
  {
    slug: "automatizacion-de-procesos",
    name: "Automatización de procesos",
    summary: "Digitalización de tareas repetitivas para acelerar la operación y reducir errores.",
    deliverables: [
      "Identificación de cuellos de botella",
      "Flujos automatizados por área",
      "Métricas de eficiencia por proceso",
    ],
  },
  {
    slug: "servicios-gestionados-ti",
    name: "Servicios gestionados TI",
    summary: "Modelo operativo continuo para administrar tecnología de forma predecible y escalable.",
    deliverables: [
      "Monitoreo proactivo 24/7",
      "Mantenimiento preventivo planificado",
      "Comités de seguimiento ejecutivo",
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
