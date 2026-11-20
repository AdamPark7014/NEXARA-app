/** Cuentas de plataforma NEXARA — dueño vs desarrollador técnico. */

export const PLATFORM_OWNER_EMAIL = 'gerencia@nexara.com.mx';
export const PLATFORM_DEVELOPER_EMAIL = 'developer@nexara.com.mx';
export const CLAUDIA_TESTER_EMAIL = 'claudia.bernal@nexara.com.mx';
export const PLAY_REVIEW_EMAIL = 'play.review@nexara.com.mx';
/** Getzemani Del Valle (Dirección General, 17-11-2026): hace todo lo del CEO y no es personal operativo. */
export const DIRECCION_GENERAL_EMAIL = 'getzemani.delvalle@nexara.com.mx';

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
  DIRECCION_GENERAL_EMAIL,
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
  DIRECCION_GENERAL_EMAIL,
  PLATFORM_DEVELOPER_EMAIL,
  CLAUDIA_TESTER_EMAIL,
  PLAY_REVIEW_EMAIL,
]);

export function isNonEmployeeEmail(email?: string | null): boolean {
  return NON_EMPLOYEE_EMAILS.has(normalizePlatformEmail(email));
}

/**
 * Quien supervisa sin llevar actividades propias: dirección/plataforma
 * (`isNonEmployeeEmail`) o el rol de RH (Tere). Siguen en asistencia, nómina
 * y expediente; no salen en pizarra, asignables ni KPIs de actividades.
 */
export function sinActividades(user: {
  email?: string | null;
  roleKey?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (isNonEmployeeEmail(user.email)) return true;
  return String(user.roleKey ?? "").trim().toLowerCase() === "rh";
}

/** Liz: tiene actividades y checa, pero no se mide en KPIs / Desempeño. */
export const COORD_ADMIN_KPI_EMAIL = "lizeth.antonio@nexara.com.mx";

/**
 * Externos y dirección: no salen en KPIs / Desempeño.
 * Tere (rh) y Liz (coord_admin). Liz sí tiene actividades; solo no se mide.
 */
export function noSeMide(user: {
  email?: string | null;
  roleKey?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (isNonEmployeeEmail(user.email)) return true;
  const rol = String(user.roleKey ?? "").trim().toLowerCase();
  if (rol === "rh" || rol === "coord_admin") return true;
  return normalizePlatformEmail(user.email) === COORD_ADMIN_KPI_EMAIL;
}

/**
 * Quién no registra checada: dirección/plataforma y RH (Tere).
 * Liz (coord_admin) sí checa.
 */
export function sinChecador(user: {
  email?: string | null;
  roleKey?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (isNonEmployeeEmail(user.email)) return true;
  return String(user.roleKey ?? "").trim().toLowerCase() === "rh";
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
