/**
 * NEXARA — Mapa de módulos ERP tech-services.
 *
 * Single source of truth de cómo se interconectan los módulos. Se usa para:
 *  - Onboarding por rol (tour de bienvenida)
 *  - Documentación interna del propio sistema (vista /executive y /docs)
 *  - Validación de que cada módulo tenga un propósito claro
 *
 * Filosofía: cada módulo tiene UN propósito + entradas (qué recibe) +
 * salidas (qué genera) + dueños (roles responsables) + paneles donde vive.
 */

import { ORG_ROLE_KEYS, type OrgRoleKey, type PanelSlug } from "@/lib/org-roles";

export type ModuleId =
  | "crm"
  | "quotes"
  | "catalog"
  | "sales-projects"
  | "operational-projects"
  | "activities"
  | "evidences"
  | "viatics"
  | "vehicles"
  | "gps"
  | "warehouse"
  | "procurement"
  | "maintenance"
  | "noc"
  | "support"
  | "tickets"
  | "accounting"
  | "invoicing"
  | "banking"
  | "hr"
  | "attendance"
  | "documents"
  | "bi"
  | "web";

export type ModuleNode = {
  id: ModuleId;
  name: string;
  icon: string;
  purpose: string;
  /** Módulos que alimentan a este módulo. */
  inputs: ModuleId[];
  /** Módulos que reciben datos de este módulo. */
  outputs: ModuleId[];
  /** Roles principales responsables del módulo. */
  owners: OrgRoleKey[];
  /** Paneles donde se trabaja este módulo. */
  panels: PanelSlug[];
  /** Ejemplo concreto del cliente (Soriana, TOKS, Polos del Bienestar…). */
  example?: string;
};

/**
 * Flujo end-to-end tech-services (proyectos + servicios + productos):
 *
 *   crm → quotes → sales-projects → operational-projects → activities
 *                                                       ↓
 *                                                  evidences + viatics + vehicles
 *                                                       ↓
 *                                                  warehouse ← procurement
 *                                                       ↓
 *                                                  invoicing → banking
 *
 * Cross-cutting: noc, maintenance, support, tickets, hr, attendance, bi.
 */
export const MODULE_MAP: Record<ModuleId, ModuleNode> = {
  crm: {
    id: "crm",
    name: "CRM · Leads y oportunidades",
    icon: "🎯",
    purpose: "Pipeline comercial: capturar leads, calificar y mover oportunidades hasta cierre.",
    inputs: ["web"],
    outputs: ["quotes", "sales-projects", "bi"],
    owners: [
      ORG_ROLE_KEYS.SALES_REP,
      ORG_ROLE_KEYS.SALES_MANAGER,
      ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL,
    ],
    panels: ["ventas"],
    example: "Soriana levanta nueva sucursal en Querétaro → lead → oportunidad.",
  },
  quotes: {
    id: "quotes",
    name: "Cotizaciones",
    icon: "📝",
    purpose: "Documento formal con líneas vinculadas al catálogo (productos + servicios + mano de obra).",
    inputs: ["crm", "catalog"],
    outputs: ["sales-projects", "documents"],
    owners: [
      ORG_ROLE_KEYS.SALES_REP,
      ORG_ROLE_KEYS.SALES_MANAGER,
      ORG_ROLE_KEYS.SENIOR_ENGINEER,
    ],
    panels: ["ventas"],
    example: "Cotizar 128 cámaras + cableado estructurado + drone para Polos del Bienestar.",
  },
  catalog: {
    id: "catalog",
    name: "Catálogo de productos y servicios",
    icon: "📚",
    purpose: "Maestro de SKUs (equipos, refacciones, servicios, mano de obra) con precio y stock.",
    inputs: ["procurement", "warehouse"],
    outputs: ["quotes", "sales-projects", "operational-projects"],
    owners: [
      ORG_ROLE_KEYS.WAREHOUSE_MANAGER,
      ORG_ROLE_KEYS.PROCUREMENT_OFFICER,
      ORG_ROLE_KEYS.DESIGNER,
    ],
    panels: ["console", "ventas"],
    example: "Cámara Hikvision DS-2CD2143G2-I + bracket + 30m UTP cat6 + mano de obra.",
  },
  "sales-projects": {
    id: "sales-projects",
    name: "Proyectos de venta",
    icon: "📈",
    purpose: "Proyecto comercial cerrado, con presupuesto, margen planeado y orden de cierre.",
    inputs: ["quotes", "crm"],
    outputs: ["operational-projects", "invoicing", "bi"],
    owners: [
      ORG_ROLE_KEYS.SALES_MANAGER,
      ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL,
      ORG_ROLE_KEYS.PROJECT_MANAGER,
    ],
    panels: ["ventas"],
    example: "Proyecto cerrado: instalación CCTV multi-sitio Polos del Bienestar (12 polos).",
  },
  "operational-projects": {
    id: "operational-projects",
    name: "Proyectos operativos",
    icon: "🛠️",
    purpose: "Despliegue en campo del proyecto comercial: ingenieros, OT por sitio, materiales.",
    inputs: ["sales-projects", "catalog", "warehouse"],
    outputs: ["activities", "viatics", "evidences", "invoicing"],
    owners: [
      ORG_ROLE_KEYS.PROJECT_MANAGER,
      ORG_ROLE_KEYS.DIRECTOR_OPS,
      ORG_ROLE_KEYS.SENIOR_ENGINEER,
    ],
    panels: ["operacion"],
    example: "Convertir el proyecto Polos del Bienestar en 12 OTs (1 por polo) + asignación de cuadrillas.",
  },
  activities: {
    id: "activities",
    name: "Actividades / OT",
    icon: "📋",
    purpose: "Órdenes de trabajo individuales en sitio (instalación, mantenimiento, auditoría).",
    inputs: ["operational-projects", "maintenance", "tickets"],
    outputs: ["evidences", "viatics", "vehicles", "gps"],
    owners: [
      ORG_ROLE_KEYS.PROJECT_MANAGER,
      ORG_ROLE_KEYS.FIELD_ENGINEER,
      ORG_ROLE_KEYS.SENIOR_ENGINEER,
    ],
    panels: ["operacion"],
    example: "OT 'Cambio de cabezal de impresora' para TOKS sucursal Centro Histórico.",
  },
  evidences: {
    id: "evidences",
    name: "Evidencias de servicio",
    icon: "📸",
    purpose: "Fotos, hojas de servicio y firma del cliente que prueban el trabajo terminado.",
    inputs: ["activities"],
    outputs: ["invoicing", "tickets", "bi"],
    owners: [
      ORG_ROLE_KEYS.FIELD_ENGINEER,
      ORG_ROLE_KEYS.SENIOR_ENGINEER,
      ORG_ROLE_KEYS.PROJECT_MANAGER,
    ],
    panels: ["operacion"],
  },
  viatics: {
    id: "viatics",
    name: "Viáticos",
    icon: "💸",
    purpose: "Gastos de campo (combustible, comidas, peajes) ligados a OT/proyecto.",
    inputs: ["activities", "operational-projects"],
    outputs: ["sales-projects", "accounting"],
    owners: [
      ORG_ROLE_KEYS.FIELD_ENGINEER,
      ORG_ROLE_KEYS.PROJECT_MANAGER,
      ORG_ROLE_KEYS.ACCOUNTANT,
    ],
    panels: ["operacion", "contabilidad"],
  },
  vehicles: {
    id: "vehicles",
    name: "Vehículos",
    icon: "🚙",
    purpose: "Solicitud, asignación y entrega de vehículos por proyecto/OT.",
    inputs: ["activities"],
    outputs: ["gps", "documents"],
    owners: [
      ORG_ROLE_KEYS.FIELD_ENGINEER,
      ORG_ROLE_KEYS.PROJECT_MANAGER,
      ORG_ROLE_KEYS.ADMIN_STAFF,
    ],
    panels: ["operacion"],
  },
  gps: {
    id: "gps",
    name: "GPS · Rastreo en campo",
    icon: "📍",
    purpose: "Geolocalización en vivo y bitácora de rutas durante OT.",
    inputs: ["vehicles", "activities"],
    outputs: ["bi"],
    owners: [ORG_ROLE_KEYS.DIRECTOR_OPS, ORG_ROLE_KEYS.PROJECT_MANAGER],
    panels: ["operacion", "noc"],
  },
  warehouse: {
    id: "warehouse",
    name: "Almacén / Stock",
    icon: "📦",
    purpose: "Recepción, stock y despacho de equipos por OT o stock mínimo.",
    inputs: ["procurement"],
    outputs: ["catalog", "operational-projects", "activities"],
    owners: [ORG_ROLE_KEYS.WAREHOUSE_MANAGER],
    panels: ["console", "operacion"],
    example: "Despachar 128 cámaras + 4 km de UTP para arranque de Polos del Bienestar.",
  },
  procurement: {
    id: "procurement",
    name: "Compras",
    icon: "🛒",
    purpose: "Requisiciones, órdenes de compra a proveedores y comparativos.",
    inputs: ["warehouse", "operational-projects"],
    outputs: ["warehouse", "accounting"],
    owners: [
      ORG_ROLE_KEYS.PROCUREMENT_OFFICER,
      ORG_ROLE_KEYS.DIRECTOR_ADMIN,
      ORG_ROLE_KEYS.WAREHOUSE_MANAGER,
    ],
    panels: ["console"],
  },
  maintenance: {
    id: "maintenance",
    name: "Contratos de mantenimiento",
    icon: "🔧",
    purpose: "Contratos continuos con SLA, visitas preventivas y OT correctivas.",
    inputs: ["sales-projects", "tickets"],
    outputs: ["activities", "invoicing"],
    owners: [
      ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR,
      ORG_ROLE_KEYS.DIRECTOR_OPS,
    ],
    panels: ["operacion"],
    example: "Contrato TOKS — mantenimiento mensual a comanderas e impresoras de 80 sucursales.",
  },
  noc: {
    id: "noc",
    name: "NOC · Monitoreo 24/7",
    icon: "📡",
    purpose: "Vigilancia de uptime de cámaras, POS, redes; detección y escalamiento de alertas.",
    inputs: ["activities", "maintenance"],
    outputs: ["tickets", "activities", "bi"],
    owners: [ORG_ROLE_KEYS.NOC_LEAD, ORG_ROLE_KEYS.NOC_OPERATOR],
    panels: ["noc"],
    example: "Soriana — monitoreo de 1,200 nodos para detectar offline antes que el cliente.",
  },
  support: {
    id: "support",
    name: "Helpdesk · Soporte",
    icon: "🆘",
    purpose: "Triage de tickets de clientes y sucursales; escalamiento a NOC o ingeniería.",
    inputs: ["tickets", "noc"],
    outputs: ["activities", "maintenance"],
    owners: [ORG_ROLE_KEYS.SUPPORT_AGENT],
    panels: ["support"],
  },
  tickets: {
    id: "tickets",
    name: "Portal cliente / sucursal",
    icon: "🎫",
    purpose: "Cliente y sucursales abren solicitudes y ven avance de proyectos.",
    inputs: ["activities"],
    outputs: ["support", "activities"],
    owners: [ORG_ROLE_KEYS.SUPPORT_AGENT],
    panels: ["tickets"],
  },
  accounting: {
    id: "accounting",
    name: "Contabilidad general",
    icon: "📒",
    purpose: "Pólizas, cierre de periodo y reportes financieros.",
    inputs: ["invoicing", "banking", "viatics", "procurement"],
    outputs: ["bi"],
    owners: [ORG_ROLE_KEYS.ACCOUNTANT, ORG_ROLE_KEYS.DIRECTOR_ADMIN],
    panels: ["contabilidad"],
  },
  invoicing: {
    id: "invoicing",
    name: "Facturación CFDI",
    icon: "🧾",
    purpose: "Generación, timbrado y cobranza de facturas desde órdenes de cierre.",
    inputs: ["sales-projects", "maintenance"],
    outputs: ["accounting", "banking"],
    owners: [ORG_ROLE_KEYS.ACCOUNTANT, ORG_ROLE_KEYS.DIRECTOR_ADMIN],
    panels: ["contabilidad"],
  },
  banking: {
    id: "banking",
    name: "Banca y conciliaciones",
    icon: "🏦",
    purpose: "Movimientos bancarios, pagos a proveedores y registro de cobros.",
    inputs: ["invoicing"],
    outputs: ["accounting"],
    owners: [ORG_ROLE_KEYS.ACCOUNTANT, ORG_ROLE_KEYS.DIRECTOR_ADMIN],
    panels: ["contabilidad"],
  },
  hr: {
    id: "hr",
    name: "RRHH · Personas",
    icon: "👥",
    purpose: "Plantilla, CVs, vacaciones, evaluaciones y multas.",
    inputs: ["attendance"],
    outputs: ["accounting", "bi"],
    owners: [ORG_ROLE_KEYS.HR_SPECIALIST, ORG_ROLE_KEYS.DIRECTOR_ADMIN],
    panels: ["people", "console"],
  },
  attendance: {
    id: "attendance",
    name: "Asistencia y jornadas",
    icon: "⏰",
    purpose: "Check-in, descansos y horas trabajadas para nómina.",
    inputs: [],
    outputs: ["hr", "accounting"],
    owners: [ORG_ROLE_KEYS.HR_SPECIALIST, ORG_ROLE_KEYS.ADMIN_STAFF],
    panels: ["people", "console"],
  },
  documents: {
    id: "documents",
    name: "Gestión documental",
    icon: "📂",
    purpose: "Repositorio central de contratos, manuales, fichas y compliance.",
    inputs: ["quotes", "vehicles", "procurement"],
    outputs: [],
    owners: [
      ORG_ROLE_KEYS.ADMIN_STAFF,
      ORG_ROLE_KEYS.DIRECTOR_ADMIN,
      ORG_ROLE_KEYS.HR_SPECIALIST,
    ],
    panels: ["console"],
  },
  bi: {
    id: "bi",
    name: "BI / Analytics",
    icon: "📊",
    purpose: "Dashboards ejecutivos: pipeline, margen, SLA, productividad.",
    inputs: [
      "crm",
      "sales-projects",
      "operational-projects",
      "evidences",
      "noc",
      "accounting",
      "hr",
    ],
    outputs: [],
    owners: [ORG_ROLE_KEYS.CEO, ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL, ORG_ROLE_KEYS.DIRECTOR_OPS],
    panels: ["console"],
  },
  web: {
    id: "web",
    name: "Sitio público · Marketing",
    icon: "🌐",
    purpose: "Casos, noticias, leads y catálogo público.",
    inputs: [],
    outputs: ["crm"],
    owners: [ORG_ROLE_KEYS.DESIGNER, ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL],
    panels: ["web"],
  },
};

/** Devuelve los módulos que un rol específico "habita" (es owner). */
export function getModulesForRole(orgRoleKey: OrgRoleKey | null | undefined): ModuleNode[] {
  if (!orgRoleKey) return [];
  return Object.values(MODULE_MAP).filter((m) => m.owners.includes(orgRoleKey));
}

/** Devuelve módulos accesibles para un panel. */
export function getModulesForPanel(panel: PanelSlug): ModuleNode[] {
  return Object.values(MODULE_MAP).filter((m) => m.panels.includes(panel));
}

/** Devuelve el flujo upstream (qué alimenta a este módulo). */
export function getUpstream(moduleId: ModuleId): ModuleNode[] {
  return MODULE_MAP[moduleId].inputs.map((id) => MODULE_MAP[id]);
}

/** Devuelve el flujo downstream (qué consume este módulo). */
export function getDownstream(moduleId: ModuleId): ModuleNode[] {
  return MODULE_MAP[moduleId].outputs.map((id) => MODULE_MAP[id]);
}

/**
 * Ruta principal de cada módulo (panel canónico + path en `(panels)/*`).
 * Usado por documentación interna y widgets de arquitectura.
 */
export const MODULE_DEFAULT_ROUTE: Record<ModuleId, { panel: PanelSlug; path: string }> = {
  crm: { panel: "ventas", path: "/crm/leads" },
  quotes: { panel: "ventas", path: "/crm/quotes" },
  catalog: { panel: "ventas", path: "/crm/products" },
  "sales-projects": { panel: "ventas", path: "/crm/projects" },
  "operational-projects": { panel: "operacion", path: "/ops/projects" },
  activities: { panel: "operacion", path: "/ops/activities" },
  evidences: { panel: "operacion", path: "/ops/evidences" },
  viatics: { panel: "operacion", path: "/ops/viatics" },
  vehicles: { panel: "operacion", path: "/ops/vehicles" },
  gps: { panel: "operacion", path: "/ops/gps" },
  warehouse: { panel: "console", path: "/erp/warehouse" },
  procurement: { panel: "console", path: "/erp/procurement" },
  maintenance: { panel: "operacion", path: "/ops/maintenance" },
  noc: { panel: "noc", path: "/ops/noc" },
  support: { panel: "support", path: "/ops/support" },
  tickets: { panel: "tickets", path: "/tickets" },
  accounting: { panel: "contabilidad", path: "/erp/accounting" },
  invoicing: { panel: "contabilidad", path: "/erp/invoicing" },
  banking: { panel: "contabilidad", path: "/erp/banking" },
  hr: { panel: "console", path: "/erp/hr" },
  attendance: { panel: "people", path: "/erp/hr/attendance" },
  documents: { panel: "console", path: "/erp/documents" },
  bi: { panel: "console", path: "/erp/analytics/bi" },
  web: { panel: "web", path: "/studio/dashboard" },
};

/** Devuelve la ruta canónica de un módulo (panel + path). */
export function getModuleRoute(moduleId: ModuleId): { panel: PanelSlug; path: string } {
  return MODULE_DEFAULT_ROUTE[moduleId];
}
