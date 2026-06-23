/**
 * NEXARA · RBAC v2 — Catálogo único de roles organizacionales
 * ------------------------------------------------------------
 * Una empresa de servicios tech (CCTV, redes, cableado, mantenimiento)
 * + venta (licitaciones públicas/privadas, retail, gobierno, residencial).
 *
 * Esta es la ÚNICA fuente de verdad de roles. Reemplaza a:
 *   - los 27 flags booleanos `acceso*` del modelo Role (legacy)
 *   - la matriz dispersa de `org-roles.ts` (legacy, eliminar)
 *   - la mezcla de `superadmin / admin / vendedor / ingeniero` (legacy)
 *
 * Reglas:
 *   - Un usuario tiene EXACTAMENTE 1 rol (`User.role`).
 *   - El rol determina: panel(es) accesibles, permisos, URLs permitidas y
 *     nivel jerárquico para aprobaciones.
 *   - SUPER_ADMIN es bypass total — uso exclusivo del equipo de desarrollo.
 */

export const ROLES = {
  SUPER_ADMIN:        'super_admin',        // Desarrollo · bypass total
  CEO:                'ceo',                // Dirección general · lectura total
  ARQUITECTO:         'arquitecto',         // Arquitecto / Director Técnico · valida trabajos
  DIR_OPERACIONES:    'dir_operaciones',    // Director de Operaciones
  DIR_ADMIN:          'dir_admin',          // Director Administrativo
  COORD_ADMIN:        'coord_admin',        // Coordinador Administrativo (mid-senior)
  ADMINISTRATIVO:     'administrativo',     // Administrativo (junior)
  COORD_OPERACIONES:  'coord_operaciones',  // Coordinador de campo / Project Manager
  ING_CAMPO:          'ing_campo',          // Ingeniero de Campo
  ING_SOPORTE:        'ing_soporte',        // Soporte técnico / NOC
  COORD_VENTAS:       'coord_ventas',       // Gerente Comercial
  VENDEDOR:           'vendedor',           // Ejecutivo de ventas
  LIDER_DISENO:       'lider_diseno',       // Líder de diseño / marketing
  DISENADOR:          'disenador',          // Diseñador / Community manager
  RH:                 'rh',                 // Recursos Humanos
  CONTABILIDAD:       'contabilidad',       // Contador / facturación
  CLIENTE:            'cliente',            // Cliente externo (portal tickets)
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: RoleKey[] = Object.values(ROLES);

/** Tier jerárquico — usado para aprobaciones y herencia visual. */
export const ROLE_TIER: Record<RoleKey, number> = {
  super_admin:        999,
  ceo:                100,
  arquitecto:         85,   // Valida trabajos; entre CEO y coordinadores
  dir_operaciones:    90,
  dir_admin:          90,
  coord_admin:        70,
  coord_operaciones:  70,
  coord_ventas:       70,
  lider_diseno:       65,
  rh:                 60,
  contabilidad:       60,
  ing_soporte:        50,
  administrativo:     45,
  vendedor:           45,
  ing_campo:          40,
  disenador:          40,
  cliente:            10,
};

/** Panel/subdominio "HOME" donde aterriza el usuario al entrar. */
export type PanelKey = 'core' | 'sales' | 'ops' | 'studio' | 'portal';

export const ROLE_HOME_PANEL: Record<RoleKey, PanelKey> = {
  super_admin:        'core',
  ceo:                'core',
  arquitecto:         'ops',
  dir_operaciones:    'core',
  dir_admin:          'core',
  coord_admin:        'core',
  administrativo:     'core',
  rh:                 'core',
  contabilidad:       'core',
  coord_operaciones:  'ops',
  ing_campo:          'ops',
  ing_soporte:        'ops',
  coord_ventas:       'sales',
  vendedor:           'sales',
  lider_diseno:       'studio',
  disenador:          'studio',
  cliente:            'portal',
};

/** Paneles adicionales accesibles (además del HOME). */
export const ROLE_EXTRA_PANELS: Record<RoleKey, PanelKey[]> = {
  super_admin:        ['core', 'sales', 'ops', 'studio', 'portal'],
  ceo:                ['core', 'sales', 'ops', 'studio'], // ve todo (lectura)
  arquitecto:         ['ops', 'core'],   // OPS supervisor + ERP parcial
  dir_operaciones:    ['core', 'ops', 'sales'],
  dir_admin:          ['core'],
  coord_admin:        ['core'],
  administrativo:     ['core'],
  rh:                 ['core'],
  contabilidad:       ['core'],
  coord_operaciones:  ['ops', 'core'],
  ing_campo:          ['ops'],
  ing_soporte:        ['ops', 'core'],
  coord_ventas:       ['sales', 'core'],
  vendedor:           ['sales'],
  lider_diseno:       ['studio', 'core'],
  disenador:          ['studio'],
  cliente:            ['portal'],
};

/** Labels para UI. */
export const ROLE_LABELS: Record<RoleKey, { es: string; en: string; departamento: string }> = {
  super_admin:       { es: 'Super Administrador',  en: 'Super Admin',           departamento: 'Sistemas' },
  ceo:               { es: 'Director General',     en: 'CEO',                   departamento: 'Dirección' },
  arquitecto:        { es: 'Arquitecto / Dir. Técnico', en: 'Technical Director', departamento: 'Operaciones' },
  dir_operaciones:   { es: 'Director de Operaciones', en: 'Operations Director', departamento: 'Operaciones' },
  dir_admin:         { es: 'Director Administrativo', en: 'Admin Director',     departamento: 'Administración' },
  coord_admin:       { es: 'Coordinador Administrativo', en: 'Admin Coordinator', departamento: 'Administración' },
  administrativo:    { es: 'Administrativo',       en: 'Admin Staff',           departamento: 'Administración' },
  coord_operaciones: { es: 'Coordinador de Operaciones', en: 'Operations Coordinator', departamento: 'Operaciones' },
  ing_campo:         { es: 'Ingeniero de Campo',   en: 'Field Engineer',        departamento: 'Operaciones' },
  ing_soporte:       { es: 'Ingeniero de Soporte', en: 'Support Engineer',      departamento: 'Soporte' },
  coord_ventas:      { es: 'Coordinador de Ventas', en: 'Sales Coordinator',    departamento: 'Comercial' },
  vendedor:          { es: 'Vendedor',             en: 'Sales Rep',             departamento: 'Comercial' },
  lider_diseno:      { es: 'Líder de Diseño',      en: 'Design Lead',           departamento: 'Marketing' },
  disenador:         { es: 'Diseñador',            en: 'Designer',              departamento: 'Marketing' },
  rh:                { es: 'Recursos Humanos',     en: 'HR',                    departamento: 'Recursos Humanos' },
  contabilidad:      { es: 'Contabilidad',         en: 'Accounting',            departamento: 'Finanzas' },
  cliente:           { es: 'Cliente',              en: 'Client',                departamento: 'Externo' },
};

/** Mapeo legacy → v2 (para migración de usuarios existentes). */
export const LEGACY_TO_V2: Record<string, RoleKey> = {
  arquitecto:           'arquitecto',
  // legacy booleans / roles antiguos
  superadmin:           'super_admin',
  admin:                'dir_admin',
  ingeniero:            'ing_campo',
  vendedor:             'vendedor',
  // org-roles legacy
  ceo:                  'ceo',
  director_admin:       'dir_admin',
  director_ops:         'dir_operaciones',
  director_commercial:  'coord_ventas',
  sales_manager:        'coord_ventas',
  sales_rep:            'vendedor',
  project_manager:      'coord_operaciones',
  senior_engineer:      'ing_soporte',
  field_engineer:       'ing_campo',
  designer:             'disenador',
  admin_staff:          'administrativo',
  accountant:           'contabilidad',
  hr_specialist:        'rh',
  warehouse_manager:    'coord_admin',
  procurement_officer:  'coord_admin',
  maintenance_coordinator: 'coord_operaciones',
  support_agent:        'ing_soporte',
  noc_lead:             'ing_soporte',
  noc_operator:         'ing_soporte',
};

export function tier(role: RoleKey): number {
  return ROLE_TIER[role] ?? 0;
}

export function canApproveAt(role: RoleKey, requiredTier: number): boolean {
  return tier(role) >= requiredTier;
}
