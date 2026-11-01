/**
 * Quién ve qué en Costos (decisión de Adam, 01-11-2026):
 * - CEO y contadora ven todo, incluidos los sueldos y el costo por hora de cada persona.
 * - Quien coordina la operación liga horas y ve totales por rubro; nunca un sueldo.
 * - El responsable o vendedor de un proyecto ve los totales por rubro de ese proyecto.
 *
 * La contadora tiene rol `administrativo`, igual que otras personas de oficina: lo que la distingue
 * es su puesto. Módulo puro.
 */
import { isCeoEquivalentEmail } from '../common/platform-accounts.js';
import { esSuperAdmin } from '../common/tenant/module-policy.js';
import { ROLES } from '../common/rbac/roles.v2.js';

export type ActorCostos = {
  id?: number | null;
  roleKey?: string | null;
  role?: string | null;
  email?: string | null;
  isSuperAdmin?: boolean;
  superadmin?: boolean;
  /** Se lee de la base: el token no lo trae. */
  puesto?: string | null;
};

const RE_CONTADORA = /\bcontador(a|\(a\))?\b|\bcontabilidad\b/i;

/** Coordinan la operación: ligan horas a proyectos. No ven sueldos. */
export const ROLES_QUE_LIGAN: readonly string[] = [
  ROLES.DIR_OPERACIONES,
  ROLES.COORD_OPERACIONES,
  ROLES.ENC_SOPORTE,
  ROLES.ARQUITECTO,
  ROLES.DIR_ADMIN,
  ROLES.COORD_ADMIN,
];

export function esContadora(actor: ActorCostos | null | undefined): boolean {
  if (!actor) return false;
  return actor.roleKey === ROLES.CONTABILIDAD || RE_CONTADORA.test(String(actor.puesto ?? ''));
}

export function veTodoCostos(actor: ActorCostos | null | undefined): boolean {
  if (!actor) return false;
  return esSuperAdmin(actor) || actor.roleKey === ROLES.CEO || isCeoEquivalentEmail(actor.email) || esContadora(actor);
}

export function puedeLigarHoras(actor: ActorCostos | null | undefined): boolean {
  if (!actor) return false;
  return veTodoCostos(actor) || ROLES_QUE_LIGAN.includes(String(actor.roleKey ?? ''));
}
