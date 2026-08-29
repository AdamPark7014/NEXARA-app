/**
 * NEXARA · Matriz canónica de acceso (Single Source of Truth)
 * ============================================================
 *
 * Este archivo decide UNA cosa y solo UNA: qué rol corporativo puede
 * acceder a qué URL del producto NEXARA. Todo lo demás (sidebars,
 * middlewares, guards backend, paleta de comandos, switcher de paneles)
 * consume esta matriz — nunca duplica reglas en otro lado.
 *
 * Modelo de 6 paneles:
 *
 *   ERP     ·  Operación administrativa, finanzas, RH, almacén, compras, BI, gobierno.
 *   CRM     ·  Pipeline comercial puro (leads, oportunidades, cotizaciones, clientes).
 *   OPS     ·  Operación de campo, NOC, soporte, mantenimiento, ingenieros, evidencias.
 *   STUDIO  ·  Sitio público, marketing, redes, newsletter, casos de éxito, catálogo público.
 *   LAB     ·  Sandbox técnico, API health, feature flags, datos demo.
 *   INTEGRA ·  Seguridad física del sitio (CCTV/ACS) sobre HikCentral Artemis.
 *
 * Cada usuario tiene UN panel HOME y puede saltar a otros vía el
 * switcher discreto del topbar — la sidebar solo muestra el contenido
 * del panel actual, evitando saturar la UI.
 */

import { ORG_ROLE_KEYS, type OrgRoleKey } from "@/lib/org-roles";

// ─────────────────────────────────────────────────────────────────────
// 5 PANELES CONSOLIDADOS
// ─────────────────────────────────────────────────────────────────────

export const PANELS = {
  ERP: "erp",
  CRM: "crm",
  OPS: "ops",
  STUDIO: "studio",
  LAB: "lab",
  INTEGRA: "integra",
} as const;

export type PanelId = (typeof PANELS)[keyof typeof PANELS];

export type PanelMeta = {
  id: PanelId;
  /** Subdominio público en producción (p.ej. erp.nexara.com.mx). */
  publicSubdomain: string;
  /** Nombre mostrado en UI. */
  name: string;
  /** Tagline breve usado en el switcher. */
  tagline: string;
  /** Color de acento del panel (Tailwind / CSS var). */
  accent: string;
  /** Icono mostrado en el switcher (emoji o slug). */
  icon: string;
  /** Ruta interna por defecto al entrar al panel. */
  entryPath: string;
};

export const PANEL_META: Record<PanelId, PanelMeta> = {
  [PANELS.ERP]: {
    id: PANELS.ERP,
    publicSubdomain: "core",
    name: "NEXARA ERP",
    tagline: "Administración, finanzas, RH y gobierno corporativo",
    accent: "#0ea5e9",
    icon: "⚙️",
    entryPath: "/executive",
  },
  [PANELS.CRM]: {
    id: PANELS.CRM,
    publicSubdomain: "sales",
    name: "NEXARA CRM",
    tagline: "Pipeline comercial, cotizaciones y clientes",
    accent: "#10b981",
    icon: "📈",
    entryPath: "/dashboard",
  },
  [PANELS.OPS]: {
    id: PANELS.OPS,
    publicSubdomain: "ops",
    name: "NEXARA OPS",
    tagline: "Campo, NOC, soporte y mantenimiento",
    accent: "#f97316",
    icon: "🚀",
    entryPath: "/dashboard",
  },
  [PANELS.STUDIO]: {
    id: PANELS.STUDIO,
    publicSubdomain: "studio",
    name: "NEXARA STUDIO",
    tagline: "Marca, sitio público, redes y casos",
    accent: "#a855f7",
    icon: "🎨",
    entryPath: "/dashboard",
  },
  [PANELS.LAB]: {
    id: PANELS.LAB,
    publicSubdomain: "lab",
    name: "NEXARA LAB",
    tagline: "Sandbox técnico, API health y feature flags",
    accent: "#64748b",
    icon: "🧪",
    entryPath: "/",
  },
  [PANELS.INTEGRA]: {
    id: PANELS.INTEGRA,
    publicSubdomain: "integra",
    name: "NEXARA INTEGRA",
    tagline: "CCTV y accesos sobre HikCentral Artemis",
    accent: "#1d4ed8",
    icon: "🔐",
    entryPath: "/",
  },
};

// ─────────────────────────────────────────────────────────────────────
// MAPEO PANEL VIEJO → PANEL CONSOLIDADO
// (compatibilidad con código legacy mientras migramos)
// ─────────────────────────────────────────────────────────────────────

export const LEGACY_PANEL_MAP: Record<string, PanelId> = {
  console: PANELS.ERP,
  contabilidad: PANELS.ERP,
  people: PANELS.ERP,
  operacion: PANELS.OPS,
  noc: PANELS.OPS,
  support: PANELS.OPS,
  ventas: PANELS.CRM,
  web: PANELS.STUDIO,
  lab: PANELS.LAB,
  integra: PANELS.INTEGRA,
  tickets: PANELS.OPS, // portal cliente vive lógicamente en OPS
};

export function resolvePanelFromLegacy(legacy: string): PanelId {
  return LEGACY_PANEL_MAP[legacy] ?? PANELS.ERP;
}

// ─────────────────────────────────────────────────────────────────────
// MÓDULOS NEXARA (los "bloques" funcionales que viven en cada panel)
// ─────────────────────────────────────────────────────────────────────

export type ModuleId =
  // ERP
  | "executive"
  | "dashboard"
  | "users"
  | "companies"
  | "approvals"
  | "audit"
  | "exports"
  | "notifications-center"
  | "kb"
  | "settings"
  | "calendar"
  | "my-profile"
  | "accounting"
  | "invoicing"
  | "banking"
  | "viatics-admin"
  | "expenses-admin"
  | "employee-payments"
  | "hr"
  | "attendance"
  | "lunch-breaks"
  | "fines"
  | "orgchart"
  | "kpis-hr"
  | "warehouse"
  | "procurement"
  | "documents"
  | "chat"
  | "reuniones"
  | "bi"
  | "architecture"
  | "news"
  // CRM
  | "crm-leads"
  | "crm-dashboard"
  | "crm-chat"
  | "crm-opportunities"
  | "crm-pipeline"
  | "crm-clients"
  | "crm-quotes"
  | "crm-products"
  | "crm-tenders"
  | "crm-projects"
  | "crm-templates"
  | "crm-agenda"
  | "crm-sales-team"
  | "crm-targets"
  | "crm-reports"
  // OPS
  | "ops-dashboard"
  | "ops-dispatch"
  | "ops-chat"
  | "ops-activities"
  | "ops-my-activities"
  | "ops-evidences"
  | "ops-my-evidences"
  | "ops-viatics"
  | "ops-my-viatics"
  | "ops-vehicles"
  | "ops-my-vehicles"
  | "ops-gps"
  | "ops-tools"
  | "ops-service-clients"
  | "ops-maintenance"
  | "ops-maintenance-contracts"
  | "ops-projects"
  | "ops-assets"
  | "ops-noc"
  | "ops-support-inbox"
  | "ops-support-sla"
  | "ops-cvs"
  // STUDIO
  | "studio-dashboard"
  | "studio-hero"
  | "studio-pages"
  | "studio-news"
  | "studio-cases"
  | "studio-contacts"
  | "studio-social"
  | "studio-newsletter"
  | "studio-leads"
  | "studio-chat"
  // LAB
  | "lab-home"
  | "lab-ai"
  | "lab-health"
  | "lab-chat"
  // Facilities (oficinas NEXARA, vive en ERP)
  | "facilities-access"
  // INTEGRA
  | "integra-home"
  | "integra-video"
  | "integra-access"
  | "integra-people"
  | "integra-events"
  | "integra-vehicles"
  | "integra-alarms"
  | "integra-visitors"
  | "integra-anpr"
  | "integra-settings";

export type ModuleEntry = {
  id: ModuleId;
  panel: PanelId;
  /** Ruta canónica dentro del panel (sin prefijo /erp, /crm, etc.). */
  path: string;
  /** Nombre mostrado en sidebar/menú. */
  label: string;
  /** Descripción breve para tooltip / paleta de comandos. */
  description: string;
  /** Icono (emoji por ahora; eventualmente lucide-react). */
  icon: string;
  /** Roles que pueden ver/usar este módulo (whitelist explícita). */
  allowedRoles: OrgRoleKey[];
  /** Grupo dentro del sidebar (para agrupar visualmente). */
  group: string;
  /** Si es true, el módulo aparece en el menú principal (no oculto). */
  visible: boolean;
};

// ─────────────────────────────────────────────────────────────────────
// HELPERS PARA AUTORIZACIÓN POR PATRÓN
// ─────────────────────────────────────────────────────────────────────

const R = ORG_ROLE_KEYS;

// Conjuntos reutilizables de roles (legibilidad)
const ANY_INTERNAL: OrgRoleKey[] = [
  R.CEO, R.DIRECTOR_ADMIN, R.DIRECTOR_OPS, R.DIRECTOR_COMMERCIAL,
  R.SALES_MANAGER, R.SALES_REP, R.PROJECT_MANAGER,
  R.SENIOR_ENGINEER, R.FIELD_ENGINEER, R.DESIGNER,
  R.ADMIN_STAFF, R.ACCOUNTANT, R.HR_SPECIALIST,
  R.WAREHOUSE_MANAGER, R.PROCUREMENT_OFFICER,
  R.MAINTENANCE_COORDINATOR, R.SUPPORT_AGENT,
  R.NOC_LEAD, R.NOC_OPERATOR,
];

const ADMIN_TIER: OrgRoleKey[] = [R.CEO, R.DIRECTOR_ADMIN];
const ADMIN_PLUS: OrgRoleKey[] = [R.CEO, R.DIRECTOR_ADMIN, R.HR_SPECIALIST];
const FINANCE_TEAM: OrgRoleKey[] = [R.CEO, R.DIRECTOR_ADMIN, R.ACCOUNTANT];
const HR_TEAM: OrgRoleKey[] = [R.CEO, R.DIRECTOR_ADMIN, R.HR_SPECIALIST, R.ADMIN_STAFF];
/** Personal que registra su propia asistencia/comida (legado org roles). */
const SELF_ATTENDANCE_TEAM: OrgRoleKey[] = [
  ...HR_TEAM,
  R.SENIOR_ENGINEER,
  R.FIELD_ENGINEER,
  R.SUPPORT_AGENT,
  R.PROJECT_MANAGER,
  R.SALES_REP,
  R.SALES_MANAGER,
  R.DESIGNER,
];
const SALES_TEAM: OrgRoleKey[] = [R.CEO, R.DIRECTOR_COMMERCIAL, R.DIRECTOR_ADMIN, R.SALES_MANAGER, R.SALES_REP];
const SALES_LEADS: OrgRoleKey[] = [R.CEO, R.DIRECTOR_COMMERCIAL, R.DIRECTOR_ADMIN, R.SALES_MANAGER];
const OPS_TEAM: OrgRoleKey[] = [
  R.CEO, R.DIRECTOR_OPS, R.PROJECT_MANAGER,
  R.SENIOR_ENGINEER, R.FIELD_ENGINEER,
  R.MAINTENANCE_COORDINATOR, R.SUPPORT_AGENT,
];
const OPS_LEADS: OrgRoleKey[] = [
  R.CEO, R.DIRECTOR_OPS, R.PROJECT_MANAGER, R.SENIOR_ENGINEER,
];
const NOC_TEAM: OrgRoleKey[] = [R.CEO, R.DIRECTOR_OPS, R.NOC_LEAD, R.NOC_OPERATOR, R.SUPPORT_AGENT];
const SUPPORT_TEAM: OrgRoleKey[] = [R.CEO, R.DIRECTOR_OPS, R.SUPPORT_AGENT, R.MAINTENANCE_COORDINATOR];
const WAREHOUSE_TEAM: OrgRoleKey[] = [R.CEO, R.DIRECTOR_ADMIN, R.DIRECTOR_OPS, R.WAREHOUSE_MANAGER, R.PROCUREMENT_OFFICER];
const STUDIO_TEAM: OrgRoleKey[] = [R.CEO, R.DIRECTOR_COMMERCIAL, R.DESIGNER];
const FIELD_TEAM: OrgRoleKey[] = [R.FIELD_ENGINEER, R.SENIOR_ENGINEER];

// ─────────────────────────────────────────────────────────────────────
// REGISTRO MAESTRO DE MÓDULOS
// ─────────────────────────────────────────────────────────────────────

export const MODULES: Record<ModuleId, ModuleEntry> = {
  // ════════════════════════════════════════════════════════════════
  // ERP — Backoffice corporativo
  // ════════════════════════════════════════════════════════════════
  executive: {
    id: "executive", panel: PANELS.ERP, path: "/executive",
    label: "Vista ejecutiva", description: "KPIs cross-módulo del negocio",
    icon: "📊", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.DIRECTOR_OPS, R.DIRECTOR_COMMERCIAL],
    group: "Tablero", visible: true,
  },
  dashboard: {
    id: "dashboard", panel: PANELS.ERP, path: "/dashboard",
    label: "Resumen general", description: "Tu día en NEXARA",
    icon: "🏠", allowedRoles: ANY_INTERNAL,
    group: "Tablero", visible: true,
  },
  chat: {
    id: "chat", panel: PANELS.ERP, path: "/chat",
    label: "Chat", description: "Canales, DMs y colaboración en tiempo real",
    icon: "💬", allowedRoles: ANY_INTERNAL,
    group: "Tablero", visible: true,
  },
  reuniones: {
    id: "reuniones", panel: PANELS.ERP, path: "/reuniones",
    label: "Reuniones", description: "Ritmo operativo, acuerdos y lecciones aprendidas",
    icon: "📅", allowedRoles: ANY_INTERNAL,
    group: "Tablero", visible: true,
  },
  approvals: {
    id: "approvals", panel: PANELS.ERP, path: "/approvals",
    label: "Aprobaciones", description: "Flujo de aprobaciones jerárquicas",
    icon: "🛡️", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.DIRECTOR_OPS, R.DIRECTOR_COMMERCIAL, R.SALES_MANAGER, R.PROJECT_MANAGER, R.WAREHOUSE_MANAGER, R.ACCOUNTANT],
    group: "Tablero", visible: true,
  },
  bi: {
    id: "bi", panel: PANELS.ERP, path: "/analytics/bi",
    label: "Business Intelligence", description: "Dashboards analíticos",
    icon: "📈", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.DIRECTOR_OPS, R.DIRECTOR_COMMERCIAL, R.SALES_MANAGER, R.PROJECT_MANAGER],
    group: "Tablero", visible: true,
  },

  // ── Gobierno corporativo ──
  users: {
    id: "users", panel: PANELS.ERP, path: "/users",
    label: "Usuarios y roles", description: "Plantilla, accesos por URL y auditoría",
    icon: "🧑‍💼", allowedRoles: ADMIN_PLUS,
    group: "Gobierno", visible: true,
  },
  companies: {
    id: "companies", panel: PANELS.ERP, path: "/companies",
    label: "Multi-empresa", description: "Razones sociales y sucursales",
    icon: "🏛️", allowedRoles: ADMIN_TIER,
    group: "Gobierno", visible: true,
  },
  settings: {
    id: "settings", panel: PANELS.ERP, path: "/settings",
    label: "Datos de la empresa", description: "Configuración general y branding",
    icon: "🏢", allowedRoles: ADMIN_TIER,
    group: "Gobierno", visible: true,
  },
  architecture: {
    id: "architecture", panel: PANELS.ERP, path: "/architecture",
    label: "Arquitectura del ERP", description: "Mapa de módulos y dependencias",
    icon: "🗺️", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.DIRECTOR_OPS, R.DIRECTOR_COMMERCIAL],
    group: "Gobierno", visible: true,
  },
  kb: {
    id: "kb", panel: PANELS.ERP, path: "/kb",
    label: "Knowledge Base", description: "Procedimientos y documentación interna",
    icon: "📚", allowedRoles: ANY_INTERNAL,
    group: "Gobierno", visible: true,
  },

  // ── Finanzas ──
  accounting: {
    id: "accounting", panel: PANELS.ERP, path: "/accounting",
    label: "Contabilidad", description: "Pólizas, períodos y reportes",
    icon: "📒", allowedRoles: FINANCE_TEAM,
    group: "Finanzas", visible: true,
  },
  invoicing: {
    id: "invoicing", panel: PANELS.ERP, path: "/invoicing",
    label: "Facturación CFDI", description: "Timbrado, cancelaciones y cobranza",
    icon: "🧾", allowedRoles: FINANCE_TEAM,
    group: "Finanzas", visible: true,
  },
  banking: {
    id: "banking", panel: PANELS.ERP, path: "/banking",
    label: "Banca", description: "Movimientos, pagos y conciliación",
    icon: "🏦", allowedRoles: FINANCE_TEAM,
    group: "Finanzas", visible: true,
  },
  "viatics-admin": {
    id: "viatics-admin", panel: PANELS.ERP, path: "/finance/viatics",
    label: "Viáticos · Admin", description: "Comprobación y autorización de viáticos",
    icon: "💸", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.DIRECTOR_OPS, R.ACCOUNTANT, R.PROJECT_MANAGER],
    group: "Finanzas", visible: true,
  },
  "expenses-admin": {
    id: "expenses-admin", panel: PANELS.ERP, path: "/finance/expenses",
    label: "Gastos · Admin", description: "Captura y autorización de gastos",
    icon: "💳", allowedRoles: FINANCE_TEAM,
    group: "Finanzas", visible: true,
  },
  "employee-payments": {
    id: "employee-payments", panel: PANELS.ERP, path: "/finance/employee-payments",
    label: "Pagos a personal", description: "Nómina, finiquitos y bonos",
    icon: "💼", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.ACCOUNTANT, R.HR_SPECIALIST],
    group: "Finanzas", visible: true,
  },

  // ── RH y personas ──
  hr: {
    id: "hr", panel: PANELS.ERP, path: "/hr",
    label: "RRHH", description: "Plantilla, vacaciones e incidencias",
    icon: "👥", allowedRoles: HR_TEAM,
    group: "Personas", visible: true,
  },
  attendance: {
    id: "attendance", panel: PANELS.ERP, path: "/hr/attendance",
    label: "Asistencia", description: "Check-in y jornadas",
    icon: "⏰", allowedRoles: SELF_ATTENDANCE_TEAM,
    group: "Personas", visible: true,
  },
  "lunch-breaks": {
    id: "lunch-breaks", panel: PANELS.ERP, path: "/hr/lunch-breaks",
    label: "Comidas y descansos", description: "Registro y control de pausas",
    icon: "🥪", allowedRoles: SELF_ATTENDANCE_TEAM,
    group: "Personas", visible: true,
  },
  fines: {
    id: "fines", panel: PANELS.ERP, path: "/hr/fines",
    label: "Multas e incidencias", description: "Sanciones administrativas",
    icon: "⚠️", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.HR_SPECIALIST],
    group: "Personas", visible: true,
  },
  orgchart: {
    id: "orgchart", panel: PANELS.ERP, path: "/hr/orgchart",
    label: "Organigrama", description: "Jerarquía y reportes",
    icon: "🌳", allowedRoles: ANY_INTERNAL,
    group: "Personas", visible: true,
  },
  "kpis-hr": {
    id: "kpis-hr", panel: PANELS.ERP, path: "/hr/kpis",
    label: "KPIs de personas", description: "Productividad, rotación, satisfacción",
    icon: "📊", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.HR_SPECIALIST],
    group: "Personas", visible: true,
  },

  // ── Almacén y compras ──
  warehouse: {
    id: "warehouse", panel: PANELS.ERP, path: "/warehouse",
    label: "Almacén", description: "Entradas, salidas, stock y mínimos",
    icon: "📦", allowedRoles: WAREHOUSE_TEAM,
    group: "Logística", visible: true,
  },
  procurement: {
    id: "procurement", panel: PANELS.ERP, path: "/procurement",
    label: "Compras", description: "Requisiciones, OC y proveedores",
    icon: "🛒", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.PROCUREMENT_OFFICER, R.WAREHOUSE_MANAGER],
    group: "Logística", visible: true,
  },
  documents: {
    id: "documents", panel: PANELS.ERP, path: "/documents",
    label: "Gestión documental", description: "Contratos, manuales y compliance",
    icon: "📂", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.ADMIN_STAFF, R.HR_SPECIALIST, R.ACCOUNTANT],
    group: "Logística", visible: true,
  },

  // ── Auditoría y comunicados ──
  audit: {
    id: "audit", panel: PANELS.ERP, path: "/audit",
    label: "Audit log", description: "Trazabilidad de cambios sensibles",
    icon: "🔍", allowedRoles: ADMIN_TIER,
    group: "Auditoría", visible: true,
  },
  exports: {
    id: "exports", panel: PANELS.ERP, path: "/exports",
    label: "Exportaciones", description: "Reportes Excel/PDF globales",
    icon: "📥", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.DIRECTOR_OPS, R.DIRECTOR_COMMERCIAL, R.ACCOUNTANT],
    group: "Auditoría", visible: true,
  },
  "notifications-center": {
    id: "notifications-center", panel: PANELS.ERP, path: "/notifications-center",
    label: "Centro de notificaciones", description: "Alertas y comunicados",
    icon: "🔔", allowedRoles: ANY_INTERNAL,
    group: "Auditoría", visible: true,
  },
  news: {
    id: "news", panel: PANELS.ERP, path: "/news",
    label: "Comunicación interna", description: "Comunicados, boletín mensual y métricas de lectura",
    icon: "📰", allowedRoles: ADMIN_PLUS,
    group: "Auditoría", visible: true,
  },

  // ── Cuenta personal ──
  calendar: {
    id: "calendar", panel: PANELS.ERP, path: "/calendar",
    label: "Mi calendario", description: "Agenda personal y de equipo",
    icon: "📅", allowedRoles: ANY_INTERNAL,
    group: "Mi cuenta", visible: true,
  },
  "my-profile": {
    id: "my-profile", panel: PANELS.ERP, path: "/my-profile",
    label: "Mi perfil", description: "Datos personales y preferencias",
    icon: "👤", allowedRoles: ANY_INTERNAL,
    group: "Mi cuenta", visible: true,
  },

  // ════════════════════════════════════════════════════════════════
  // CRM — Pipeline comercial
  // ════════════════════════════════════════════════════════════════
  "crm-dashboard": {
    id: "crm-dashboard", panel: PANELS.CRM, path: "/dashboard",
    label: "Resumen comercial", description: "KPIs, pipeline y actividad del equipo",
    icon: "📈", allowedRoles: SALES_TEAM,
    group: "Pipeline", visible: true,
  },
  "crm-chat": {
    id: "crm-chat", panel: PANELS.CRM, path: "/chat",
    label: "Chat", description: "Canales y mensajes del equipo",
    icon: "💬", allowedRoles: SALES_TEAM,
    group: "Pipeline", visible: true,
  },
  "crm-leads": {
    id: "crm-leads", panel: PANELS.CRM, path: "/leads",
    label: "Leads", description: "Prospectos sin calificar",
    icon: "✨", allowedRoles: SALES_TEAM,
    group: "Pipeline", visible: true,
  },
  "crm-opportunities": {
    id: "crm-opportunities", panel: PANELS.CRM, path: "/opportunities",
    label: "Oportunidades", description: "Negocios en proceso",
    icon: "🎯", allowedRoles: SALES_TEAM,
    group: "Pipeline", visible: true,
  },
  "crm-pipeline": {
    id: "crm-pipeline", panel: PANELS.CRM, path: "/pipeline",
    label: "Kanban del pipeline", description: "Vista visual por etapa",
    icon: "📊", allowedRoles: SALES_TEAM,
    group: "Pipeline", visible: true,
  },
  "crm-agenda": {
    id: "crm-agenda", panel: PANELS.CRM, path: "/agenda",
    label: "Agenda comercial", description: "Llamadas, visitas y demos",
    icon: "📅", allowedRoles: SALES_TEAM,
    group: "Pipeline", visible: true,
  },

  // ── Catálogo y cotizaciones ──
  "crm-clients": {
    id: "crm-clients", panel: PANELS.CRM, path: "/clients",
    label: "Clientes", description: "Cuentas y contactos",
    icon: "🤝", allowedRoles: SALES_TEAM,
    group: "Catálogo y clientes", visible: true,
  },
  "crm-products": {
    id: "crm-products", panel: PANELS.CRM, path: "/products",
    label: "Catálogo de productos", description: "SKUs, precios y stock",
    icon: "📦", allowedRoles: [...SALES_TEAM, R.WAREHOUSE_MANAGER, R.DESIGNER],
    group: "Catálogo y clientes", visible: true,
  },
  "crm-quotes": {
    id: "crm-quotes", panel: PANELS.CRM, path: "/quotes",
    label: "Cotizaciones", description: "Documentos comerciales y firma digital",
    icon: "📝", allowedRoles: [...SALES_TEAM, R.SENIOR_ENGINEER, R.DESIGNER],
    group: "Catálogo y clientes", visible: true,
  },
  "crm-templates": {
    id: "crm-templates", panel: PANELS.CRM, path: "/templates",
    label: "Plantillas", description: "Documentos y mensajes reutilizables",
    icon: "📋", allowedRoles: [...SALES_LEADS, R.DESIGNER],
    group: "Catálogo y clientes", visible: true,
  },

  // ── Proyectos y licitaciones ──
  "crm-projects": {
    id: "crm-projects", panel: PANELS.CRM, path: "/projects",
    label: "Proyectos de venta", description: "Negocios ganados pendientes de handoff",
    icon: "🏗️", allowedRoles: [...SALES_LEADS, R.SALES_REP, R.PROJECT_MANAGER],
    group: "Proyectos", visible: true,
  },
  "crm-tenders": {
    id: "crm-tenders", panel: PANELS.CRM, path: "/tenders",
    label: "Licitaciones", description: "Públicas y privadas",
    icon: "📜", allowedRoles: SALES_LEADS,
    group: "Proyectos", visible: true,
  },

  // ── Equipo y métricas ──
  "crm-sales-team": {
    id: "crm-sales-team", panel: PANELS.CRM, path: "/team",
    label: "Equipo de ventas", description: "Gestión de ejecutivos",
    icon: "🧑‍💼", allowedRoles: SALES_LEADS,
    group: "Equipo y métricas", visible: true,
  },
  "crm-targets": {
    id: "crm-targets", panel: PANELS.CRM, path: "/targets",
    label: "Cuotas y metas", description: "Forecast y cumplimiento",
    icon: "🎯", allowedRoles: SALES_LEADS,
    group: "Equipo y métricas", visible: true,
  },
  "crm-reports": {
    id: "crm-reports", panel: PANELS.CRM, path: "/reports",
    label: "Reportes comerciales", description: "Análisis de pipeline y cierre",
    icon: "📊", allowedRoles: [...SALES_LEADS, R.DIRECTOR_ADMIN],
    group: "Equipo y métricas", visible: true,
  },

  // ════════════════════════════════════════════════════════════════
  // OPS — Operación de campo, NOC y soporte
  // ════════════════════════════════════════════════════════════════
  "ops-dashboard": {
    id: "ops-dashboard", panel: PANELS.OPS, path: "/dashboard",
    label: "Hoy en operaciones", description: "OT abiertas, alertas y SLA",
    icon: "🚀", allowedRoles: OPS_TEAM,
    group: "Tablero", visible: true,
  },
  "ops-dispatch": {
    id: "ops-dispatch", panel: PANELS.OPS, path: "/dispatch",
    label: "Centro de despacho", description: "Asignación masiva y mapa en vivo",
    icon: "🗺️", allowedRoles: OPS_LEADS,
    group: "Tablero", visible: true,
  },
  "ops-chat": {
    id: "ops-chat", panel: PANELS.OPS, path: "/chat",
    label: "Chat", description: "Canales y mensajes del equipo",
    icon: "💬", allowedRoles: OPS_TEAM,
    group: "Tablero", visible: true,
  },
  "ops-projects": {
    id: "ops-projects", panel: PANELS.OPS, path: "/projects",
    label: "Proyectos operativos", description: "Conversión de ventas a OT",
    icon: "🏗️", allowedRoles: OPS_LEADS,
    group: "Tablero", visible: true,
  },

  // ── Trabajo de campo ──
  "ops-activities": {
    id: "ops-activities", panel: PANELS.OPS, path: "/activities",
    label: "Actividades · Todas", description: "Vista global de OT",
    icon: "📋", allowedRoles: OPS_LEADS,
    group: "Campo", visible: true,
  },
  "ops-my-activities": {
    id: "ops-my-activities", panel: PANELS.OPS, path: "/my-activities",
    label: "Mis actividades", description: "Mis OT asignadas hoy",
    icon: "🧰", allowedRoles: FIELD_TEAM,
    group: "Campo", visible: true,
  },
  "ops-evidences": {
    id: "ops-evidences", panel: PANELS.OPS, path: "/evidences",
    label: "Evidencias · Revisión", description: "Aprobar evidencias de campo",
    icon: "📸", allowedRoles: OPS_LEADS,
    group: "Campo", visible: false,
  },
  "ops-my-evidences": {
    id: "ops-my-evidences", panel: PANELS.OPS, path: "/my-evidences",
    label: "Mis evidencias", description: "Fotos, firmas y hojas de servicio",
    icon: "📷", allowedRoles: FIELD_TEAM,
    group: "Campo", visible: false,
  },
  "ops-viatics": {
    id: "ops-viatics", panel: PANELS.OPS, path: "/viatics",
    label: "Viáticos · Revisión", description: "Revisar viáticos del equipo",
    icon: "💸", allowedRoles: OPS_LEADS,
    group: "Campo", visible: true,
  },
  "ops-my-viatics": {
    id: "ops-my-viatics", panel: PANELS.OPS, path: "/my-viatics",
    label: "Mis viáticos", description: "Solicitar y comprobar viáticos",
    icon: "💵", allowedRoles: FIELD_TEAM,
    group: "Campo", visible: true,
  },
  "ops-vehicles": {
    id: "ops-vehicles", panel: PANELS.OPS, path: "/vehicles",
    label: "Vehículos · Flotilla", description: "Gestión y asignación",
    icon: "🚐", allowedRoles: [...OPS_LEADS, R.ADMIN_STAFF],
    group: "Campo", visible: true,
  },
  "ops-my-vehicles": {
    id: "ops-my-vehicles", panel: PANELS.OPS, path: "/my-vehicles",
    label: "Mis vehículos", description: "Solicitar y entregar",
    icon: "🚗", allowedRoles: FIELD_TEAM,
    group: "Campo", visible: true,
  },
  "ops-gps": {
    id: "ops-gps", panel: PANELS.OPS, path: "/gps",
    label: "GPS en vivo", description: "Rastreo de cuadrillas",
    icon: "📍", allowedRoles: OPS_LEADS,
    group: "Campo", visible: true,
  },
  "ops-tools": {
    id: "ops-tools", panel: PANELS.OPS, path: "/tools",
    label: "Herramientas", description: "Kits y préstamos",
    icon: "🛠️", allowedRoles: [...OPS_TEAM, R.WAREHOUSE_MANAGER],
    group: "Campo", visible: true,
  },

  // ── Servicio continuo ──
  "ops-service-clients": {
    id: "ops-service-clients", panel: PANELS.OPS, path: "/service-clients",
    label: "Clientes con contrato", description: "Cuentas con servicio activo",
    icon: "🏬", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.MAINTENANCE_COORDINATOR, R.SUPPORT_AGENT, R.PROJECT_MANAGER],
    group: "Servicio continuo", visible: true,
  },
  "ops-maintenance": {
    id: "ops-maintenance", panel: PANELS.OPS, path: "/maintenance",
    label: "Mantenimiento", description: "Visitas preventivas y correctivas",
    icon: "🔧", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.MAINTENANCE_COORDINATOR, R.PROJECT_MANAGER, R.SENIOR_ENGINEER],
    group: "Servicio continuo", visible: true,
  },
  "ops-maintenance-contracts": {
    id: "ops-maintenance-contracts", panel: PANELS.OPS, path: "/maintenance/contracts",
    label: "Contratos de servicio", description: "SLA, vigencias y alcance",
    icon: "📑", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.MAINTENANCE_COORDINATOR, R.PROJECT_MANAGER],
    group: "Servicio continuo", visible: false,
  },
  "ops-assets": {
    id: "ops-assets", panel: PANELS.OPS, path: "/assets",
    label: "Activos en campo", description: "Equipos instalados por cliente",
    icon: "📡", allowedRoles: [...OPS_LEADS, R.MAINTENANCE_COORDINATOR],
    group: "Servicio continuo", visible: true,
  },

  // ── NOC y soporte ──
  "ops-noc": {
    id: "ops-noc", panel: PANELS.OPS, path: "/noc",
    label: "NOC · Monitoreo", description: "Uptime y alertas 24/7",
    icon: "📡", allowedRoles: NOC_TEAM,
    group: "Monitoreo y soporte", visible: true,
  },
  "ops-support-inbox": {
    id: "ops-support-inbox", panel: PANELS.OPS, path: "/support",
    label: "Bandeja de soporte", description: "Tickets de clientes",
    icon: "🆘", allowedRoles: SUPPORT_TEAM,
    group: "Monitoreo y soporte", visible: true,
  },
  "ops-support-sla": {
    id: "ops-support-sla", panel: PANELS.OPS, path: "/support/sla",
    label: "SLA y tiempos", description: "Cumplimiento por contrato",
    icon: "⏱️", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.MAINTENANCE_COORDINATOR, R.SUPPORT_AGENT, R.NOC_LEAD],
    group: "Monitoreo y soporte", visible: true,
  },

  // ── Reclutamiento técnico (CVs) — solo lectura para PMs ──
  "ops-cvs": {
    id: "ops-cvs", panel: PANELS.OPS, path: "/recruiting",
    label: "Reclutamiento técnico", description: "CVs de ingenieros candidatos",
    icon: "📄", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.PROJECT_MANAGER, R.HR_SPECIALIST],
    group: "Monitoreo y soporte", visible: true,
  },

  // ════════════════════════════════════════════════════════════════
  // STUDIO — Marca pública y marketing
  // ════════════════════════════════════════════════════════════════
  "studio-dashboard": {
    id: "studio-dashboard", panel: PANELS.STUDIO, path: "/dashboard",
    label: "Studio dashboard", description: "Tráfico, leads y campañas",
    icon: "🎨", allowedRoles: STUDIO_TEAM,
    group: "Tablero", visible: true,
  },
  "studio-chat": {
    id: "studio-chat", panel: PANELS.STUDIO, path: "/chat",
    label: "Chat", description: "Canales y mensajes del equipo",
    icon: "💬", allowedRoles: STUDIO_TEAM,
    group: "Tablero", visible: true,
  },
  "studio-hero": {
    id: "studio-hero", panel: PANELS.STUDIO, path: "/hero",
    label: "Banner del inicio", description: "Imágenes y orden del carrusel principal",
    icon: "🎞️", allowedRoles: STUDIO_TEAM,
    group: "Contenido", visible: true,
  },
  "studio-pages": {
    id: "studio-pages", panel: PANELS.STUDIO, path: "/pages",
    label: "Páginas públicas", description: "Las 5 secciones principales del sitio",
    icon: "🖼️", allowedRoles: STUDIO_TEAM,
    group: "Contenido", visible: true,
  },
  "studio-cases": {
    id: "studio-cases", panel: PANELS.STUDIO, path: "/cases",
    label: "Casos de éxito", description: "Proyectos publicados",
    icon: "🏆", allowedRoles: STUDIO_TEAM,
    group: "Contenido", visible: true,
  },
  "studio-news": {
    id: "studio-news", panel: PANELS.STUDIO, path: "/news",
    label: "Noticias y blog", description: "Publicaciones del sitio",
    icon: "📰", allowedRoles: STUDIO_TEAM,
    group: "Contenido", visible: true,
  },
  "studio-social": {
    id: "studio-social", panel: PANELS.STUDIO, path: "/social",
    label: "Redes sociales", description: "Calendario y métricas",
    icon: "📱", allowedRoles: STUDIO_TEAM,
    group: "Contenido", visible: true,
  },
  "studio-newsletter": {
    id: "studio-newsletter", panel: PANELS.STUDIO, path: "/newsletter",
    label: "Newsletter público", description: "Boletín a clientes y leads",
    icon: "✉️", allowedRoles: STUDIO_TEAM,
    group: "Contenido", visible: true,
  },
  "studio-contacts": {
    id: "studio-contacts", panel: PANELS.STUDIO, path: "/contacts",
    label: "Contactos web", description: "Formularios y leads del sitio",
    icon: "📥", allowedRoles: [...STUDIO_TEAM, R.SALES_MANAGER, R.SALES_REP],
    group: "Captación", visible: true,
  },
  "studio-leads": {
    id: "studio-leads", panel: PANELS.STUDIO, path: "/leads",
    label: "Leads del sitio", description: "Prospectos que llegaron por marketing",
    icon: "🌐", allowedRoles: [...STUDIO_TEAM, R.SALES_MANAGER, R.SALES_REP],
    group: "Captación", visible: true,
  },

  // ════════════════════════════════════════════════════════════════
  // LAB — Sandbox técnico
  // ════════════════════════════════════════════════════════════════
  "lab-home": {
    id: "lab-home", panel: PANELS.LAB, path: "/",
    label: "Lab home", description: "Playground y feature flags",
    icon: "🧪", allowedRoles: [R.CEO],
    group: "Lab", visible: true,
  },
  "lab-chat": {
    id: "lab-chat", panel: PANELS.LAB, path: "/chat",
    label: "Chat", description: "Canales y mensajes del equipo",
    icon: "💬", allowedRoles: [R.CEO],
    group: "Lab", visible: true,
  },
  "lab-ai": {
    id: "lab-ai", panel: PANELS.LAB, path: "/ai",
    label: "AI sandbox", description: "Pruebas de modelos y prompts",
    icon: "🤖", allowedRoles: [R.CEO],
    group: "Lab", visible: true,
  },
  "lab-health": {
    id: "lab-health", panel: PANELS.LAB, path: "/health",
    label: "Health API", description: "Estado de servicios",
    icon: "❤️", allowedRoles: [R.CEO],
    group: "Lab", visible: true,
  },

  // ════════════════════════════════════════════════════════════════
  // Facilities — oficinas NEXARA (ERP)
  // ════════════════════════════════════════════════════════════════
  "facilities-access": {
    id: "facilities-access", panel: PANELS.ERP, path: "/facilities/access",
    label: "Accesos oficinas", description: "Puertas Artemis de sedes NEXARA",
    icon: "🚪", allowedRoles: [R.CEO, R.DIRECTOR_ADMIN, R.DIRECTOR_OPS, R.ADMIN_STAFF, R.NOC_LEAD],
    group: "Facilities", visible: true,
  },

  // ════════════════════════════════════════════════════════════════
  // INTEGRA — CCTV / ACS sitio (HikCentral Artemis)
  // ════════════════════════════════════════════════════════════════
  "integra-home": {
    id: "integra-home", panel: PANELS.INTEGRA, path: "/",
    label: "Integra", description: "Inicio del panel de seguridad física",
    icon: "🔐", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.SENIOR_ENGINEER, R.NOC_LEAD, R.NOC_OPERATOR],
    group: "Integra", visible: true,
  },
  "integra-video": {
    id: "integra-video", panel: PANELS.INTEGRA, path: "/video",
    label: "Video", description: "Live view y playback",
    icon: "📹", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.SENIOR_ENGINEER, R.NOC_LEAD, R.NOC_OPERATOR],
    group: "Integra", visible: true,
  },
  "integra-access": {
    id: "integra-access", panel: PANELS.INTEGRA, path: "/access",
    label: "Accesos sitio", description: "Puertas y privilegios del sitio",
    icon: "🚪", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.SENIOR_ENGINEER, R.NOC_LEAD, R.NOC_OPERATOR],
    group: "Integra", visible: true,
  },
  "integra-people": {
    id: "integra-people", panel: PANELS.INTEGRA, path: "/people",
    label: "Personas", description: "Personas y credenciales Artemis",
    icon: "👤", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.SENIOR_ENGINEER, R.NOC_LEAD],
    group: "Integra", visible: true,
  },
  "integra-events": {
    id: "integra-events", panel: PANELS.INTEGRA, path: "/events",
    label: "Eventos", description: "Eventos ACS / VMS / vehículos",
    icon: "📋", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.SENIOR_ENGINEER, R.NOC_LEAD, R.NOC_OPERATOR],
    group: "Integra", visible: true,
  },
  "integra-vehicles": {
    id: "integra-vehicles", panel: PANELS.INTEGRA, path: "/vehicles",
    label: "Vehículos", description: "Flota Artemis",
    icon: "🚗", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.SENIOR_ENGINEER, R.NOC_LEAD],
    group: "Integra", visible: true,
  },
  "integra-alarms": {
    id: "integra-alarms", panel: PANELS.INTEGRA, path: "/alarms",
    label: "Alarmas", description: "eventService / alarmas sitio",
    icon: "🚨", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.SENIOR_ENGINEER, R.NOC_LEAD, R.NOC_OPERATOR],
    group: "Integra", visible: true,
  },
  "integra-visitors": {
    id: "integra-visitors", panel: PANELS.INTEGRA, path: "/visitors",
    label: "Visitas", description: "Citas y QR visitante",
    icon: "🎫", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.SENIOR_ENGINEER, R.NOC_LEAD],
    group: "Integra", visible: true,
  },
  "integra-anpr": {
    id: "integra-anpr", panel: PANELS.INTEGRA, path: "/anpr",
    label: "ANPR", description: "Cruces PMS / placas",
    icon: "🚘", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.SENIOR_ENGINEER, R.NOC_LEAD],
    group: "Integra", visible: true,
  },
  "integra-settings": {
    id: "integra-settings", panel: PANELS.INTEGRA, path: "/settings",
    label: "Sitios", description: "Sitios Artemis y sync",
    icon: "⚙️", allowedRoles: [R.CEO, R.DIRECTOR_OPS, R.DIRECTOR_ADMIN],
    group: "Integra", visible: true,
  },
};

// ─────────────────────────────────────────────────────────────────────
// API DE LA MATRIZ
// ─────────────────────────────────────────────────────────────────────

/** URL absoluta canónica de un módulo: `/erp/dashboard`, `/crm/leads`, etc. */
export function getModuleUrl(moduleId: ModuleId): string {
  const m = MODULES[moduleId];
  return joinPath(`/${m.panel}`, m.path);
}

function joinPath(prefix: string, path: string) {
  if (path === "/" || path === "") return prefix;
  return prefix + (path.startsWith("/") ? path : `/${path}`);
}

/** Lista de módulos a los que un rol puede entrar. */
export function getAllowedModules(role: OrgRoleKey | null, isSuperAdmin = false): ModuleEntry[] {
  if (isSuperAdmin) return Object.values(MODULES);
  if (!role) return [];
  return Object.values(MODULES).filter((m) => m.allowedRoles.includes(role));
}

/** Módulos visibles a un rol dentro de un panel. */
export function getModulesByPanel(
  panel: PanelId,
  role: OrgRoleKey | null,
  isSuperAdmin = false,
): ModuleEntry[] {
  return getAllowedModules(role, isSuperAdmin).filter((m) => m.panel === panel && m.visible);
}

/** Lista de paneles a los que un rol puede entrar (alguno de sus módulos). */
export function getAllowedPanels(role: OrgRoleKey | null, isSuperAdmin = false): PanelMeta[] {
  if (isSuperAdmin) return Object.values(PANEL_META);
  if (!role) return [];
  const allowed = new Set<PanelId>();
  for (const m of Object.values(MODULES)) {
    if (m.allowedRoles.includes(role)) allowed.add(m.panel);
  }
  return Object.values(PANEL_META).filter((p) => allowed.has(p.id));
}

/** Determina si un rol puede acceder a una URL completa estilo `/erp/users`. */
export function canAccessUrl(
  role: OrgRoleKey | null,
  url: string,
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin) return true;
  if (!role) return false;
  const normalized = normalizeUrl(url);

  // 1) Match exacto en módulo registrado
  for (const m of Object.values(MODULES)) {
    if (!m.allowedRoles.includes(role)) continue;
    const target = getModuleUrl(m.id);
    if (normalized === target || normalized.startsWith(`${target}/`)) return true;
  }

  // 2) Rutas personales `/[panel]/my-profile` / `/[panel]/calendar` siempre permitidas
  if (/^\/(erp|crm|ops|studio|lab|integra)\/(my-profile|calendar)(\/|$)/.test(normalized)) return true;
  // Chat corporativo — mismo módulo en los paneles, misma API/DB
  if (/^\/(erp|crm|ops|studio|lab|integra)\/chat(\/|$)/.test(normalized)) return true;

  return false;
}

function normalizeUrl(url: string): string {
  if (!url) return "/";
  const cleaned = url.split("?")[0].split("#")[0];
  return cleaned.endsWith("/") && cleaned !== "/" ? cleaned.slice(0, -1) : cleaned;
}

/** Mapa "panel → grupos → módulos" listos para renderizar el sidebar. */
export type SidebarGroup = {
  id: string;
  title: string;
  items: ModuleEntry[];
};

export function buildSidebar(
  panel: PanelId,
  role: OrgRoleKey | null,
  isSuperAdmin = false,
): SidebarGroup[] {
  const items = getModulesByPanel(panel, role, isSuperAdmin);
  const byGroup = new Map<string, ModuleEntry[]>();
  for (const m of items) {
    const list = byGroup.get(m.group) || [];
    list.push(m);
    byGroup.set(m.group, list);
  }
  const groups: SidebarGroup[] = [];
  for (const [title, list] of byGroup) {
    groups.push({
      id: slugify(title),
      title,
      items: list,
    });
  }
  return groups;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Resuelve panel HOME del usuario (donde aterriza al hacer login). */
export const ROLE_HOME_PANEL: Record<OrgRoleKey, PanelId> = {
  [R.CEO]: PANELS.ERP,
  [R.DIRECTOR_ADMIN]: PANELS.ERP,
  [R.DIRECTOR_OPS]: PANELS.OPS,
  [R.DIRECTOR_COMMERCIAL]: PANELS.CRM,
  [R.SALES_MANAGER]: PANELS.CRM,
  [R.SALES_REP]: PANELS.CRM,
  [R.PROJECT_MANAGER]: PANELS.OPS,
  [R.ARQUITECTO]: PANELS.OPS,
  [R.COORD_OPERACIONES]: PANELS.OPS,
  [R.SENIOR_ENGINEER]: PANELS.OPS,
  [R.FIELD_ENGINEER]: PANELS.OPS,
  [R.DESIGNER]: PANELS.STUDIO,
  [R.ADMIN_STAFF]: PANELS.ERP,
  [R.ACCOUNTANT]: PANELS.ERP,
  [R.HR_SPECIALIST]: PANELS.ERP,
  [R.WAREHOUSE_MANAGER]: PANELS.ERP,
  [R.PROCUREMENT_OFFICER]: PANELS.ERP,
  [R.MAINTENANCE_COORDINATOR]: PANELS.OPS,
  [R.SUPPORT_AGENT]: PANELS.OPS,
  [R.NOC_LEAD]: PANELS.OPS,
  [R.NOC_OPERATOR]: PANELS.OPS,
};

/** Rutas HOME explícitas por rol org (evita que todos los de ERP caigan en /executive). */
const ORG_ROLE_HOME_PATH: Partial<Record<OrgRoleKey, string>> = {
  [R.CEO]: "/erp/executive",
  [R.FIELD_ENGINEER]: "/ops/my-activities",
};

export function getHomePanel(role: OrgRoleKey | null, isSuperAdmin = false, isPlatformOwner = false, isDeveloperSuperAdmin = false): PanelId {
  if (isDeveloperSuperAdmin) return PANELS.LAB;
  if (isPlatformOwner || isSuperAdmin) return PANELS.ERP;
  if (!role) return PANELS.ERP;
  return ROLE_HOME_PANEL[role] ?? PANELS.ERP;
}

/** Devuelve ruta HOME completa: /erp/dashboard, /crm/dashboard, etc. */
export function getHomeUrl(
  role: OrgRoleKey | null,
  isSuperAdmin = false,
  isPlatformOwner = false,
  isDeveloperSuperAdmin = false,
): string {
  if (isDeveloperSuperAdmin) return "/lab";
  if (isPlatformOwner || isSuperAdmin) return "/erp/executive";
  if (!role) return "/erp/dashboard";

  const explicit = ORG_ROLE_HOME_PATH[role];
  if (explicit) return explicit;

  const panel = getHomePanel(role, isSuperAdmin, isPlatformOwner, isDeveloperSuperAdmin);
  if (panel === PANELS.LAB) return "/lab";
  // PANEL_META.erp.entryPath es /executive (branding subdominio); home operativo = dashboard.
  if (panel === PANELS.ERP) return "/erp/dashboard";

  const entry = PANEL_META[panel].entryPath;
  if (!entry || entry === "/") return `/${panel}`;
  return `/${panel}${entry}`;
}
