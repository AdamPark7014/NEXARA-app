/**
 * «Deshacer» estilo Instagram (Adam, 27-11-2026). Reglas puras, sin base de datos.
 *
 * Después de crear algo (asignar una actividad, pedir un viático…) la web y las apps muestran un aviso
 * con «Deshacer» durante {@link PLAZO_VISIBLE_MS}. Mientras dura, quien lo hizo lo retira sin dejar
 * rastro en nadie: los avisos a otras personas se mandan hasta que pasa el plazo (`aviso-diferido.ts`).
 *
 * Pasado el plazo solo lo retira un superior de quien lo hizo: su jefe por organigrama (cualquier nivel
 * hacia arriba), Christian o la cuenta de desarrollo. Nunca la propia persona: para eso ya hay cancelar
 * con motivo.
 *
 * El servidor acepta {@link VENTANA_SERVIDOR_MS} (más que el plazo visible) porque el reloj corre desde
 * que se guardó, no desde que el teléfono recibió la respuesta: con mala señal el aviso aparece tarde y
 * el «Deshacer» que se ve en pantalla tiene que funcionar.
 */

/** Lo que dura el aviso en pantalla. */
export const PLAZO_VISIBLE_MS = 5_000;
/** Lo que el servidor sigue aceptando el deshacer de quien lo hizo. */
export const VENTANA_SERVIDOR_MS = 15_000;
/** Lo que se esperan los avisos a otras personas: el plazo visible más un margen. */
export const AVISO_DIFERIDO_MS = 7_000;

export const TIPOS_DESHACER = ['actividad', 'viatico'] as const;
export type TipoDeshacer = (typeof TIPOS_DESHACER)[number];

export function esTipoDeshacer(valor: unknown): valor is TipoDeshacer {
  return typeof valor === 'string' && (TIPOS_DESHACER as readonly string[]).includes(valor);
}

export type PersonaOrganigrama = { id: number; managerId: number | null };

export type ActorDeshacer = {
  id: number;
  /** Christian, su equivalente de pruebas, la cuenta de desarrollo o superadmin de la sesión. */
  autoridadMaxima: boolean;
};

/** ¿`actorId` está por encima de `autorId` en la cadena de jefes? */
export function esSuperiorDe(actorId: number, autorId: number, personas: readonly PersonaOrganigrama[]): boolean {
  if (!actorId || !autorId || actorId === autorId) return false;
  const jefeDe = new Map(personas.map((p) => [p.id, p.managerId]));
  const vistos = new Set<number>();
  let actual = jefeDe.get(autorId) ?? null;
  while (actual != null && !vistos.has(actual)) {
    if (actual === actorId) return true;
    vistos.add(actual);
    actual = jefeDe.get(actual) ?? null;
  }
  return false;
}

export type DecisionDeshacer =
  | { ok: true; como: 'a_tiempo' | 'superior' }
  | { ok: false; motivo: 'plazo_vencido' | 'sin_permiso' };

export const MENSAJE_PLAZO_VENCIDO =
  'Ya pasó el tiempo para deshacerlo. Si hay que quitarlo, pídeselo a tu jefe o cancélalo con motivo.';
export const MENSAJE_SIN_PERMISO = 'Solo quien lo hizo (en los primeros segundos) o un superior suyo puede deshacerlo.';

/**
 * Decide si `actor` puede deshacer algo que hizo `autorId` en `hechoEn`.
 *
 * - Quien lo hizo, dentro de la ventana del servidor → «a tiempo».
 * - Un superior de quien lo hizo (o la autoridad máxima), en cualquier momento → «superior».
 * - Quien lo hizo, fuera de la ventana → plazo vencido.
 */
export function decidirDeshacer(params: {
  actor: ActorDeshacer;
  autorId: number;
  hechoEn: Date;
  ahora: Date;
  personas: readonly PersonaOrganigrama[];
}): DecisionDeshacer {
  const { actor, autorId, hechoEn, ahora, personas } = params;
  if (!actor?.id) return { ok: false, motivo: 'sin_permiso' };
  if (actor.id === autorId) {
    const transcurrido = ahora.getTime() - hechoEn.getTime();
    // Un reloj del servidor un poco atrás (negativo) también cuenta como a tiempo.
    if (transcurrido <= VENTANA_SERVIDOR_MS) return { ok: true, como: 'a_tiempo' };
    if (actor.autoridadMaxima) return { ok: true, como: 'superior' };
    return { ok: false, motivo: 'plazo_vencido' };
  }
  if (actor.autoridadMaxima || esSuperiorDe(actor.id, autorId, personas)) return { ok: true, como: 'superior' };
  return { ok: false, motivo: 'sin_permiso' };
}

/** Una actividad se puede retirar mientras nadie la haya empezado. */
export function actividadSinAvance(a: {
  estatus: string | null | undefined;
  cancelledAt: Date | null | undefined;
  sesiones: number;
  conFotoDeEntrada: number;
}): { ok: true } | { ok: false; mensaje: string } {
  if (a.cancelledAt) return { ok: false, mensaje: 'La actividad ya está cancelada.' };
  const estatus = String(a.estatus ?? '').trim().toLowerCase();
  const sinEmpezar = estatus === '' || estatus === 'pendiente' || estatus === 'asignada';
  if (!sinEmpezar || a.sesiones > 0 || a.conFotoDeEntrada > 0) {
    return { ok: false, mensaje: 'Ya se empezó a trabajar en ella: cancélala con motivo para que quede el registro.' };
  }
  return { ok: true };
}

/** Un viático se puede retirar mientras nadie lo haya aprobado, pagado ni asentado. */
export function viaticoSinAvance(v: {
  estatus: string | null | undefined;
  approvalStep: number | null | undefined;
  journalEntryId: number | null | undefined;
}): { ok: true } | { ok: false; mensaje: string } {
  const estatus = String(v.estatus ?? '').trim().toLowerCase();
  if (estatus !== 'pendiente' || Number(v.approvalStep ?? 0) > 0 || v.journalEntryId) {
    return { ok: false, mensaje: 'El viático ya avanzó (aprobado, pagado o asentado): ya no se puede deshacer.' };
  }
  return { ok: true };
}
