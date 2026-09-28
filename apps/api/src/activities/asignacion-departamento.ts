import { esDeTodaLaEmpresa, puedeAsignarA, type Alcanzador } from '../me/equipo-alcance.js';

/**
 * Quién puede dejar una actividad a cargo de alguien de otro departamento.
 *
 * El alta (`POST /activities`) exigía el mismo `departmentId` salvo super admin.
 * Eso bloqueaba el flujo real: Luis (Servicios, coordinador) le pide apoyo a
 * Antonio (Sistemas) para que Antonio asigne a su ingeniero. El organigrama ya
 * lo permitía (`puedeAsignarA`); el candado de departamento lo pisaba.
 *
 * Regla:
 * - Mismo departamento: sigue permitido (un empleado no sale de su área).
 * - Otro departamento: dirección de toda la empresa, el alcance de asignación
 *   (organigrama hacia abajo o el flujo Luis → Antonio) o un mando pidiendo
 *   apoyo a otro mando (coordinación, gerencia o quien tiene gente a su cargo).
 * - Un empleado sin mando no cruza departamento, ni hacia un coordinador.
 */

/** Roles que coordinan o dirigen y pueden pedir apoyo fuera de su área. */
export const ROLES_MANDO_ACTIVIDADES = new Set([
  'super_admin',
  'ceo',
  'dir_admin',
  'dir_operaciones',
  'arquitecto',
  'coord_admin',
  'coord_operaciones',
  'coord_ventas',
  'enc_soporte',
  'lider_diseno',
]);

/**
 * Antonio reparte soporte pero su `roleKey` es `ing_soporte` (puesto de encargado).
 * Sin esto, pedirle apoyo no contaría como mando.
 */
const ENCARGADO_POR_CORREO = new Set(['jose.ramirez@nexara.com.mx']);

export type ActorAsignacion = Alcanzador & { departmentId?: number | null };

export type DestinoAsignacion = {
  id: number;
  email: string;
  managerId: number | null;
  departmentId?: number | null;
  roleKey?: string | null;
};

function correo(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

/** Coordinación, gerencia o el encargado de soporte (aunque su rol diga ingeniero). */
export function coordinaActividades(person: {
  roleKey?: string | null;
  email?: string | null;
}): boolean {
  const role = (person.roleKey || '').trim();
  if (role && ROLES_MANDO_ACTIVIDADES.has(role)) return true;
  return ENCARGADO_POR_CORREO.has(correo(person.email));
}

/** A quién se le puede pedir apoyo: un mando, o quien ya tiene gente que le reporta. */
export function puedeRecibirApoyoDeOtraArea(
  person: { id: number; roleKey?: string | null; email?: string | null },
  roster: Array<{ id: number; managerId: number | null }>,
): boolean {
  if (coordinaActividades(person)) return true;
  return roster.some((u) => u.managerId === person.id);
}

/** Mando pide apoyo a otro mando. El empleado no usa esta puerta. */
export function puedePedirApoyoEntreAreas(
  actor: { roleKey?: string | null; email?: string | null },
  target: { id: number; roleKey?: string | null; email?: string | null },
  roster: Array<{ id: number; managerId: number | null }>,
): boolean {
  if (!coordinaActividades(actor)) return false;
  return puedeRecibirApoyoDeOtraArea(target, roster);
}

export function puedeDejarActividadA(
  actor: ActorAsignacion,
  target: DestinoAsignacion,
  roster: DestinoAsignacion[],
): boolean {
  if (target.id === actor.id) return true;
  if (actor.isSuperAdmin || esDeTodaLaEmpresa(actor)) return true;
  // Igual que el candado anterior: `!==` solo niega cuando los departamentos difieren
  // (dos null cuentan como el mismo).
  if (actor.departmentId === target.departmentId) return true;
  if (puedeAsignarA(actor, roster, target.id)) return true;
  return puedePedirApoyoEntreAreas(actor, target, roster);
}

export function mensajeAsignacionDenegada(actor: {
  roleKey?: string | null;
  email?: string | null;
}): string {
  if (coordinaActividades(actor)) {
    return 'Solo puedes asignar fuera de tu departamento a un coordinador o a alguien de tu equipo';
  }
  return 'Solo puedes asignar a tu propio departamento';
}
