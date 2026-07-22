/**
 * Claves canónicas de roles organizacionales — NEXARA ERP tech-services.
 *
 * Jerarquía oficial (5 niveles · 18 roles):
 *
 *   EXECUTIVE  (100)  : CEO
 *   DIRECTOR   (85)   : DIRECTOR_ADMIN · DIRECTOR_OPS · DIRECTOR_COMMERCIAL
 *   MANAGER    (70)   : SALES_MANAGER · PROJECT_MANAGER · ACCOUNTANT · WAREHOUSE_MANAGER · MAINTENANCE_COORDINATOR · NOC_LEAD
 *   SPECIALIST (55)   : SENIOR_ENGINEER · DESIGNER · HR_SPECIALIST · PROCUREMENT_OFFICER · SUPPORT_AGENT
 *   OPERATIVE  (40)   : SALES_REP · FIELD_ENGINEER · ADMIN_STAFF · NOC_OPERATOR
 *
 * Cada rol pertenece a UN departamento y tiene UN panel HOME, pero puede
 * acceder a otros mediante el PanelSwitcher según sus flags.
 */
export const ORG_ROLE_KEYS = {
  CEO: 'ceo',
  DIRECTOR_ADMIN: 'director_admin',
  DIRECTOR_OPS: 'director_ops',
  DIRECTOR_COMMERCIAL: 'director_commercial',
  SALES_MANAGER: 'sales_manager',
  SALES_REP: 'sales_rep',
  PROJECT_MANAGER: 'project_manager',
  SENIOR_ENGINEER: 'senior_engineer',
  FIELD_ENGINEER: 'field_engineer',
  DESIGNER: 'designer',
  ADMIN_STAFF: 'admin_staff',
  ACCOUNTANT: 'accountant',
  HR_SPECIALIST: 'hr_specialist',
  WAREHOUSE_MANAGER: 'warehouse_manager',
  PROCUREMENT_OFFICER: 'procurement_officer',
  MAINTENANCE_COORDINATOR: 'maintenance_coordinator',
  SUPPORT_AGENT: 'support_agent',
  NOC_LEAD: 'noc_lead',
  NOC_OPERATOR: 'noc_operator',
} as const;

export type OrgRoleKey = (typeof ORG_ROLE_KEYS)[keyof typeof ORG_ROLE_KEYS];

export const ORG_TIER = {
  EXECUTIVE: 100,
  DIRECTOR: 85,
  MANAGER: 70,
  SPECIALIST: 55,
  OPERATIVE: 40,
  EXTERNAL: 10,
} as const;

export type OrgRoleFlags = {
  accesoConsole: boolean;
  accesoConsoleAdmin: boolean;
  accesoActividades: boolean;
  accesoEvidencias: boolean;
  accesoViaticos: boolean;
  accesoVehiculos: boolean;
  accesoAsistencia: boolean;
  accesoGps: boolean;
  accesoGestionUsuarios: boolean;
  accesoGestionWeb: boolean;
  accesoGestionCvs: boolean;
  accesoPanelVentas: boolean;
  accesoContabilidad: boolean;
  accesoCotizaciones: boolean;
  accesoInventario: boolean;
  accesoCompras: boolean;
  accesoMantenimiento: boolean;
  accesoDocumentos: boolean;
  accesoAuditoria: boolean;
  accesoBI: boolean;
  accesoBanca: boolean;
  accesoMultas: boolean;
  accesoClientes: boolean;
  accesoLunchBreaks: boolean;
  accesoRRHH: boolean;
  accesoCatalogo: boolean;
};

export type OrgRoleTemplate = {
  orgRoleKey: OrgRoleKey;
  nombre: string;
  label: string;
  description: string;
  /** Cómo se usa este rol en la operación (para tour de bienvenida). */
  missionStatement: string;
  /** Acciones típicas del día a día. */
  dailyActions: string[];
  nivelAutoridad: number;
  departmentHint: string;
  flags: OrgRoleFlags;
};

const baseField: OrgRoleFlags = {
  accesoConsole: true,
  accesoConsoleAdmin: false,
  accesoActividades: false,
  accesoEvidencias: false,
  accesoViaticos: false,
  accesoVehiculos: false,
  accesoAsistencia: false,
  accesoGps: false,
  accesoGestionUsuarios: false,
  accesoGestionWeb: false,
  accesoGestionCvs: false,
  accesoPanelVentas: false,
  accesoContabilidad: false,
  accesoCotizaciones: false,
  accesoInventario: false,
  accesoCompras: false,
  accesoMantenimiento: false,
  accesoDocumentos: false,
  accesoAuditoria: false,
  accesoBI: false,
  accesoBanca: false,
  accesoMultas: false,
  accesoClientes: false,
  accesoLunchBreaks: false,
  accesoRRHH: false,
  accesoCatalogo: false,
};

const allTrue = (): OrgRoleFlags =>
  Object.fromEntries(Object.keys(baseField).map((k) => [k, true])) as OrgRoleFlags;

/** Plantillas oficiales de roles — usar en seed y asignación de usuarios. */
export const ORG_ROLE_TEMPLATES: OrgRoleTemplate[] = [
  {
    orgRoleKey: ORG_ROLE_KEYS.CEO,
    nombre: 'CEO',
    label: 'CEO',
    description: 'Acceso ejecutivo total a todos los paneles y módulos.',
    missionStatement: 'Vista 360° del negocio: pipeline, operación, finanzas y personas.',
    dailyActions: [
      'Revisar KPIs ejecutivos y BI cross-módulo',
      'Aprobar oportunidades > $500k y presupuestos especiales',
      'Validar el margen real vs planeado por proyecto',
    ],
    nivelAutoridad: ORG_TIER.EXECUTIVE,
    departmentHint: 'Dirección General',
    flags: allTrue(),
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
    nombre: 'Director Administrativo',
    label: 'Director Administrativo',
    description: 'Administración + Comercial: RRHH, finanzas, inventario, compras, ventas y pipeline.',
    missionStatement: 'Mantener la salud financiera del backoffice y empujar el crecimiento comercial.',
    dailyActions: [
      'Aprobar requisiciones de compra, viáticos y descuentos > 30%',
      'Revisar flujo de caja, banca, facturas CXC/CXP y pipeline kanban',
      'Supervisar RH, nómina, asistencia y forecast comercial',
    ],
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Administración',
    flags: {
      ...baseField,
      accesoConsoleAdmin: true,
      accesoGestionUsuarios: true,
      accesoContabilidad: true,
      accesoInventario: true,
      accesoCompras: true,
      accesoDocumentos: true,
      accesoAuditoria: true,
      accesoBI: true,
      accesoBanca: true,
      accesoAsistencia: true,
      accesoMultas: true,
      accesoClientes: true,
      accesoLunchBreaks: true,
      accesoRRHH: true,
      accesoCatalogo: true,
      accesoPanelVentas: true,
      // Poderes comerciales heredados al fusionar con Dirección Comercial:
      accesoCotizaciones: true,
      accesoGestionCvs: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_OPS,
    nombre: 'Director Operativo',
    label: 'Director Operativo',
    description: 'Operación de campo, instalaciones, activos, GPS y mantenimiento.',
    missionStatement: 'Garantizar entrega de proyectos y cumplimiento SLA en campo.',
    dailyActions: [
      'Asignar ingenieros a proyectos comerciales aprobados',
      'Monitorear avance de OT por sucursal y tipo (CCTV, mantenimiento, auditoría)',
      'Aprobar evidencias críticas y revisar alertas NOC',
    ],
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Operaciones',
    flags: {
      ...baseField,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoVehiculos: true,
      accesoGps: true,
      accesoMantenimiento: true,
      accesoClientes: true,
      accesoInventario: true,
      accesoCatalogo: true,
      accesoBI: true,
      accesoAsistencia: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL,
    nombre: 'Director Comercial',
    label: 'Director Comercial',
    description: 'Estrategia comercial, pipeline, cotizaciones y reportes de ventas.',
    missionStatement: 'Hacer crecer ingresos y margen del pipeline tech (servicios + productos + proyectos).',
    dailyActions: [
      'Revisar pipeline kanban (Discovery → Closing) por ejecutivo',
      'Aprobar descuentos > 15% y contratos marco',
      'Pronóstico mensual y forecast vs cierre real',
    ],
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Ventas',
    flags: {
      ...baseField,
      accesoPanelVentas: true,
      accesoCotizaciones: true,
      accesoClientes: true,
      accesoCatalogo: true,
      accesoBI: true,
      accesoGestionCvs: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.SALES_MANAGER,
    nombre: 'Gerente de Ventas',
    label: 'Gerente de Ventas',
    description: 'Supervisión de equipo comercial, cotizaciones y clientes.',
    missionStatement: 'Coordinar al equipo de ejecutivos y cerrar negocios complejos.',
    dailyActions: [
      'Coachear a ejecutivos en cuentas clave',
      'Revisar cotizaciones > $100k antes de enviarlas',
      'Garantizar handoff limpio a operación al cerrar',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Ventas',
    flags: {
      ...baseField,
      accesoPanelVentas: true,
      accesoCotizaciones: true,
      accesoClientes: true,
      accesoCatalogo: true,
      accesoBI: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.SALES_REP,
    nombre: 'Ejecutivo de Ventas',
    label: 'Ejecutivo de Ventas',
    description: 'Prospección, cotizaciones y seguimiento de clientes asignados.',
    missionStatement: 'Convertir leads en proyectos cerrados (CCTV, auditoría, mantenimiento).',
    dailyActions: [
      'Capturar leads, actualizar oportunidades en el pipeline',
      'Cotizar desde catálogo (cámaras, switches, pantallas, mano de obra)',
      'Agendar visitas de levantamiento con ingenieros',
    ],
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Ventas',
    flags: {
      ...baseField,
      accesoPanelVentas: true,
      accesoCotizaciones: true,
      accesoCatalogo: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.PROJECT_MANAGER,
    nombre: 'Jefe de Proyectos',
    label: 'Jefe de Proyectos',
    description: 'Coordinación de instalaciones, actividades y entregables.',
    missionStatement: 'Entregar proyectos en tiempo, costo y calidad — ejemplo Polos del Bienestar.',
    dailyActions: [
      'Convertir proyecto de ventas en OTs por sitio',
      'Asignar ingenieros y materiales del almacén',
      'Sincronizar costos reales y avisar desviaciones',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Operaciones',
    flags: {
      ...baseField,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoClientes: true,
      accesoCatalogo: true,
      accesoPanelVentas: true,
      accesoInventario: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.SENIOR_ENGINEER,
    nombre: 'Ingeniero Senior',
    label: 'Ingeniero Senior',
    description: 'Instalaciones complejas, revisión de evidencias y soporte técnico.',
    missionStatement: 'Llevar el liderazgo técnico en campo y validar trabajo de ingenieros junior.',
    dailyActions: [
      'Levantar sitios complejos (multi-sucursal, redes mixtas)',
      'Revisar evidencias de junior y aprobar cierre de OT',
      'Apoyar a ventas en cotizaciones técnicas',
    ],
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Ingeniería de campo',
    flags: {
      ...baseField,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoGps: true,
      accesoViaticos: true,
      accesoCotizaciones: true,
      accesoCatalogo: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    nombre: 'Ingeniero de Campo',
    label: 'Ingeniero de Campo',
    description: 'Ejecución en sitio: actividades, evidencias, viáticos y herramientas.',
    missionStatement: 'Hacer realidad cada instalación, cambio de equipo o mantenimiento en sitio.',
    dailyActions: [
      'Ver "Mis actividades" del día (TOKS, Soriana, etc.)',
      'Subir evidencias y firmar hoja de servicio',
      'Comprobar viáticos y check-in GPS al llegar',
    ],
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Ingeniería de campo',
    flags: {
      ...baseField,
      accesoViaticos: true,
      accesoVehiculos: true,
      accesoGps: true,
      accesoAsistencia: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.DESIGNER,
    nombre: 'Diseñador / Marketing',
    label: 'Diseñador / Marketing',
    description: 'Contenido web, material comercial y apoyo visual.',
    missionStatement: 'Construir la marca pública y dar arsenal visual a ventas.',
    dailyActions: [
      'Publicar casos de éxito y noticias en el sitio',
      'Generar fichas técnicas para cotizaciones premium',
      'Mantener catálogo público actualizado',
    ],
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Marketing',
    flags: {
      ...baseField,
      accesoGestionWeb: true,
      accesoCotizaciones: true,
      accesoCatalogo: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.ADMIN_STAFF,
    nombre: 'Personal Administrativo',
    label: 'Personal Administrativo',
    description: 'Apoyo administrativo: asistencia, documentos y comidas.',
    missionStatement: 'Mantener al día la documentación, asistencia y servicios internos.',
    dailyActions: [
      'Capturar asistencia y comidas del día',
      'Archivar documentos legales y contratos',
      'Apoyar a contador con captura de gastos',
    ],
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Administración',
    flags: {
      ...baseField,
      accesoAsistencia: true,
      accesoDocumentos: true,
      accesoLunchBreaks: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.ACCOUNTANT,
    nombre: 'Contador',
    label: 'Contador',
    description: 'Contabilidad, facturación, banca y reportes financieros.',
    missionStatement: 'Llevar la contabilidad limpia y timbrar facturas CFDI a tiempo.',
    dailyActions: [
      'Timbrar facturas borrador generadas desde órdenes de cierre',
      'Conciliar movimientos bancarios y registrar pagos',
      'Cerrar periodos contables y reportar a SAT',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Administración',
    flags: {
      ...baseField,
      accesoContabilidad: true,
      accesoBanca: true,
      accesoViaticos: true,
      accesoAsistencia: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.HR_SPECIALIST,
    nombre: 'Especialista RRHH',
    label: 'Especialista RRHH',
    description: 'Recursos humanos, asistencia, multas y gestión de personal.',
    missionStatement: 'Cuidar al equipo: contratación, asistencia, evaluación y desarrollo.',
    dailyActions: [
      'Revisar CVs de candidatos y mover en el pipeline',
      'Aprobar vacaciones, permisos y registrar incidencias',
      'Gestionar alta/baja de usuarios en el sistema',
    ],
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Administración',
    flags: {
      ...baseField,
      accesoRRHH: true,
      accesoAsistencia: true,
      accesoMultas: true,
      accesoLunchBreaks: true,
      accesoGestionCvs: true,
      accesoGestionUsuarios: true,
    },
  },
  // ───────── nuevos roles (productos + monitoreo + mantenimiento) ─────────
  {
    orgRoleKey: ORG_ROLE_KEYS.WAREHOUSE_MANAGER,
    nombre: 'Jefe de Almacén',
    label: 'Jefe de Almacén',
    description: 'Recepción, stock, salidas y trazabilidad de equipos y refacciones.',
    missionStatement: 'Que ningún ingeniero llegue a sitio sin equipo y que el stock cuadre.',
    dailyActions: [
      'Recibir entregas de compras y validar contra OC',
      'Despachar equipos por OT (CCTV, switches, refacciones)',
      'Inventario cíclico y aviso de mínimos',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Almacén',
    flags: {
      ...baseField,
      accesoInventario: true,
      accesoCatalogo: true,
      accesoCompras: true,
      accesoDocumentos: true,
      accesoActividades: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.PROCUREMENT_OFFICER,
    nombre: 'Comprador',
    label: 'Comprador',
    description: 'Requisiciones, OC a proveedores y comparativos de cotizaciones.',
    missionStatement: 'Conseguir el mejor equipo al mejor precio en el menor tiempo.',
    dailyActions: [
      'Procesar requisiciones aprobadas (por proyecto o stock mínimo)',
      'Generar OC y dar seguimiento a entrega',
      'Mantener catálogo de proveedores y precios',
    ],
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Compras',
    flags: {
      ...baseField,
      accesoCompras: true,
      accesoInventario: true,
      accesoCatalogo: true,
      accesoDocumentos: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR,
    nombre: 'Coordinador de Mantenimiento',
    label: 'Coordinador de Mantenimiento',
    description: 'Contratos de servicio continuo, visitas preventivas y SLA.',
    missionStatement: 'Mantener vivos los contratos de mantenimiento (estilo TOKS) sin que se caiga ninguno.',
    dailyActions: [
      'Programar visitas preventivas mensuales por cliente',
      'Despachar OT correctivas dentro de SLA',
      'Renovar contratos antes de vencer',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Operaciones',
    flags: {
      ...baseField,
      accesoMantenimiento: true,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoClientes: true,
      accesoCatalogo: true,
      accesoDocumentos: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.SUPPORT_AGENT,
    nombre: 'Agente de Soporte',
    label: 'Agente de Soporte',
    description: 'Helpdesk interno y triage de tickets de clientes/sucursales.',
    missionStatement: 'Ser el primer contacto del cliente y resolver o escalar rápido.',
    dailyActions: [
      'Triage de tickets cliente (portal) y sucursales',
      'Asignar a NOC o ingeniero según urgencia',
      'Comunicar avance al cliente hasta cierre',
    ],
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Soporte',
    flags: {
      ...baseField,
      accesoActividades: true,
      accesoClientes: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.NOC_LEAD,
    nombre: 'Jefe NOC',
    label: 'Jefe NOC',
    description: 'Coordinación del centro de monitoreo 24/7 y alertas críticas.',
    missionStatement: 'Detectar antes que el cliente: uptime de cámaras, POS, redes (estilo Soriana multi-sucursal).',
    dailyActions: [
      'Definir umbrales de alerta y políticas de escalamiento',
      'Asignar operadores por turno y revisar incidentes mayores',
      'Reportar disponibilidad mensual a clientes corporativos',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'NOC',
    flags: {
      ...baseField,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoClientes: true,
      accesoBI: true,
      accesoMantenimiento: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.NOC_OPERATOR,
    nombre: 'Operador NOC',
    label: 'Operador NOC',
    description: 'Monitoreo en turno, atención de alertas y bitácora 24/7.',
    missionStatement: 'Detectar y escalar incidentes en minutos para que nadie se entere por el cliente.',
    dailyActions: [
      'Vigilar dashboards de uptime y alarmas',
      'Crear tickets de incidente y notificar al ingeniero on-call',
      'Llevar bitácora del turno',
    ],
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'NOC',
    flags: {
      ...baseField,
      accesoActividades: true,
    },
  },
];

export const ORG_ROLE_BY_KEY = Object.fromEntries(
  ORG_ROLE_TEMPLATES.map((t) => [t.orgRoleKey, t]),
) as Record<OrgRoleKey, OrgRoleTemplate>;

export function resolveOrgRoleKey(roleName?: string | null, orgRoleKey?: string | null): OrgRoleKey | null {
  if (orgRoleKey && orgRoleKey in ORG_ROLE_BY_KEY) return orgRoleKey as OrgRoleKey;
  const normalized = String(roleName || '').toLowerCase();
  if (/ceo|dueño|dueno|gerencia|superadmin/.test(normalized)) return ORG_ROLE_KEYS.CEO;
  if (/director.*admin|administrativ/.test(normalized)) return ORG_ROLE_KEYS.DIRECTOR_ADMIN;
  if (/director.*oper|operacion/.test(normalized)) return ORG_ROLE_KEYS.DIRECTOR_OPS;
  if (/director.*comer|comercial/.test(normalized)) return ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL;
  if (/gerente.*vent|sales manager/.test(normalized)) return ORG_ROLE_KEYS.SALES_MANAGER;
  if (/ejecutivo.*vent|vendedor/.test(normalized)) return ORG_ROLE_KEYS.SALES_REP;
  if (/jefe.*proyect|project manager/.test(normalized)) return ORG_ROLE_KEYS.PROJECT_MANAGER;
  if (/ingenier.*senior|senior/.test(normalized)) return ORG_ROLE_KEYS.SENIOR_ENGINEER;
  if (/ingenier/.test(normalized)) return ORG_ROLE_KEYS.FIELD_ENGINEER;
  if (/diseñ|design|marketing/.test(normalized)) return ORG_ROLE_KEYS.DESIGNER;
  if (/contador|contabil/.test(normalized)) return ORG_ROLE_KEYS.ACCOUNTANT;
  if (/rrhh|recursos humanos|rh/.test(normalized)) return ORG_ROLE_KEYS.HR_SPECIALIST;
  if (/almacen|warehouse/.test(normalized)) return ORG_ROLE_KEYS.WAREHOUSE_MANAGER;
  if (/comprador|procurement|compras/.test(normalized)) return ORG_ROLE_KEYS.PROCUREMENT_OFFICER;
  if (/mantenimiento|maintenance/.test(normalized)) return ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR;
  if (/soporte|support|helpdesk/.test(normalized)) return ORG_ROLE_KEYS.SUPPORT_AGENT;
  if (/jefe.*noc|noc.*lead|noc.*jef/.test(normalized)) return ORG_ROLE_KEYS.NOC_LEAD;
  if (/noc|monitor/.test(normalized)) return ORG_ROLE_KEYS.NOC_OPERATOR;
  if (/administrativ|backoffice/.test(normalized)) return ORG_ROLE_KEYS.ADMIN_STAFF;
  return null;
}

export function getOrgTier(orgRoleKey: OrgRoleKey | null, isSuperAdmin = false): number {
  if (isSuperAdmin) return ORG_TIER.EXECUTIVE;
  if (!orgRoleKey) return ORG_TIER.OPERATIVE;
  return ORG_ROLE_BY_KEY[orgRoleKey]?.nivelAutoridad ?? ORG_TIER.OPERATIVE;
}

const SALES_TEAM_LEAD_KEYS: OrgRoleKey[] = [
  ORG_ROLE_KEYS.CEO,
  ORG_ROLE_KEYS.DIRECTOR_ADMIN,
  ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL,
  ORG_ROLE_KEYS.SALES_MANAGER,
];

const OPS_TEAM_LEAD_KEYS: OrgRoleKey[] = [
  ORG_ROLE_KEYS.CEO,
  ORG_ROLE_KEYS.DIRECTOR_OPS,
  ORG_ROLE_KEYS.PROJECT_MANAGER,
  ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR,
  ORG_ROLE_KEYS.NOC_LEAD,
];

const WAREHOUSE_TEAM_LEAD_KEYS: OrgRoleKey[] = [
  ORG_ROLE_KEYS.CEO,
  ORG_ROLE_KEYS.DIRECTOR_ADMIN,
  ORG_ROLE_KEYS.WAREHOUSE_MANAGER,
];

export function isSalesTeamLeadOrgKey(orgRoleKey: OrgRoleKey | null): boolean {
  if (!orgRoleKey) return false;
  return SALES_TEAM_LEAD_KEYS.includes(orgRoleKey);
}

export function isOpsTeamLeadOrgKey(orgRoleKey: OrgRoleKey | null): boolean {
  if (!orgRoleKey) return false;
  return OPS_TEAM_LEAD_KEYS.includes(orgRoleKey);
}

export function isWarehouseTeamLeadOrgKey(orgRoleKey: OrgRoleKey | null): boolean {
  if (!orgRoleKey) return false;
  return WAREHOUSE_TEAM_LEAD_KEYS.includes(orgRoleKey);
}

/** Gerente comercial, director comercial o admin de plataforma — ve equipo completo en ventas. */
export function isSalesTeamLeadUser(user?: {
  isSuperAdmin?: boolean;
  permissions?: string[];
  orgRoleKey?: string | null;
  role?: string | null;
}): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  if (permissions.includes('console.admin')) return true;
  const key = resolveOrgRoleKey(user.role, user.orgRoleKey);
  return isSalesTeamLeadOrgKey(key);
}

export function isOpsTeamLeadUser(user?: {
  isSuperAdmin?: boolean;
  permissions?: string[];
  orgRoleKey?: string | null;
  role?: string | null;
}): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const key = resolveOrgRoleKey(user.role, user.orgRoleKey);
  return isOpsTeamLeadOrgKey(key);
}
