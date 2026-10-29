/**
 * Quién usa el Diseñador de videovigilancia (`docs/DISENADOR-CCTV.md` §8).
 *
 * Regla de Adam (29-10-2026): los encargados de área y el arquitecto sí; los ingenieros de soporte
 * y los instaladores no; el encargado de instalación (David) y el de soporte (José Antonio) sí.
 *
 * José Antonio comparte rol (`ing_soporte`) con su equipo, así que el rol no basta: lo que lo
 * distingue es tener gente a su cargo (`managerId`, el mismo criterio de `esJefe()` en
 * `me/equipo-alcance.ts`). Esa regla vale también para RH, contabilidad y el líder de diseño si
 * llevan gente; nunca para los instaladores.
 *
 * Es la autoridad: la usan el servicio (`cctv-disenos.service.ts`) y `/me/navigation`. La web solo
 * lee la bandera de `GET /api/cctv-disenos/acceso`.
 */
import { isDeveloperSuperAdminEmail } from '../common/platform-accounts.js';
import { ROLES, type RoleKey } from '../common/rbac/roles.v2.js';

export const MENSAJE_SIN_ACCESO_CCTV = 'El diseñador de videovigilancia es para encargados de área y el arquitecto.';

/** Entran siempre, por su rol. */
export const ROLES_SIEMPRE_CCTV: ReadonlySet<RoleKey> = new Set<RoleKey>([
  ROLES.CEO,
  ROLES.DIR_OPERACIONES,
  ROLES.DIR_ADMIN,
  ROLES.COORD_OPERACIONES,
  ROLES.COORD_ADMIN,
  ROLES.COORD_VENTAS,
  ROLES.ARQUITECTO,
  ROLES.ADMINISTRATIVO,
  ROLES.ENC_SOPORTE,
]);

/** No entran nunca, aunque tengan gente a cargo: los instaladores y el portal del cliente. */
export const ROLES_NUNCA_CCTV: ReadonlySet<RoleKey> = new Set<RoleKey>([ROLES.ING_CAMPO, ROLES.CLIENTE]);

/**
 * Entran solo si tienen gente a cargo. Son los demás puestos internos que tienen Core en su panel
 * (`ROLE_EXTRA_PANELS`), que es donde vive el módulo; la matriz de URLs les abre el camino
 * (`CCTV_DISENOS_URL_RULES`) y el servicio los recorta por reportes directos.
 *
 * Vendedor y diseñador no tienen Core: abrirles la página les sumaba el panel entero, así que no
 * entran aunque lleven gente.
 */
export const ROLES_CCTV_CON_REPORTES: ReadonlySet<RoleKey> = new Set<RoleKey>([
  ROLES.ING_SOPORTE,
  ROLES.RH,
  ROLES.CONTABILIDAD,
  ROLES.LIDER_DISENO,
]);

export type QuienDisenaCctv = {
  roleKey?: string | null;
  isSuperAdmin?: boolean;
  /** La cuenta de desarrollo entra como el super admin (`platform-accounts.ts`). */
  email?: string | null;
};

/**
 * Lo que decide el rol solo: `si`, `no`, o `si_tiene_reportes` (hay que contar su gente).
 * Así el servicio solo consulta la base cuando de verdad hace falta.
 */
export function accesoCctvPorRol(quien: QuienDisenaCctv): 'si' | 'no' | 'si_tiene_reportes' {
  if (quien.isSuperAdmin || isDeveloperSuperAdminEmail(quien.email)) return 'si';
  const rol = String(quien.roleKey ?? '').trim() as RoleKey;
  if (rol === ROLES.SUPER_ADMIN) return 'si';
  if (ROLES_SIEMPRE_CCTV.has(rol)) return 'si';
  if (ROLES_CCTV_CON_REPORTES.has(rol)) return 'si_tiene_reportes';
  // Instaladores, cliente, vendedor, diseñador y claves que no son un rol v2.
  return 'no';
}

/** ¿Puede abrir, crear y guardar diseños? `tieneReportes`: al menos una persona activa le reporta. */
export function puedeDisenarCctv(quien: QuienDisenaCctv & { tieneReportes: boolean }): boolean {
  const porRol = accesoCctvPorRol(quien);
  if (porRol === 'si_tiene_reportes') return quien.tieneReportes === true;
  return porRol === 'si';
}

/** Lo mínimo de Prisma para contar la gente a cargo. */
export type ContadorDeGente = {
  user: {
    count(args: { where: { managerId: number; isActive: boolean; id: { not: number } } }): Promise<number>;
  };
};

/**
 * `puedeDisenarCctv` con los reportes contados en la base, solo si el rol lo pide: dirección,
 * coordinación y encargados entran sin consulta. La usan el servicio y `/me/navigation`.
 */
export async function puedeDisenarCctvSegunGente(
  prisma: ContadorDeGente,
  quien: QuienDisenaCctv & { id: number },
): Promise<boolean> {
  if (!Number.isInteger(quien.id) || quien.id <= 0) return false;
  const porRol = accesoCctvPorRol(quien);
  if (porRol !== 'si_tiene_reportes') return porRol === 'si';
  const reportes = await prisma.user.count({
    where: { managerId: quien.id, isActive: true, id: { not: quien.id } },
  });
  return puedeDisenarCctv({ ...quien, tieneReportes: reportes > 0 });
}
