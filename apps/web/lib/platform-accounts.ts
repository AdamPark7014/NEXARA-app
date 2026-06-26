/** Cuentas de plataforma NEXARA — dueño vs desarrollador técnico. */

export const PLATFORM_OWNER_EMAIL = 'gerencia@nexara.com.mx';
export const PLATFORM_DEVELOPER_EMAIL = 'developer@nexara.com.mx';

export function normalizePlatformEmail(email?: string | null): string {
  return email?.trim().toLowerCase() ?? '';
}

export function isPlatformOwnerEmail(email?: string | null): boolean {
  return normalizePlatformEmail(email) === PLATFORM_OWNER_EMAIL;
}

export function isDeveloperSuperAdminEmail(email?: string | null): boolean {
  return normalizePlatformEmail(email) === PLATFORM_DEVELOPER_EMAIL;
}

export type PlatformAccountUser = {
  isSuperAdmin?: boolean;
  isPlatformOwner?: boolean;
  email?: string | null;
};

export function isTechnicalSuperAdmin(user: PlatformAccountUser): boolean {
  if (!user.isSuperAdmin) return false;
  if (user.isPlatformOwner) return false;
  return isDeveloperSuperAdminEmail(user.email);
}

export function resolveIsPlatformOwner(user: PlatformAccountUser): boolean {
  return Boolean(user.isPlatformOwner ?? isPlatformOwnerEmail(user.email));
}
