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

/** Cuenta de pruebas (Claudia Bernal): mismos permisos que el CEO, pero no es empleada. */
export const TESTER_CEO_EMAIL = 'claudia.bernal@nexara.com.mx';
/** Cuenta demo para la revisión de las tiendas de apps. */
export const STORE_REVIEWER_EMAIL = 'play.review@nexara.com.mx';

/** Quienes se comportan como el CEO en las reglas por correo (Christian y su cuenta de pruebas). */
export const CEO_EQUIVALENT_EMAILS: readonly string[] = [PLATFORM_OWNER_EMAIL, TESTER_CEO_EMAIL];

export function isCeoEquivalentEmail(email?: string | null): boolean {
  return CEO_EQUIVALENT_EMAILS.includes(normalizePlatformEmail(email));
}

/**
 * Cuentas que NO son empleados: nunca aparecen en la pizarra, en «asignar a», en asistencia ni en
 * comidas (ni como pendientes). Christian (CEO), Adam (desarrollo), Claudia (pruebas) y la cuenta demo.
 */
export const NON_EMPLOYEE_EMAILS: readonly string[] = [
  PLATFORM_OWNER_EMAIL,
  PLATFORM_DEVELOPER_EMAIL,
  TESTER_CEO_EMAIL,
  STORE_REVIEWER_EMAIL,
];

export function isNonEmployeeEmail(email?: string | null): boolean {
  return NON_EMPLOYEE_EMAILS.includes(normalizePlatformEmail(email));
}

/** Acceso técnico total (API/JWT) — dueño + desarrollador. */
export function isSuperAdminEmail(email?: string | null): boolean {
  const normalized = normalizePlatformEmail(email);
  return PLATFORM_SUPER_ADMIN_EMAILS.includes(normalized as (typeof PLATFORM_SUPER_ADMIN_EMAILS)[number]);
}
