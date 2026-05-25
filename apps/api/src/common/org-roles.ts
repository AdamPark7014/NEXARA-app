/** Claves canónicas de roles organizacionales — ERP servicios IT/CCTV. */
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
  nivelAutoridad: number;
  departmentHint: string;
  panels: Array<'console' | 'operacion' | 'ventas' | 'contabilidad' | 'web'>;
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
    nombre: 'Dueño / CEO',
    label: 'Dueño / CEO',
    description: 'Acceso ejecutivo total a todos los paneles y módulos.',
    nivelAutoridad: ORG_TIER.EXECUTIVE,
    departmentHint: 'Dirección General',
    panels: ['console', 'operacion', 'ventas', 'contabilidad', 'web'],
    flags: allTrue(),
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
    nombre: 'Director Administrativo',
    label: 'Director Administrativo',
    description: 'RRHH, finanzas, inventario, compras y administración corporativa.',
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Administración',
    panels: ['console', 'contabilidad'],
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
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_OPS,
    nombre: 'Director Operativo',
    label: 'Director Operativo',
    description: 'Operación de campo, instalaciones, activos, GPS y mantenimiento.',
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Operaciones',
    panels: ['operacion', 'console'],
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
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Ventas',
    panels: ['ventas', 'console'],
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
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Ventas',
    panels: ['ventas'],
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
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Ventas',
    panels: ['ventas'],
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
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Operaciones',
    panels: ['operacion', 'ventas'],
    flags: {
      ...baseField,
      accesoActividades: true,
      accesoEvidencias: true,
      accesoViaticos: true,
      accesoClientes: true,
      accesoCatalogo: true,
      accesoPanelVentas: true,
    },
  },
  {
    orgRoleKey: ORG_ROLE_KEYS.SENIOR_ENGINEER,
    nombre: 'Ingeniero Senior',
    label: 'Ingeniero Senior',
    description: 'Instalaciones complejas, revisión de evidencias y soporte técnico.',
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Ingeniería de campo',
    panels: ['operacion'],
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
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Ingeniería de campo',
    panels: ['operacion'],
    flags: {
      ...baseField,
      accesoActividades: false,
      accesoEvidencias: false,
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
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Marketing',
    panels: ['web', 'ventas'],
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
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Administración',
    panels: ['console'],
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
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Administración',
    panels: ['contabilidad'],
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
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Administración',
    panels: ['console'],
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

export function isSalesTeamLeadOrgKey(orgRoleKey: OrgRoleKey | null): boolean {
  if (!orgRoleKey) return false;
  return SALES_TEAM_LEAD_KEYS.includes(orgRoleKey);
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
