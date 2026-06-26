/**
 * NEXARA · RBAC v2 (FRONTEND mirror)
 * -----------------------------------
 * Espejo de `apps/api/src/common/rbac/roles.v2.ts`.
 */
export const ROLES = {
  SUPER_ADMIN:        'super_admin',
  CEO:                'ceo',
  ARQUITECTO:         'arquitecto',
  DIR_OPERACIONES:    'dir_operaciones',
  DIR_ADMIN:          'dir_admin',
  COORD_ADMIN:        'coord_admin',
  ADMINISTRATIVO:     'administrativo',
  COORD_OPERACIONES:  'coord_operaciones',
  ING_CAMPO:          'ing_campo',
  ING_SOPORTE:        'ing_soporte',
  COORD_VENTAS:       'coord_ventas',
  VENDEDOR:           'vendedor',
  LIDER_DISENO:       'lider_diseno',
  DISENADOR:          'disenador',
  RH:                 'rh',
  CONTABILIDAD:       'contabilidad',
  CLIENTE:            'cliente',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: RoleKey[] = Object.values(ROLES);

export const ROLE_TIER: Record<RoleKey, number> = {
  super_admin: 999,
  ceo: 100,
  arquitecto: 85,
  dir_operaciones: 90,
  dir_admin: 90,
  coord_admin: 70,
  coord_operaciones: 70,
  coord_ventas: 70,
  lider_diseno: 65,
  rh: 60,
  contabilidad: 60,
  ing_soporte: 50,
  administrativo: 45,
  vendedor: 45,
  ing_campo: 40,
  disenador: 40,
  cliente: 10,
};

export type PanelKey = 'core' | 'sales' | 'ops' | 'studio' | 'portal';

export const ROLE_HOME_PANEL: Record<RoleKey, PanelKey> = {
  super_admin: 'core',
  ceo: 'core',
  arquitecto: 'ops',
  dir_operaciones: 'core',
  dir_admin: 'core',
  coord_admin: 'core',
  administrativo: 'core',
  rh: 'core',
  contabilidad: 'core',
  coord_operaciones: 'ops',
  ing_campo: 'ops',
  ing_soporte: 'ops',
  coord_ventas: 'sales',
  vendedor: 'sales',
  lider_diseno: 'studio',
  disenador: 'studio',
  cliente: 'portal',
};

export const ROLE_EXTRA_PANELS: Record<RoleKey, PanelKey[]> = {
  super_admin: ['core', 'sales', 'ops', 'studio', 'portal'],
  ceo: ['core', 'sales', 'ops', 'studio'],
  arquitecto: ['ops', 'core'],
  dir_operaciones: ['core', 'ops', 'sales'],
  dir_admin: ['core'],
  coord_admin: ['core'],
  administrativo: ['core'],
  rh: ['core'],
  contabilidad: ['core'],
  coord_operaciones: ['ops', 'core'],
  ing_campo: ['ops'],
  ing_soporte: ['ops', 'core'],
  coord_ventas: ['sales', 'core'],
  vendedor: ['sales'],
  lider_diseno: ['studio', 'core', 'sales'],
  disenador: ['studio', 'core', 'sales'],
  cliente: ['portal'],
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: 'Super Administrador',
  ceo: 'Director General',
  arquitecto: 'Arquitecto / Dir. Técnico',
  dir_operaciones: 'Director de Operaciones',
  dir_admin: 'Director Administrativo',
  coord_admin: 'Coordinador Administrativo',
  administrativo: 'Administrativo',
  coord_operaciones: 'Coordinador de Operaciones',
  ing_campo: 'Ingeniero de Campo',
  ing_soporte: 'Ingeniero de Soporte',
  coord_ventas: 'Coordinador de Ventas',
  vendedor: 'Vendedor',
  lider_diseno: 'Líder de Diseño',
  disenador: 'Diseñador',
  rh: 'Recursos Humanos',
  contabilidad: 'Contabilidad',
  cliente: 'Cliente',
};

/** Rutas de asistencia personal (check-in) para roles operativos. */
export const SELF_ATTENDANCE_PATHS = [
  '/erp/hr/attendance',
  '/erp/hr/lunch-breaks',
] as const;
