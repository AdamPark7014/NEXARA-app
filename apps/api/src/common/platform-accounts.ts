/** Cuentas de plataforma NEXARA — dueño vs desarrollador técnico. */

export const PLATFORM_OWNER_EMAIL = 'gerencia@nexara.com.mx';
export const PLATFORM_DEVELOPER_EMAIL = 'developer@nexara.com.mx';

export const PLATFORM_SUPER_ADMIN_EMAILS = [
  PLATFORM_OWNER_EMAIL,
  PLATFORM_DEVELOPER_EMAIL,
] as const;

export function normalizePlatformEmail(email?: string | null): string {
  return email?.trim().toLowerCase() ?? '';
}

export function isPlatformOwnerEmail(email?: string | null): boolean {
  return normalizePlatformEmail(email) === PLATFORM_OWNER_EMAIL;
}

export function isDeveloperSuperAdminEmail(email?: string | null): boolean {
  return normalizePlatformEmail(email) === PLATFORM_DEVELOPER_EMAIL;
}

/** Acceso técnico total (API/JWT) — dueño + desarrollador. */
export function isSuperAdminEmail(email?: string | null): boolean {
  const normalized = normalizePlatformEmail(email);
  return PLATFORM_SUPER_ADMIN_EMAILS.includes(normalized as (typeof PLATFORM_SUPER_ADMIN_EMAILS)[number]);
}
