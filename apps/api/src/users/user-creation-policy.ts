/**
 * Quién puede dar de alta a quién.
 *
 * Hoy solo `ceo`, `dir_admin` y `coord_admin` tienen `users.manage`. Pero Christian quiere que el
 * encargado de soporte (Antonio) y el encargado de servicios (Luis) den de alta personal de **soporte**,
 * y que el encargado de instalación (David) dé de alta **instaladores**. Luis y David comparten rol
 * (`coord_operaciones`), así que la concesión es **por persona** (por correo), no por rol.
 *
 * Se guarda como `SystemSetting` con `companyId` (`users.creation_grants`), JSON
 * `{ "<correo>": ["<rol>", …] }`. Sin fila nadie, salvo dirección, puede dar de alta a nadie.
 *
 * Reglas de seguridad (no configurables):
 *  · Dirección (CEO, dueño de la plataforma, super admin) da de alta **todos** los tipos por debajo de
 *    ella: nunca otro `ceo` ni `super_admin`, y los clientes del portal no se crean por aquí.
 *  · Una concesión solo puede nombrar roles **delegables** (operativos, sin poderes de administración);
 *    lo demás se ignora al leerla, aunque alguien lo escriba en la base.
 *
 * Módulo puro (sin Nest ni Prisma).
 */
import { ALL_ROLES, ROLES, ROLE_LABELS, ROLE_TIER, type RoleKey } from '../common/rbac/roles.v2.js';

export const USER_CREATION_GRANTS_SETTING_KEY = 'users.creation_grants';

/** Roles que una concesión puede nombrar: operativos, sin poderes de gobierno ni aprobación. */
export const ROLES_DELEGABLES: readonly RoleKey[] = [
  ROLES.ING_SOPORTE,
  ROLES.ING_CAMPO,
  ROLES.VENDEDOR,
  ROLES.DISENADOR,
  ROLES.ADMINISTRATIVO,
];

/** Lo que dirección NO da de alta desde este flujo. */
const FUERA_DE_ALCANCE: ReadonlySet<RoleKey> = new Set<RoleKey>([ROLES.SUPER_ADMIN, ROLES.CEO, ROLES.CLIENTE]);

/** Nombre con el que se le habla a quien da de alta (los del organigrama, no los técnicos). */
const ETIQUETA_TIPO: Partial<Record<RoleKey, string>> = {
  [ROLES.ING_SOPORTE]: 'Soporte',
  [ROLES.ENC_SOPORTE]: 'Encargado de soporte',
  [ROLES.ING_CAMPO]: 'Instalador',
};

export type ActorAlta = {
  email?: string | null;
  roleKey?: string | null;
  isSuperAdmin?: boolean;
  superadmin?: boolean;
};

export type ConcesionesAlta = Record<string, RoleKey[]>;

export type TipoUsuario = { roleKey: RoleKey; etiqueta: string };

const normalizarCorreo = (correo: unknown): string => String(correo ?? '').trim().toLowerCase();

/** Valor guardado → concesiones sanas. Tolera JSON roto, roles desconocidos y roles no delegables. */
export function parsearConcesiones(raw: string | null | undefined): ConcesionesAlta {
  if (raw == null || String(raw).trim() === '') return {};
  let data: unknown;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

  const delegables = new Set<string>(ROLES_DELEGABLES);
  const salida: ConcesionesAlta = {};
  for (const [correo, lista] of Object.entries(data as Record<string, unknown>)) {
    const clave = normalizarCorreo(correo);
    if (!clave || !Array.isArray(lista)) continue;
    const roles = [
      ...new Set(
        lista
          .map((r) => String(r ?? '').trim().toLowerCase())
          .filter((r): r is RoleKey => delegables.has(r)),
      ),
    ];
    if (roles.length) salida[clave] = roles;
  }
  return salida;
}

/** ¿Quien actúa es dirección (da de alta todo lo que está debajo)? */
export function esDireccion(actor: ActorAlta | null | undefined, correoDueno: string): boolean {
  if (!actor) return false;
  if (actor.isSuperAdmin || actor.superadmin || actor.roleKey === ROLES.SUPER_ADMIN) return true;
  if (actor.roleKey === ROLES.CEO) return true;
  return correoDueno !== '' && normalizarCorreo(actor.email) === normalizarCorreo(correoDueno);
}

/** Roles por debajo de dirección que se pueden dar de alta, del más alto al más bajo. */
export function rolesBajoDireccion(): RoleKey[] {
  return ALL_ROLES.filter((r) => !FUERA_DE_ALCANCE.has(r)).sort((a, b) => ROLE_TIER[b] - ROLE_TIER[a]);
}

/** Los tipos que esta persona puede dar de alta. Vacío = no puede dar de alta a nadie. */
export function rolesQuePuedeCrear(
  actor: ActorAlta | null | undefined,
  concesiones: ConcesionesAlta,
  correoDueno = '',
): RoleKey[] {
  if (!actor) return [];
  if (esDireccion(actor, correoDueno)) return rolesBajoDireccion();
  const propios = concesiones[normalizarCorreo(actor.email)] ?? [];
  return propios.filter((r) => ROLES_DELEGABLES.includes(r));
}

export function puedeCrearRol(
  actor: ActorAlta | null | undefined,
  rol: string,
  concesiones: ConcesionesAlta,
  correoDueno = '',
): boolean {
  return (rolesQuePuedeCrear(actor, concesiones, correoDueno) as string[]).includes(String(rol));
}

/** Para mostrar en la pantalla: «Instalador», «Soporte», «Director de Operaciones»… */
export function tiposParaMostrar(roles: readonly RoleKey[]): TipoUsuario[] {
  return roles.map((roleKey) => ({ roleKey, etiqueta: ETIQUETA_TIPO[roleKey] ?? ROLE_LABELS[roleKey]?.es ?? roleKey }));
}

/**
 * Contraseña con la que se da de alta: al menos 8 caracteres con letra y número. La política de
 * inicio de sesión no cambia; esto solo evita altas con contraseñas triviales.
 */
export function contrasenaAceptable(valor: unknown): boolean {
  const s = String(valor ?? '');
  return s.length >= 8 && s.length <= 72 && /[A-Za-z]/.test(s) && /\d/.test(s);
}
