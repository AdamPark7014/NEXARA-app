/**
 * Colocación **lateral** en el organigrama.
 *
 * `managerId` solo sabe decir «cuelga de»: un padre, una línea de mando hacia abajo.
 * Hay gente que no está ni arriba ni abajo de un nivel, sino **al lado**: Luis le pasa
 * trabajo a José Antonio sin ser su jefe; el arquitecto y la contadora acompañan al
 * segundo nivel sin mandar en él; Mónica cotiza a la par de Daniela.
 *
 * `lateralDeId` guarda eso y **nada más que el dibujo**. La regla, que estas funciones
 * existen para sostener:
 *
 *   > Ser lateral de alguien no te hace su subordinado ni su jefe.
 *
 * Por eso ningún cálculo de alcance (`me/equipo-alcance`), superiores de actividad,
 * avisos, KPIs de equipo ni permisos de cliente lee este campo: todos siguen mirando
 * `managerId`, que la colocación lateral nunca modifica. `lateralNoEsSubordinado` fija
 * esa frontera por escrito para que un cambio futuro tenga que romper una prueba antes
 * de romper los permisos de alguien.
 */

export type PersonaLateral = {
  id: number;
  managerId: number | null;
  lateralDeId?: number | null;
};

/** Tope de saltos al seguir una cadena de laterales; ata cualquier ciclo que se cuele en la base. */
const MAX_SALTOS = 16;

export class LateralInvalidaError extends Error {}

/** Descendientes por `managerId` de alguien, él incluido. */
export function subarbolDeMando(rootId: number, personas: PersonaLateral[]): Set<number> {
  const hijos = new Map<number, number[]>();
  for (const p of personas) {
    if (p.managerId == null) continue;
    const lista = hijos.get(p.managerId) ?? [];
    lista.push(p.id);
    hijos.set(p.managerId, lista);
  }
  const out = new Set<number>([rootId]);
  const cola = [rootId];
  while (cola.length) {
    const id = cola.shift()!;
    for (const hijo of hijos.get(id) ?? []) {
      if (out.has(hijo)) continue;
      out.add(hijo);
      cola.push(hijo);
    }
  }
  return out;
}

/**
 * ¿Se puede colocar a `personaId` al lado de `anclaId`? Devuelve el motivo si no.
 *
 * Se rechaza:
 *  - ponerse al lado de uno mismo;
 *  - anclarse a alguien de la propia gente (el ancla acabaría dentro del bloque que se
 *    mueve a su costado, y el dibujo se muerde la cola);
 *  - cerrar un ciclo de laterales (A al lado de B y B al lado de A: ninguno tiene sitio).
 */
export function motivoLateralInvalida(
  personaId: number,
  anclaId: number | null,
  personas: PersonaLateral[],
): string | null {
  if (anclaId == null) return null;
  if (anclaId === personaId) return 'Nadie se coloca al lado de sí mismo';

  if (subarbolDeMando(personaId, personas).has(anclaId)) {
    return 'No se puede colocar a alguien al lado de su propia gente';
  }

  const lateralDe = new Map(personas.map((p) => [p.id, p.lateralDeId ?? null]));
  let cur: number | null = anclaId;
  for (let i = 0; cur != null && i < MAX_SALTOS; i += 1) {
    if (cur === personaId) return 'Esa colocación deja a los dos al lado del otro';
    cur = lateralDe.get(cur) ?? null;
  }
  return null;
}

export function assertLateralValida(
  personaId: number,
  anclaId: number | null,
  personas: PersonaLateral[],
): void {
  const motivo = motivoLateralInvalida(personaId, anclaId, personas);
  if (motivo) throw new LateralInvalidaError(motivo);
}

/**
 * La frontera, escrita como código: quién cuenta como subordinado de `jefeId`.
 *
 * **Solo `managerId`.** Un lateral de `jefeId` no entra aquí aunque se dibuje pegado a
 * él. Si algún día alguien suma los laterales a este conteo, `lateral-no-subordinado.spec`
 * se cae antes de que Luis aparezca como gente a cargo de José Antonio y herede sus
 * permisos de cliente, sus aprobaciones de comida y su árbol de asistencia.
 */
export function subordinadosDirectos(jefeId: number, personas: PersonaLateral[]): number[] {
  return personas.filter((p) => p.managerId === jefeId).map((p) => p.id);
}

/** Laterales de alguien: al costado suyo, nunca por debajo. */
export function lateralesDe(anclaId: number, personas: PersonaLateral[]): number[] {
  return personas.filter((p) => p.lateralDeId === anclaId).map((p) => p.id);
}
