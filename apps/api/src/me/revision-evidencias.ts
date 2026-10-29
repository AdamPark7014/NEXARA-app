import { isCeoEquivalentEmail } from '../common/platform-accounts.js';

/**
 * Quién revisa la evidencia de quién en una actividad. Una sola regla para la vista de
 * evidencias del equipo (`teamEvidence`, que aprueba o devuelve) y para la lista
 * «En espera de revisión»: si se separan, la lista ofrecería revisar algo que luego da 403.
 */

/** Dos personas sumadas con menos de 5 s de diferencia están en el mismo nivel de la cadena. */
export const MISMO_MOMENTO_MS = 5_000;

/** Una fila de la cadena de la actividad (equipo, con el responsable aunque no tenga fila). */
export type EslabonRevision = {
  userId: number;
  rol: string;
  asignadoAt: Date;
  retiradoAt: Date | null;
};

export type RevisorEvidencias = {
  id: number;
  email?: string | null;
  roleKey?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[] | null;
};

/** Dirección, consola y quien tiene `evidences.review` revisan a cualquiera de la empresa. */
export function revisaTodo(viewer: RevisorEvidencias): boolean {
  const email = (viewer.email || '').trim().toLowerCase();
  const perms = new Set((viewer.permissions ?? []).map(String));
  return (
    Boolean(viewer.isSuperAdmin) ||
    viewer.roleKey === 'ceo' ||
    isCeoEquivalentEmail(email) ||
    email === 'developer@nexara.com.mx' ||
    perms.has('console.admin') ||
    perms.has('evidences.review')
  );
}

/** El responsable es parte de la cadena aunque no tenga fila de equipo (reparte o ejecuta). */
export function cadenaConResponsable<T extends { userId: number }>(
  assignees: T[],
  responsableId: number,
  filaDelResponsable: () => T,
): T[] {
  return assignees.some((m) => m.userId === responsableId) ? assignees : [filaDelResponsable(), ...assignees];
}

/**
 * Lo que decide la cadena para quien mira:
 * - `mine`: su fila vigente (o la última, si ya salió).
 * - `encimaDe(m)`: es encargado y `m` la recibió después que él (o a la vez, si `m` no es encargado).
 * - `puedeRevisar(m)`: no es él mismo, `m` no solo la reparte, y quien mira revisa todo, es el
 *   responsable, es jefe de `m` por organigrama o está encima de `m` en la cadena.
 */
export function reglaDeRevision<T extends EslabonRevision>(opts: {
  viewerId: number;
  todo: boolean;
  esResponsable: boolean;
  despacho: boolean;
  cadena: T[];
  /** Jefes por organigrama (managerId hacia arriba) de cada persona de la cadena. */
  jefesDe: Map<number, Set<number>>;
}) {
  const { viewerId, todo, esResponsable, despacho, cadena, jefesDe } = opts;
  const mine =
    cadena.find((m) => m.userId === viewerId && !m.retiradoAt) ?? cadena.find((m) => m.userId === viewerId);
  const soyEncargado = Boolean(mine && !mine.retiradoAt && String(mine.rol) === 'LEAD');
  const encimaDe = (m: T) => {
    if (!soyEncargado || !mine) return false;
    const diff = m.asignadoAt.getTime() - mine.asignadoAt.getTime();
    return diff > MISMO_MOMENTO_MS || (Math.abs(diff) <= MISMO_MOMENTO_MS && String(m.rol) !== 'LEAD');
  };
  const reparte = (m: T) => despacho && String(m.rol) === 'LEAD';
  const puedeRevisar = (m: T) =>
    m.userId !== viewerId &&
    !reparte(m) &&
    (todo || esResponsable || Boolean(jefesDe.get(m.userId)?.has(viewerId)) || encimaDe(m));
  return { mine, soyEncargado, encimaDe, reparte, puedeRevisar };
}

/** Jefes (managerId hacia arriba) de cada usuario, a partir de la lista id → managerId. */
export function cadenasDeMando(
  usuarios: Array<{ id: number; managerId: number | null }>,
  userIds: number[],
): Map<number, Set<number>> {
  const jefeDe = new Map(usuarios.map((u) => [u.id, u.managerId]));
  const out = new Map<number, Set<number>>();
  for (const id of userIds) {
    const jefes = new Set<number>();
    let cur = jefeDe.get(id) ?? null;
    while (cur != null && cur !== id && !jefes.has(cur)) {
      jefes.add(cur);
      cur = jefeDe.get(cur) ?? null;
    }
    out.set(id, jefes);
  }
  return out;
}

/** Evidencia enviada que nadie ha aprobado ni devuelto (incluida la corrección reenviada). */
export function esperaRevision(ev: { status: string; reviewStatus: string | null }): boolean {
  return ev.status === 'COMPLETED' && ev.reviewStatus !== 'APPROVED' && ev.reviewStatus !== 'REJECTED';
}

/** Ya no se revisa: cerrada, cancelada o no cumplida. */
export function actividadCerradaParaRevision(estatus: string | null | undefined): boolean {
  return /finaliz|complet|aprobad|cancel|no cumplida|incumplida/i.test(estatus ?? '');
}

/** Lo más viejo primero: lleva más tiempo esperando. */
export function ordenarPorEspera<T extends { enviadaAt: Date | null }>(items: T[]): T[] {
  const t = (d: Date | null) => (d ? d.getTime() : Number.MAX_SAFE_INTEGER);
  return [...items].sort((a, b) => t(a.enviadaAt) - t(b.enviadaAt));
}
