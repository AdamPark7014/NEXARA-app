/**
 * Quién ve qué (matriz aprobada por Adam el 20-11-2026). Política central y PURA: no toca la base.
 *
 * - Precios: superadmin o quien tenga el acceso `precios.ver` (se prende por persona en Usuarios).
 * - Cotizaciones: quien la creó, a quien se la mandaron (`asignadoAId`, «Mandar a»), quien aparece en
 *   `cotizacion_participantes` (revisó, aprobó, le pidieron revisión…), superadmin o `cotizaciones.ver_todas`.
 * - Evidencias: quien la subió y sus jefes hacia arriba (cadena `User.managerId`), y superadmin.
 *
 * Negado por omisión: sin regla que lo permita, no se ve. Nada de correos ni ids aquí: las personas se
 * eligen con accesos y con la cadena de jefes.
 */
import type { Prisma } from '@prisma/client';

/**
 * Interruptor general (system_settings `visibilidad.compartimentada`, apagado por omisión). Apagado =
 * todo como antes: nadie pierde nada al desplegar hasta que Adam dé el OK y se prenda con un script.
 * Lo refresca `VisibilidadService` cada 30 s; las funciones puras lo leen de aquí.
 */
export const CLAVE_INTERRUPTOR = 'visibilidad.compartimentada';
let compartimentada = false;
export function reglasActivas(): boolean {
  return compartimentada;
}
/** Solo para el servicio que lo lee de la base y para pruebas. */
export function fijarCompartimentada(valor: boolean): void {
  compartimentada = Boolean(valor);
}

/** Claves de acceso por persona (`User.accesos`). */
export const ACCESOS = {
  PRECIOS_VER: 'precios.ver',
  COTIZACIONES_VER_TODAS: 'cotizaciones.ver_todas',
} as const;
export type ClaveAcceso = (typeof ACCESOS)[keyof typeof ACCESOS];
export const CLAVES_ACCESO: readonly ClaveAcceso[] = Object.values(ACCESOS);

/** Lo que la política necesita de quien mira (es el `req.user` de la sesión). */
export type Actor = {
  id: number;
  isSuperAdmin?: boolean | null;
  roleKey?: string | null;
  accesos?: readonly string[] | null;
};

/** Superadmin ya lo resuelve la sesión (bandera del token, correo de plataforma o CEO equivalente). */
export function esSuperAdmin(actor: Actor | null | undefined): boolean {
  return Boolean(actor?.isSuperAdmin);
}

export function tieneAcceso(actor: Actor | null | undefined, clave: ClaveAcceso): boolean {
  return Boolean(actor?.accesos?.includes(clave));
}

export function puedeVerPrecios(actor: Actor | null | undefined): boolean {
  if (!reglasActivas()) return true;
  return esSuperAdmin(actor) || tieneAcceso(actor, ACCESOS.PRECIOS_VER);
}

export function veTodasLasCotizaciones(actor: Actor | null | undefined): boolean {
  if (!reglasActivas()) return true;
  return esSuperAdmin(actor) || tieneAcceso(actor, ACCESOS.COTIZACIONES_VER_TODAS);
}

/** Lo que nunca coincide con ninguna fila (id inexistente). Para «sin actor = nada». */
const NADA = { id: -1 } as const;

/**
 * Filtro de Prisma para `cotizacion` que deja solo las visibles para el actor. Se compone con el de
 * empresa: `where: { AND: [companyWhere(cid), whereCotizacionesVisibles(actor)] }`.
 */
export function whereCotizacionesVisibles(actor: Actor | null | undefined): Prisma.CotizacionWhereInput {
  if (!reglasActivas()) return {};
  if (!actor?.id) return NADA;
  if (veTodasLasCotizaciones(actor)) return {};
  return {
    OR: [
      { createdById: actor.id },
      { asignadoAId: actor.id },
      { participantes: { some: { userId: actor.id } } },
    ],
  };
}

/** Lo mismo que el filtro anterior, sobre una fila ya leída (para lo que no pasa por Prisma). */
export function cotizacionVisible(
  actor: Actor | null | undefined,
  c: { createdById?: number | null; asignadoAId?: number | null; participantes?: Array<{ userId: number }> | null },
): boolean {
  if (!reglasActivas()) return true;
  if (!actor?.id) return false;
  if (veTodasLasCotizaciones(actor)) return true;
  return (
    c.createdById === actor.id ||
    c.asignadoAId === actor.id ||
    Boolean(c.participantes?.some((p) => p.userId === actor.id))
  );
}

export type PersonaOrganigrama = {
  id: number;
  managerId?: number | null;
  roleKey?: string | null;
  isActive?: boolean | null;
};

/** Roles de dirección: nunca «cuelgan» de nadie aunque no tengan jefe. */
const ROLES_SIN_JEFE = new Set(['ceo', 'super_admin']);
/** Mientras Adam asigna jefes, quien no tiene jefe (y no es dirección) cuelga de este rol (Luis). */
export const ROL_JEFE_POR_OMISION = 'dir_operaciones';

/**
 * Ids de toda la gente bajo el mando del actor (hijos, nietos…) por la cadena `managerId`.
 * No incluye al actor. Recorre en anchura con visitados, así que un ciclo (A→B→A) no se cuelga.
 * Quien no tiene jefe y no es dirección cuelga de quienes tengan el rol `dir_operaciones`.
 */
export function usuariosBajoMiMando(actorId: number, personas: readonly PersonaOrganigrama[]): Set<number> {
  const hijos = new Map<number, number[]>();
  const jefesPorOmision = personas.filter((p) => p.roleKey === ROL_JEFE_POR_OMISION && p.isActive !== false).map((p) => p.id);
  const existe = new Set(personas.map((p) => p.id));
  for (const p of personas) {
    let jefes: number[];
    if (p.managerId != null && existe.has(p.managerId)) jefes = [p.managerId];
    else if (ROLES_SIN_JEFE.has(p.roleKey ?? '') || p.roleKey === ROL_JEFE_POR_OMISION) jefes = [];
    else jefes = jefesPorOmision;
    for (const j of jefes) {
      if (j === p.id) continue;
      const lista = hijos.get(j) ?? [];
      lista.push(p.id);
      hijos.set(j, lista);
    }
  }
  const bajo = new Set<number>();
  const cola = [...(hijos.get(actorId) ?? [])];
  while (cola.length) {
    const id = cola.shift()!;
    if (id === actorId || bajo.has(id)) continue;
    bajo.add(id);
    cola.push(...(hijos.get(id) ?? []));
  }
  return bajo;
}

/** ¿Puede el actor ver lo que subió `autorId`? Él mismo, sus jefes hacia arriba y superadmin. */
export function puedeVerDeAutor(actor: Actor | null | undefined, autorId: number, bajoMiMando: ReadonlySet<number>): boolean {
  if (!reglasActivas()) return true;
  if (!actor?.id) return false;
  if (esSuperAdmin(actor)) return true;
  return autorId === actor.id || bajoMiMando.has(autorId);
}

/** Deja solo claves de acceso conocidas, sin repetir. */
export function normalizarAccesos(valor: unknown): ClaveAcceso[] {
  if (!Array.isArray(valor)) return [];
  const validas = new Set<string>(CLAVES_ACCESO);
  return [...new Set(valor.map((v) => String(v).trim()).filter((v) => validas.has(v)))] as ClaveAcceso[];
}
