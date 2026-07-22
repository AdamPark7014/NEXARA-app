/** Espejo web de apps/api/src/common/org-roles.ts — roles organizacionales ERP. */
import {
  isTechnicalSuperAdmin,
  resolveIsPlatformOwner,
  type PlatformAccountUser,
} from '@/lib/platform-accounts';
export const ORG_ROLE_KEYS = {
  CEO: 'ceo',
  DIRECTOR_ADMIN: 'director_admin',
  DIRECTOR_OPS: 'director_ops',
  DIRECTOR_COMMERCIAL: 'director_commercial',
  SALES_MANAGER: 'sales_manager',
  SALES_REP: 'sales_rep',
  PROJECT_MANAGER: 'project_manager',
  ARQUITECTO: 'arquitecto',
  COORD_OPERACIONES: 'coord_operaciones',
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

/**
 * @deprecated Usar `PanelId` de `@/lib/access-matrix` para todo el código
 * nuevo. Este alias se mantiene SOLO porque `panel-urls.ts` lo re-exporta
 * y existen widgets legacy (PanelSwitcher) que aún lo consumen.
 */
export type PanelSlug =
  | 'console'
  | 'operacion'
  | 'ventas'
  | 'contabilidad'
  | 'web'
  | 'tickets'
  | 'support'
  | 'noc'
  | 'people'
  | 'lab';

/**
 * Metadatos canónicos de un rol corporativo.
 *
 * Importante: aquí NO listamos los paneles a los que tiene acceso — esa
 * información ya vive en `access-matrix.ts` (single source of truth) vía
 * el campo `allowedRoles` de cada `ModuleEntry`. Para resolver "qué paneles
 * ve este rol" usa `getAllowedPanels(role)` del access-matrix.
 */
export type OrgRoleMeta = {
  orgRoleKey: OrgRoleKey;
  label: string;
  description: string;
  missionStatement: string;
  dailyActions: string[];
  nivelAutoridad: number;
  departmentHint: string;
};

export const ORG_ROLE_META: Record<OrgRoleKey, OrgRoleMeta> = {
  [ORG_ROLE_KEYS.CEO]: {
    orgRoleKey: ORG_ROLE_KEYS.CEO,
    label: 'CEO',
    description: 'Acceso ejecutivo total.',
    missionStatement: 'Vista 360° del negocio: pipeline, operación, finanzas y personas.',
    dailyActions: [
      'Revisar KPIs ejecutivos y BI cross-módulo',
      'Aprobar oportunidades > $500k y presupuestos especiales',
      'Validar el margen real vs planeado por proyecto',
    ],
    nivelAutoridad: ORG_TIER.EXECUTIVE,
    departmentHint: 'Dirección General',
  },
  [ORG_ROLE_KEYS.DIRECTOR_ADMIN]: {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
    label: 'Director Administrativo',
    description: 'RRHH, finanzas, inventario y administración.',
    missionStatement: 'Mantener la salud financiera y operativa del backoffice.',
    dailyActions: [
      'Aprobar requisiciones de compra y viáticos',
      'Revisar flujo de caja, banca y facturas CXC/CXP',
      'Supervisar RH, nómina y asistencia',
    ],
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Administración',
  },
  [ORG_ROLE_KEYS.DIRECTOR_OPS]: {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_OPS,
    label: 'Director Operativo',
    description: 'Operación de campo, activos y mantenimiento.',
    missionStatement: 'Garantizar entrega de proyectos y cumplimiento SLA en campo.',
    dailyActions: [
      'Asignar ingenieros a proyectos comerciales aprobados',
      'Monitorear avance de OT por sucursal y tipo (CCTV, mantenimiento, auditoría)',
      'Aprobar evidencias críticas y revisar alertas NOC',
    ],
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Operaciones',
  },
  [ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL]: {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL,
    label: 'Director Comercial',
    description: 'Estrategia comercial y pipeline.',
    missionStatement: 'Hacer crecer ingresos y margen del pipeline tech (servicios + productos + proyectos).',
    dailyActions: [
      'Revisar pipeline kanban (Discovery → Closing) por ejecutivo',
      'Aprobar descuentos > 15% y contratos marco',
      'Pronóstico mensual y forecast vs cierre real',
    ],
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Ventas',
  },
  [ORG_ROLE_KEYS.SALES_MANAGER]: {
    orgRoleKey: ORG_ROLE_KEYS.SALES_MANAGER,
    label: 'Gerente de Ventas',
    description: 'Supervisión del equipo comercial.',
    missionStatement: 'Coordinar al equipo de ejecutivos y cerrar negocios complejos.',
    dailyActions: [
      'Coachear a ejecutivos en cuentas clave',
      'Revisar cotizaciones > $100k antes de enviarlas',
      'Garantizar handoff limpio a operación al cerrar',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Ventas',
  },
  [ORG_ROLE_KEYS.SALES_REP]: {
    orgRoleKey: ORG_ROLE_KEYS.SALES_REP,
    label: 'Ejecutivo de Ventas',
    description: 'Prospección y cotizaciones.',
    missionStatement: 'Convertir leads en proyectos cerrados (CCTV, auditoría, mantenimiento).',
    dailyActions: [
      'Capturar leads, actualizar oportunidades en el pipeline',
      'Cotizar desde catálogo (cámaras, switches, pantallas, mano de obra)',
      'Agendar visitas de levantamiento con ingenieros',
    ],
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Ventas',
  },
  [ORG_ROLE_KEYS.PROJECT_MANAGER]: {
    orgRoleKey: ORG_ROLE_KEYS.PROJECT_MANAGER,
    label: 'Jefe de Proyectos',
    description: 'Coordinación de instalaciones.',
    missionStatement: 'Entregar proyectos en tiempo, costo y calidad — ejemplo Polos del Bienestar.',
    dailyActions: [
      'Convertir proyecto de ventas en OTs por sitio',
      'Asignar ingenieros y materiales del almacén',
      'Sincronizar costos reales y avisar desviaciones',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Operaciones',
  },
  [ORG_ROLE_KEYS.ARQUITECTO]: {
    orgRoleKey: ORG_ROLE_KEYS.ARQUITECTO,
    label: 'Arquitecto',
    description: 'Diseño técnico de proyectos e ingeniería de soluciones.',
    missionStatement: 'Garantizar que cada proyecto tenga un diseño técnico sólido y viable antes de ejecutarse.',
    dailyActions: [
      'Revisar y validar levantamientos técnicos de campo',
      'Diseñar propuestas de ingeniería para cotizaciones complejas',
      'Supervisar plantilla del equipo de diseño y actividades asociadas',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Operaciones',
  },
  [ORG_ROLE_KEYS.COORD_OPERACIONES]: {
    orgRoleKey: ORG_ROLE_KEYS.COORD_OPERACIONES,
    label: 'Coordinador de Operaciones',
    description: 'Coordinación diaria de cuadrillas y actividades en campo.',
    missionStatement: 'Mantener la operación de campo fluida: asignación, seguimiento y cierre de OTs.',
    dailyActions: [
      'Asignar y dar seguimiento a actividades del día',
      'Aprobar viáticos y evidencias de su equipo',
      'Escalar incidencias críticas a Dirección de Operaciones',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Operaciones',
  },
  [ORG_ROLE_KEYS.SENIOR_ENGINEER]: {
    orgRoleKey: ORG_ROLE_KEYS.SENIOR_ENGINEER,
    label: 'Ingeniero Senior',
    description: 'Instalaciones y revisión técnica.',
    missionStatement: 'Llevar el liderazgo técnico en campo y validar trabajo de ingenieros junior.',
    dailyActions: [
      'Levantar sitios complejos (multi-sucursal, redes mixtas)',
      'Revisar evidencias de junior y aprobar cierre de OT',
      'Apoyar a ventas en cotizaciones técnicas',
    ],
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Ingeniería de campo',
  },
  [ORG_ROLE_KEYS.FIELD_ENGINEER]: {
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    label: 'Ingeniero de Campo',
    description: 'Ejecución en sitio.',
    missionStatement: 'Hacer realidad cada instalación, cambio de equipo o mantenimiento en sitio.',
    dailyActions: [
      'Ver "Mis actividades" del día (TOKS, Soriana, etc.)',
      'Subir evidencias y firmar hoja de servicio',
      'Comprobar viáticos y check-in GPS al llegar',
    ],
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Ingeniería de campo',
  },
  [ORG_ROLE_KEYS.DESIGNER]: {
    orgRoleKey: ORG_ROLE_KEYS.DESIGNER,
    label: 'Diseñador / Marketing',
    description: 'Contenido web y material comercial.',
    missionStatement: 'Construir la marca pública y dar arsenal visual a ventas.',
    dailyActions: [
      'Publicar casos de éxito y noticias en el sitio',
      'Generar fichas técnicas para cotizaciones premium',
      'Mantener catálogo público actualizado',
    ],
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Marketing',
  },
  [ORG_ROLE_KEYS.ADMIN_STAFF]: {
    orgRoleKey: ORG_ROLE_KEYS.ADMIN_STAFF,
    label: 'Personal Administrativo',
    description: 'Apoyo administrativo.',
    missionStatement: 'Mantener al día la documentación, asistencia y servicios internos.',
    dailyActions: [
      'Capturar asistencia y comidas del día',
      'Archivar documentos legales y contratos',
      'Apoyar a contador con captura de gastos',
    ],
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Administración',
  },
  [ORG_ROLE_KEYS.ACCOUNTANT]: {
    orgRoleKey: ORG_ROLE_KEYS.ACCOUNTANT,
    label: 'Contador',
    description: 'Contabilidad y finanzas.',
    missionStatement: 'Llevar la contabilidad limpia y timbrar facturas CFDI a tiempo.',
    dailyActions: [
      'Timbrar facturas borrador generadas desde órdenes de cierre',
      'Conciliar movimientos bancarios y registrar pagos',
      'Cerrar periodos contables y reportar a SAT',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Administración',
  },
  [ORG_ROLE_KEYS.HR_SPECIALIST]: {
    orgRoleKey: ORG_ROLE_KEYS.HR_SPECIALIST,
    label: 'Especialista RRHH',
    description: 'Recursos humanos y asistencia.',
    missionStatement: 'Cuidar al equipo: contratación, asistencia, evaluación y desarrollo.',
    dailyActions: [
      'Revisar CVs de candidatos y mover en el pipeline',
      'Aprobar vacaciones, permisos y registrar incidencias',
      'Gestionar alta/baja de usuarios en el sistema',
    ],
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Administración',
  },
  [ORG_ROLE_KEYS.WAREHOUSE_MANAGER]: {
    orgRoleKey: ORG_ROLE_KEYS.WAREHOUSE_MANAGER,
    label: 'Jefe de Almacén',
    description: 'Recepción, stock y salida de equipo.',
    missionStatement: 'Que ningún ingeniero llegue a sitio sin equipo y que el stock cuadre.',
    dailyActions: [
      'Recibir entregas de compras y validar contra OC',
      'Despachar equipos por OT (CCTV, switches, refacciones)',
      'Inventario cíclico y aviso de mínimos',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Almacén',
  },
  [ORG_ROLE_KEYS.PROCUREMENT_OFFICER]: {
    orgRoleKey: ORG_ROLE_KEYS.PROCUREMENT_OFFICER,
    label: 'Comprador',
    description: 'Requisiciones, OC y proveedores.',
    missionStatement: 'Conseguir el mejor equipo al mejor precio en el menor tiempo.',
    dailyActions: [
      'Procesar requisiciones aprobadas (por proyecto o stock mínimo)',
      'Generar OC y dar seguimiento a entrega',
      'Mantener catálogo de proveedores y precios',
    ],
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Compras',
  },
  [ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR]: {
    orgRoleKey: ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR,
    label: 'Coordinador de Mantenimiento',
    description: 'Contratos de servicio continuo y SLA.',
    missionStatement: 'Mantener vivos los contratos de mantenimiento (estilo TOKS) sin que se caiga ninguno.',
    dailyActions: [
      'Programar visitas preventivas mensuales por cliente',
      'Despachar OT correctivas dentro de SLA',
      'Renovar contratos antes de vencer',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Operaciones',
  },
  [ORG_ROLE_KEYS.SUPPORT_AGENT]: {
    orgRoleKey: ORG_ROLE_KEYS.SUPPORT_AGENT,
    label: 'Agente de Soporte',
    description: 'Helpdesk interno y triage de tickets.',
    missionStatement: 'Ser el primer contacto del cliente y resolver o escalar rápido.',
    dailyActions: [
      'Triage de tickets cliente (portal) y sucursales',
      'Asignar a NOC o ingeniero según urgencia',
      'Comunicar avance al cliente hasta cierre',
    ],
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Soporte',
  },
  [ORG_ROLE_KEYS.NOC_LEAD]: {
    orgRoleKey: ORG_ROLE_KEYS.NOC_LEAD,
    label: 'Jefe NOC',
    description: 'Coordinación del centro de monitoreo 24/7.',
    missionStatement: 'Detectar antes que el cliente: uptime de cámaras, POS, redes (estilo Soriana multi-sucursal).',
    dailyActions: [
      'Definir umbrales de alerta y políticas de escalamiento',
      'Asignar operadores por turno y revisar incidentes mayores',
      'Reportar disponibilidad mensual a clientes corporativos',
    ],
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'NOC',
  },
  [ORG_ROLE_KEYS.NOC_OPERATOR]: {
    orgRoleKey: ORG_ROLE_KEYS.NOC_OPERATOR,
    label: 'Operador NOC',
    description: 'Monitoreo en turno y atención de alertas.',
    missionStatement: 'Detectar y escalar incidentes en minutos para que nadie se entere por el cliente.',
    dailyActions: [
      'Vigilar dashboards de uptime y alarmas',
      'Crear tickets de incidente y notificar al ingeniero on-call',
      'Llevar bitácora del turno',
    ],
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'NOC',
  },
};

function orgRoleKeyFromV2Local(v2Key: string): OrgRoleKey | null {
  switch (v2Key) {
    case 'super_admin':
    case 'ceo':
      return ORG_ROLE_KEYS.CEO;
    case 'arquitecto':
      return ORG_ROLE_KEYS.ARQUITECTO;
    case 'dir_admin':
      return ORG_ROLE_KEYS.DIRECTOR_ADMIN;
    case 'dir_operaciones':
      return ORG_ROLE_KEYS.DIRECTOR_OPS;
    case 'coord_ventas':
      return ORG_ROLE_KEYS.SALES_MANAGER;
    case 'vendedor':
      return ORG_ROLE_KEYS.SALES_REP;
    case 'coord_operaciones':
      return ORG_ROLE_KEYS.COORD_OPERACIONES;
    case 'ing_campo':
      return ORG_ROLE_KEYS.FIELD_ENGINEER;
    case 'ing_soporte':
      return ORG_ROLE_KEYS.SUPPORT_AGENT;
    case 'lider_diseno':
    case 'disenador':
      return ORG_ROLE_KEYS.DESIGNER;
    case 'administrativo':
      return ORG_ROLE_KEYS.ADMIN_STAFF;
    case 'contabilidad':
      return ORG_ROLE_KEYS.ACCOUNTANT;
    case 'rh':
      return ORG_ROLE_KEYS.HR_SPECIALIST;
    case 'coord_admin':
      return ORG_ROLE_KEYS.ADMIN_STAFF;
    default:
      return null;
  }
}

export function resolveOrgRoleKey(roleName?: string | null, orgRoleKey?: string | null): OrgRoleKey | null {
  if (orgRoleKey) {
    if (orgRoleKey in ORG_ROLE_META) return orgRoleKey as OrgRoleKey;
    const fromV2 = orgRoleKeyFromV2Local(orgRoleKey);
    if (fromV2) return fromV2;
  }

  const normalized = String(roleName || '').toLowerCase();
  if (/ceo|dueño|dueno|gerencia|superadmin/.test(normalized)) return ORG_ROLE_KEYS.CEO;
  if (/arquitecto|director.*t[eé]cnic/.test(normalized)) return ORG_ROLE_KEYS.ARQUITECTO;
  if (/director.*admin/.test(normalized)) return ORG_ROLE_KEYS.DIRECTOR_ADMIN;
  if (/coordinador.*admin/.test(normalized)) return ORG_ROLE_KEYS.ADMIN_STAFF;
  if (/^administrativ|personal administrativ/.test(normalized)) return ORG_ROLE_KEYS.ADMIN_STAFF;
  if (/director.*oper|operacion/.test(normalized)) return ORG_ROLE_KEYS.DIRECTOR_OPS;
  if (/coordinador.*oper|coord.*operacion/.test(normalized)) return ORG_ROLE_KEYS.COORD_OPERACIONES;
  if (/director.*comer|comercial/.test(normalized)) return ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL;
  if (/gerente.*vent|sales manager|coordinador.*vent/.test(normalized)) return ORG_ROLE_KEYS.SALES_MANAGER;
  if (/ejecutivo.*vent|vendedor|panel ventas/.test(normalized)) return ORG_ROLE_KEYS.SALES_REP;
  if (/jefe.*proyect|project manager/.test(normalized)) return ORG_ROLE_KEYS.PROJECT_MANAGER;
  if (/ingenier.*senior|senior/.test(normalized)) return ORG_ROLE_KEYS.SENIOR_ENGINEER;
  if (/ingenier.*soporte|soporte t[eé]cnico/.test(normalized)) return ORG_ROLE_KEYS.SUPPORT_AGENT;
  if (/ingenier/.test(normalized)) return ORG_ROLE_KEYS.FIELD_ENGINEER;
  if (/l[ií]der.*dise|lider_diseno/.test(normalized)) return ORG_ROLE_KEYS.DESIGNER;
  if (/diseñ|design|marketing|redes/.test(normalized)) return ORG_ROLE_KEYS.DESIGNER;
  if (/contador|contabil/.test(normalized)) return ORG_ROLE_KEYS.ACCOUNTANT;
  if (/rrhh|recursos humanos|rh/.test(normalized)) return ORG_ROLE_KEYS.HR_SPECIALIST;
  if (/almacen|warehouse/.test(normalized)) return ORG_ROLE_KEYS.WAREHOUSE_MANAGER;
  if (/comprador|procurement|compras/.test(normalized)) return ORG_ROLE_KEYS.PROCUREMENT_OFFICER;
  if (/mantenimiento|maintenance/.test(normalized)) return ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR;
  if (/soporte|support|helpdesk/.test(normalized)) return ORG_ROLE_KEYS.SUPPORT_AGENT;
  if (/jefe.*noc|noc.*lead|noc.*jef/.test(normalized)) return ORG_ROLE_KEYS.NOC_LEAD;
  if (/noc|monitor/.test(normalized)) return ORG_ROLE_KEYS.NOC_OPERATOR;
  if (/backoffice|consola usuario/.test(normalized)) return ORG_ROLE_KEYS.ADMIN_STAFF;
  return null;
}

export function getOrgRoleLabel(
  roleName?: string | null,
  orgRoleKey?: string | null,
  isSuperAdmin = false,
  ctx?: PlatformAccountUser,
): string {
  const account = { isSuperAdmin, ...ctx };
  if (resolveIsPlatformOwner(account)) return 'CEO';
  if (isTechnicalSuperAdmin(account)) return 'Super Admin · Desarrollador';
  const key = resolveOrgRoleKey(roleName, orgRoleKey);
  if (key) return ORG_ROLE_META[key].label;
  return '';
}

export function getOrgRoleMeta(
  roleName?: string | null,
  orgRoleKey?: string | null,
  isSuperAdmin = false,
  ctx?: PlatformAccountUser,
): OrgRoleMeta | null {
  const account = { isSuperAdmin, ...ctx };
  if (resolveIsPlatformOwner(account)) return ORG_ROLE_META[ORG_ROLE_KEYS.CEO];
  if (isTechnicalSuperAdmin(account)) {
    const key = resolveOrgRoleKey(roleName, orgRoleKey);
    return key ? ORG_ROLE_META[key] : null;
  }
  const key = resolveOrgRoleKey(roleName, orgRoleKey);
  return key ? ORG_ROLE_META[key] : null;
}

export function getOrgTier(orgRoleKey: OrgRoleKey | null, isSuperAdmin = false): number {
  if (isSuperAdmin) return ORG_TIER.EXECUTIVE;
  if (!orgRoleKey) return ORG_TIER.OPERATIVE;
  return ORG_ROLE_META[orgRoleKey]?.nivelAutoridad ?? ORG_TIER.OPERATIVE;
}

export function isDirectorTier(orgRoleKey: OrgRoleKey | null, isSuperAdmin = false): boolean {
  return getOrgTier(orgRoleKey, isSuperAdmin) >= ORG_TIER.DIRECTOR;
}

export function isFieldRole(orgRoleKey: OrgRoleKey | null): boolean {
  return orgRoleKey === ORG_ROLE_KEYS.FIELD_ENGINEER || orgRoleKey === ORG_ROLE_KEYS.SENIOR_ENGINEER;
}

export function isSalesRole(orgRoleKey: OrgRoleKey | null): boolean {
  return (
    orgRoleKey === ORG_ROLE_KEYS.SALES_REP ||
    orgRoleKey === ORG_ROLE_KEYS.SALES_MANAGER ||
    orgRoleKey === ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL
  );
}

export function isWarehouseRole(orgRoleKey: OrgRoleKey | null): boolean {
  return orgRoleKey === ORG_ROLE_KEYS.WAREHOUSE_MANAGER || orgRoleKey === ORG_ROLE_KEYS.PROCUREMENT_OFFICER;
}

export function isNocRole(orgRoleKey: OrgRoleKey | null): boolean {
  return orgRoleKey === ORG_ROLE_KEYS.NOC_LEAD || orgRoleKey === ORG_ROLE_KEYS.NOC_OPERATOR;
}

export function isSupportRole(orgRoleKey: OrgRoleKey | null): boolean {
  return orgRoleKey === ORG_ROLE_KEYS.SUPPORT_AGENT || orgRoleKey === ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR;
}

export const ORG_ROLE_OPTIONS = Object.values(ORG_ROLE_META).map((meta) => ({
  value: meta.orgRoleKey,
  label: meta.label,
  description: meta.description,
  departmentHint: meta.departmentHint,
}));

/** Agrupar roles por departamento para selectores. */
export const ORG_ROLE_GROUPS: Array<{ department: string; roles: OrgRoleMeta[] }> = (() => {
  const groups = new Map<string, OrgRoleMeta[]>();
  for (const meta of Object.values(ORG_ROLE_META)) {
    const list = groups.get(meta.departmentHint) || [];
    list.push(meta);
    groups.set(meta.departmentHint, list);
  }
  const order = ['Dirección General', 'Ventas', 'Operaciones', 'Ingeniería de campo', 'NOC', 'Soporte', 'Almacén', 'Compras', 'Administración', 'Marketing'];
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([department, roles]) => ({
      department,
      roles: roles.sort((x, y) => y.nivelAutoridad - x.nivelAutoridad),
    }));
})();
