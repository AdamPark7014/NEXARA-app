export const PERMISSIONS = {
  CONSOLE_ACCESS: 'console.access',
  CONSOLE_ADMIN: 'console.admin',
  PANEL_WEB: 'panel.web',
  PANEL_VENTAS: 'panel.ventas',
  ACTIVITIES_VIEW: 'activities.view',
  ACTIVITIES_MANAGE: 'activities.manage',
  ACTIVITIES_EXPORT: 'activities.export',
  EVIDENCES_VIEW: 'evidences.view',
  EVIDENCES_CREATE: 'evidences.create',
  EVIDENCES_REVIEW: 'evidences.review',
  VIATICS_VIEW: 'viatics.view',
  VIATICS_CREATE: 'viatics.create',
  VIATICS_MANAGE: 'viatics.manage',
  VIATICS_EXPORT: 'viatics.export',
  VIATICS_IMPORT: 'viatics.import',
  VEHICLES_VIEW: 'vehicles.view',
  VEHICLES_REQUEST: 'vehicles.request',
  VEHICLES_REVIEW: 'vehicles.review',
  VEHICLES_INVENTORY: 'vehicles.inventory',
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MANAGE: 'attendance.manage',
  GPS_VIEW: 'gps.view',
  GPS_MANAGE: 'gps.manage',
  USERS_MANAGE: 'users.manage',
  USERS_REVIEW: 'users.review',
  CONTABILIDAD_VIEW: 'contabilidad.view',
  CONTABILIDAD_MANAGE: 'contabilidad.manage',
  COTIZACIONES_ACCESS: 'cotizaciones.access',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export type UserPermissions = {
  isSuperAdmin?: boolean;
  permissions?: string[];
};

export const hasPermission = (user: UserPermissions | null | undefined, permission: string) => {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return Boolean(user.permissions?.includes(permission));
};

export const hasAnyPermission = (user: UserPermissions | null | undefined, permissions: string[]) => {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return permissions.some((permission) => user.permissions?.includes(permission));
};
