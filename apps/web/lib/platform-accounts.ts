/** Cuentas de plataforma NEXARA — dueño vs desarrollador técnico. */

export const PLATFORM_OWNER_EMAIL = 'gerencia@nexara.com.mx';
export const PLATFORM_DEVELOPER_EMAIL = 'developer@nexara.com.mx';
export const CLAUDIA_TESTER_EMAIL = 'claudia.bernal@nexara.com.mx';
export const PLAY_REVIEW_EMAIL = 'play.review@nexara.com.mx';

export function normalizePlatformEmail(email?: string | null): string {
  return email?.trim().toLowerCase() ?? '';
}

/**
 * Claudia (tester) debe tener EXACTAMENTE los mismos permisos que Christian
 * (dueño de la plataforma / CEO), sin aparecer como empleada. Cualquier
 * decisión de permisos que antes comparaba contra gerencia@ directo debe
 * usar este set/helper en su lugar.
 */
export const CEO_EQUIVALENT_EMAILS: ReadonlySet<string> = new Set([
  PLATFORM_OWNER_EMAIL,
  CLAUDIA_TESTER_EMAIL,
]);

export function isCeoEquivalentEmail(email?: string | null): boolean {
  return CEO_EQUIVALENT_EMAILS.has(normalizePlatformEmail(email));
}

export function isPlatformOwnerEmail(email?: string | null): boolean {
  return normalizePlatformEmail(email) === PLATFORM_OWNER_EMAIL;
}

export function isDeveloperSuperAdminEmail(email?: string | null): boolean {
  return normalizePlatformEmail(email) === PLATFORM_DEVELOPER_EMAIL;
}

/**
 * Cuentas de plataforma / pruebas que NUNCA deben listarse como empleados
 * (equipo, pizarra, pickers de "asignar a", listas de asistencia/comida).
 * Christian y Adam siguen operando la plataforma; Claudia es tester; el
 * cuarto correo es la cuenta demo de revisión de tiendas.
 */
export const NON_EMPLOYEE_EMAILS: ReadonlySet<string> = new Set([
  PLATFORM_OWNER_EMAIL,
  PLATFORM_DEVELOPER_EMAIL,
  CLAUDIA_TESTER_EMAIL,
  PLAY_REVIEW_EMAIL,
]);

export function isNonEmployeeEmail(email?: string | null): boolean {
  return NON_EMPLOYEE_EMAILS.has(normalizePlatformEmail(email));
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
  return Boolean(user.isPlatformOwner ?? isCeoEquivalentEmail(user.email));
}
