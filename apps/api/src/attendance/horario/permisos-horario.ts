/**
 * Quién puede programar / extender / recortar el horario de otra persona.
 * Nadie se lo cambia a sí mismo. RH y dirección (ceo / dir_*) sí; el jefe
 * directo y cualquiera por encima en el árbol `managerId` también.
 */

export type ActorHorario = {
  id: number;
  email?: string | null;
  roleKey?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[] | null;
};

export type PersonaArbol = {
  id: number;
  managerId?: number | null;
  email?: string | null;
  roleKey?: string | null;
};

const ROLES_DIRECCION = new Set(['ceo', 'dir_operaciones', 'dir_admin', 'dir_ventas']);

export function esRhODireccion(actor: ActorHorario): boolean {
  if (actor.isSuperAdmin) return true;
  const rol = (actor.roleKey ?? '').trim().toLowerCase();
  if (rol === 'rh' || ROLES_DIRECCION.has(rol)) return true;
  const email = (actor.email ?? '').trim().toLowerCase();
  return email === 'developer@nexara.com.mx' || email.endsWith('@plataforma.nexara.local');
}

/**
 * ¿`actor` está por encima de `targetId` en el organigrama (cadena de managers)?
 * El jefe directo cuenta; también cualquier ancestro.
 */
export function esJefeOSuperior(actorId: number, targetId: number, personas: readonly PersonaArbol[]): boolean {
  if (actorId === targetId) return false;
  const byId = new Map(personas.map((p) => [p.id, p]));
  let actual = byId.get(targetId);
  const vistos = new Set<number>();
  while (actual?.managerId != null) {
    if (vistos.has(actual.managerId)) break;
    if (actual.managerId === actorId) return true;
    vistos.add(actual.managerId);
    actual = byId.get(actual.managerId);
  }
  return false;
}

export type DecisionPermisoHorario =
  | { ok: true; motivo: 'rh_direccion' | 'jerarquia' }
  | { ok: false; motivo: 'si_mismo' | 'sin_alcance' | 'sin_actor' };

/**
 * Regla única de escritura de horario: no a sí mismo; RH/dirección o jerarquía.
 */
export function puedeProgramarHorario(
  actor: ActorHorario | null | undefined,
  targetId: number,
  personas: readonly PersonaArbol[],
): DecisionPermisoHorario {
  if (!actor?.id) return { ok: false, motivo: 'sin_actor' };
  if (actor.id === targetId) return { ok: false, motivo: 'si_mismo' };
  if (esRhODireccion(actor)) return { ok: true, motivo: 'rh_direccion' };
  if (esJefeOSuperior(actor.id, targetId, personas)) return { ok: true, motivo: 'jerarquia' };
  return { ok: false, motivo: 'sin_alcance' };
}

/** Lectura: la propia persona, su jerarquía hacia abajo, RH/dirección. */
export function puedeVerHorario(
  actor: ActorHorario | null | undefined,
  targetId: number,
  personas: readonly PersonaArbol[],
): boolean {
  if (!actor?.id) return false;
  if (actor.id === targetId) return true;
  if (esRhODireccion(actor)) return true;
  // Alcance hacia abajo: target en el subárbol del actor.
  return esJefeOSuperior(actor.id, targetId, personas);
}
