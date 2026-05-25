/** Espejo web de apps/api/src/common/org-roles.ts — roles organizacionales ERP. */

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

export type OrgRoleMeta = {
  orgRoleKey: OrgRoleKey;
  label: string;
  description: string;
  nivelAutoridad: number;
  departmentHint: string;
  panels: PanelSlug[];
};

export const ORG_ROLE_META: Record<OrgRoleKey, OrgRoleMeta> = {
  [ORG_ROLE_KEYS.CEO]: {
    orgRoleKey: ORG_ROLE_KEYS.CEO,
    label: 'Dueño / CEO',
    description: 'Acceso ejecutivo total.',
    nivelAutoridad: ORG_TIER.EXECUTIVE,
    departmentHint: 'Dirección General',
    panels: ['console', 'operacion', 'ventas', 'contabilidad', 'web', 'support', 'noc', 'people', 'lab'],
  },
  [ORG_ROLE_KEYS.DIRECTOR_ADMIN]: {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_ADMIN,
    label: 'Director Administrativo',
    description: 'RRHH, finanzas, inventario y administración.',
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Administración',
    panels: ['console', 'contabilidad', 'people', 'support'],
  },
  [ORG_ROLE_KEYS.DIRECTOR_OPS]: {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_OPS,
    label: 'Director Operativo',
    description: 'Operación de campo, activos y mantenimiento.',
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Operaciones',
    panels: ['operacion', 'console', 'noc', 'support', 'people'],
  },
  [ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL]: {
    orgRoleKey: ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL,
    label: 'Director Comercial',
    description: 'Estrategia comercial y pipeline.',
    nivelAutoridad: ORG_TIER.DIRECTOR,
    departmentHint: 'Ventas',
    panels: ['ventas', 'console', 'support', 'people'],
  },
  [ORG_ROLE_KEYS.SALES_MANAGER]: {
    orgRoleKey: ORG_ROLE_KEYS.SALES_MANAGER,
    label: 'Gerente de Ventas',
    description: 'Supervisión del equipo comercial.',
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Ventas',
    panels: ['ventas', 'support', 'people'],
  },
  [ORG_ROLE_KEYS.SALES_REP]: {
    orgRoleKey: ORG_ROLE_KEYS.SALES_REP,
    label: 'Ejecutivo de Ventas',
    description: 'Prospección y cotizaciones.',
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Ventas',
    panels: ['ventas', 'support', 'people'],
  },
  [ORG_ROLE_KEYS.PROJECT_MANAGER]: {
    orgRoleKey: ORG_ROLE_KEYS.PROJECT_MANAGER,
    label: 'Jefe de Proyectos',
    description: 'Coordinación de instalaciones.',
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Operaciones',
    panels: ['operacion', 'ventas', 'noc', 'support', 'people'],
  },
  [ORG_ROLE_KEYS.SENIOR_ENGINEER]: {
    orgRoleKey: ORG_ROLE_KEYS.SENIOR_ENGINEER,
    label: 'Ingeniero Senior',
    description: 'Instalaciones y revisión técnica.',
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Ingeniería de campo',
    panels: ['operacion', 'noc', 'support', 'people'],
  },
  [ORG_ROLE_KEYS.FIELD_ENGINEER]: {
    orgRoleKey: ORG_ROLE_KEYS.FIELD_ENGINEER,
    label: 'Ingeniero de Campo',
    description: 'Ejecución en sitio.',
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Ingeniería de campo',
    panels: ['operacion', 'support', 'people'],
  },
  [ORG_ROLE_KEYS.DESIGNER]: {
    orgRoleKey: ORG_ROLE_KEYS.DESIGNER,
    label: 'Diseñador / Marketing',
    description: 'Contenido web y material comercial.',
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Marketing',
    panels: ['web', 'ventas', 'support', 'people'],
  },
  [ORG_ROLE_KEYS.ADMIN_STAFF]: {
    orgRoleKey: ORG_ROLE_KEYS.ADMIN_STAFF,
    label: 'Personal Administrativo',
    description: 'Apoyo administrativo.',
    nivelAutoridad: ORG_TIER.OPERATIVE,
    departmentHint: 'Administración',
    panels: ['console', 'support', 'people'],
  },
  [ORG_ROLE_KEYS.ACCOUNTANT]: {
    orgRoleKey: ORG_ROLE_KEYS.ACCOUNTANT,
    label: 'Contador',
    description: 'Contabilidad y finanzas.',
    nivelAutoridad: ORG_TIER.MANAGER,
    departmentHint: 'Administración',
    panels: ['contabilidad', 'support', 'people'],
  },
  [ORG_ROLE_KEYS.HR_SPECIALIST]: {
    orgRoleKey: ORG_ROLE_KEYS.HR_SPECIALIST,
    label: 'Especialista RRHH',
    description: 'Recursos humanos y asistencia.',
    nivelAutoridad: ORG_TIER.SPECIALIST,
    departmentHint: 'Administración',
    panels: ['console', 'people', 'support'],
  },
};

export function resolveOrgRoleKey(roleName?: string | null, orgRoleKey?: string | null): OrgRoleKey | null {
  if (orgRoleKey && orgRoleKey in ORG_ROLE_META) return orgRoleKey as OrgRoleKey;
  const normalized = String(roleName || '').toLowerCase();
  if (/ceo|dueño|dueno|gerencia|superadmin/.test(normalized)) return ORG_ROLE_KEYS.CEO;
  if (/director.*admin|administrativ/.test(normalized)) return ORG_ROLE_KEYS.DIRECTOR_ADMIN;
  if (/director.*oper|operacion/.test(normalized)) return ORG_ROLE_KEYS.DIRECTOR_OPS;
  if (/director.*comer|comercial/.test(normalized)) return ORG_ROLE_KEYS.DIRECTOR_COMMERCIAL;
  if (/gerente.*vent|sales manager/.test(normalized)) return ORG_ROLE_KEYS.SALES_MANAGER;
  if (/ejecutivo.*vent|vendedor|panel ventas/.test(normalized)) return ORG_ROLE_KEYS.SALES_REP;
  if (/jefe.*proyect|project manager/.test(normalized)) return ORG_ROLE_KEYS.PROJECT_MANAGER;
  if (/ingenier.*senior|senior/.test(normalized)) return ORG_ROLE_KEYS.SENIOR_ENGINEER;
  if (/ingenier/.test(normalized)) return ORG_ROLE_KEYS.FIELD_ENGINEER;
  if (/diseñ|design|marketing/.test(normalized)) return ORG_ROLE_KEYS.DESIGNER;
  if (/contador|contabil/.test(normalized)) return ORG_ROLE_KEYS.ACCOUNTANT;
  if (/rrhh|recursos humanos|rh/.test(normalized)) return ORG_ROLE_KEYS.HR_SPECIALIST;
  if (/administrativ|backoffice|consola usuario/.test(normalized)) return ORG_ROLE_KEYS.ADMIN_STAFF;
  return null;
}

export function getOrgRoleLabel(roleName?: string | null, orgRoleKey?: string | null, isSuperAdmin = false): string {
  if (isSuperAdmin) return 'Dueño / CEO';
  const key = resolveOrgRoleKey(roleName, orgRoleKey);
  if (key) return ORG_ROLE_META[key].label;
  return '';
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

export const ORG_ROLE_OPTIONS = Object.values(ORG_ROLE_META).map((meta) => ({
  value: meta.orgRoleKey,
  label: meta.label,
  description: meta.description,
  departmentHint: meta.departmentHint,
}));
