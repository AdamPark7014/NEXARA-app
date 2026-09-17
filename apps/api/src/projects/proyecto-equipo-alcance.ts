/**
 * A quién puedes meter al equipo de un proyecto.
 *
 * Es la misma regla que para asignar una actividad (`me/equipo-alcance.ts`): tu
 * organigrama hacia abajo más el flujo de despacho, y dirección con todos. No se
 * reescribe aquí para que no se separen: si mañana cambia el organigrama, cambia en
 * un solo sitio.
 *
 * La única diferencia es que **uno mismo sí cuenta**. `puedeAsignarA` excluye al
 * propio usuario a propósito —asignarte una actividad a ti mismo no es repartir
 * trabajo—, pero un proyecto sin su coordinador dentro del equipo no tiene sentido:
 * quien lo abre casi siempre es quien lo lleva.
 */
import { puedeAsignarA, type Alcanzador } from '../me/equipo-alcance.js';

export type PersonaDeAlcance = { id: number; email: string; managerId: number | null };

export function puedeIntegrarAlEquipo(
  viewer: Alcanzador,
  users: PersonaDeAlcance[],
  targetId: number,
): boolean {
  if (targetId === viewer.id) return true;
  return puedeAsignarA(viewer, users, targetId);
}

/** Los ids del equipo propuesto que quedan fuera del alcance de quien los propone. */
export function fueraDeAlcance(
  viewer: Alcanzador,
  users: PersonaDeAlcance[],
  targetIds: number[],
): number[] {
  return [...new Set(targetIds)].filter((id) => !puedeIntegrarAlEquipo(viewer, users, id));
}

/** Mensaje único para el 403, con los nombres y no con los ids. */
export function mensajeFueraDeAlcance(
  ids: number[],
  users: Array<{ id: number; nombre?: string | null; email?: string | null }>,
): string {
  const nombres = ids.map((id) => {
    const u = users.find((x) => x.id === id);
    return u?.nombre || u?.email || `#${id}`;
  });
  return nombres.length === 1
    ? `${nombres[0]} está fuera de tu equipo: no puedes asignarle este proyecto.`
    : `Fuera de tu equipo: ${nombres.join(', ')}. Solo puedes asignar a quien te reporta.`;
}
