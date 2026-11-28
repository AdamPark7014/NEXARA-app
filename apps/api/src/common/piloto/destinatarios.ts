/**
 * A quién se le avisa en el Piloto: personas REALES de UNA empresa.
 *
 * Tres piezas:
 *   - `personasPorRol`: quienes tienen uno de esos roles, activos, miembros de la empresa, sin cuentas técnicas,
 *     de prueba ni demo (el mismo filtro de `esDestinatarioFinanzas`: developer, Claudia de pruebas, play.review,
 *     `.invalid`, `demo@…`, `@example.com`, puesto «demo»…).
 *   - `direccionReal`: CEO, Director Administrativo y Director de Operaciones de esa empresa.
 *   - `destinatariosConfigurados`: la lista que Adam deja escrita en `system_settings` por área
 *     (`{"VENTAS":[12,14],"SOPORTE":[31]}`), validada contra la base en cada lectura.
 *
 * Reglas que no se negocian:
 *   - La empresa siempre es explícita. Un `companyId` ausente o inválido da lista VACÍA: Prisma ignora un filtro
 *     `undefined`, y `companyMemberships: { some: { companyId: undefined } }` traería a los miembros de TODAS las
 *     empresas. Los crons no tienen empresa de petición y el middleware de Prisma no los acota
 *     («Outside HTTP… do not auto-scope»), así que aquí se acota a mano.
 *   - Nunca una cuenta comodín «la 1 de la empresa 1»: la Demo (empresa 2) no recibe trabajo de otra empresa.
 *   - Un error de la base se propaga (quien llama decide si lo registra y sigue). Un dato mal formado en
 *     `system_settings` (JSON roto, tipos raros, un id que no cabe en el INT4 de la base) NUNCA lanza: el id malo se
 *     descarta ANTES de consultar y los buenos se atienden. Por eso no se envuelve el `findMany` en un try/catch: se
 *     tragaría también una base caída, que sí debe propagarse.
 *   - Los ids que Adam escribe a mano en `destinatariosConfigurados` se aceptan si la persona sigue activa y es de la
 *     empresa; no se les aplica el filtro de cuentas de prueba porque elegirlas es decisión expresa de quien tiene
 *     permiso CONSOLE_ADMIN para escribir esa lista.
 */
import { ROLES } from '../rbac/roles.v2.js';
import { esDestinatarioFinanzas } from '../finance-notification-recipient.js';

/** Quienes reciben lo que «le toca a la dirección» (common/rbac/roles.v2.ts). */
export const ROLES_DIRECCION = [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES] as const;

/** Lo que se necesita de una persona para avisarle o para escalar a su jefe. */
export type Destinatario = {
  id: number;
  email: string;
  puesto: string | null;
  managerId: number | null;
  roleKey: string | null;
};

/** Lo mínimo de Prisma que usan estas funciones. `PrismaService` lo cumple tal cual. */
export type LectorUsuarios = {
  user: { findMany(args: any): Promise<any[]> };
  systemSetting: { findMany(args: any): Promise<Array<{ companyId: number | null; value: string }>> };
};

const SELECT_DESTINATARIO = { id: true, email: true, puesto: true, managerId: true, roleKey: true } as const;
/** Tope de ids por área: la lista la escribe una persona, no hace falta más y acota la consulta. */
const MAX_IDS_POR_AREA = 100;
/**
 * Los ids de `User` y de `CompanyProfile` son `Int` de 32 bits en la base (INT4). Un entero mayor, aunque sea «seguro»
 * para JavaScript, hace que Postgres rechace TODA la consulta («Unable to fit integer value … into an INT4») y la
 * excepción saldría de estas funciones: un solo id escrito de más tiraría a todos los destinatarios del área.
 */
const ID_MAXIMO = 2_147_483_647;

/** Un id que cabe en la columna: entero positivo de hasta 32 bits. Nada fuera de ese rango llega a la base. */
const idValido = (id: unknown): id is number =>
  typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && id <= ID_MAXIMO;

const empresaValida = (companyId: unknown): companyId is number => idValido(companyId);

/**
 * Personas activas de la empresa con alguno de esos roles. Sin cuentas técnicas, de prueba ni demo. `excluir` quita
 * ids concretos (p. ej. quien hizo la acción). Orden estable por id. Sin empresa válida o sin roles: `[]`.
 */
export async function personasPorRol(
  prisma: Pick<LectorUsuarios, 'user'>,
  companyId: number,
  roles: readonly string[],
  opciones: { excluir?: readonly number[] } = {},
): Promise<Destinatario[]> {
  if (!empresaValida(companyId) || roles.length === 0) return [];
  const filas = (await prisma.user.findMany({
    where: { isActive: true, roleKey: { in: [...roles] }, companyMemberships: { some: { companyId } } },
    select: SELECT_DESTINATARIO,
    orderBy: { id: 'asc' },
  })) as Destinatario[];
  const fuera = new Set(opciones.excluir ?? []);
  return filas.filter((u) => !fuera.has(u.id) && esDestinatarioFinanzas(u));
}

/** CEO, Director Administrativo y Director de Operaciones reales de la empresa. */
export function direccionReal(
  prisma: Pick<LectorUsuarios, 'user'>,
  companyId: number,
  excluir?: readonly number[],
): Promise<Destinatario[]> {
  return personasPorRol(prisma, companyId, ROLES_DIRECCION, { excluir });
}

/** `{"VENTAS":[1,2]}` → `Map('VENTAS' → [1,2])`. Cualquier otra forma (o JSON roto) → mapa vacío. */
function leerAreas(texto: string): Map<string, number[]> {
  const areas = new Map<string, number[]>();
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return areas;
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return areas;
  for (const [nombre, valor] of Object.entries(datos as Record<string, unknown>)) {
    if (!Array.isArray(valor)) continue;
    const ids: number[] = [];
    for (const x of valor) {
      const id = typeof x === 'string' && /^\d{1,15}$/.test(x.trim()) ? Number(x.trim()) : x;
      if (idValido(id) && !ids.includes(id)) ids.push(id);
      if (ids.length >= MAX_IDS_POR_AREA) break;
    }
    // `{"ventas":[1],"VENTAS":[2]}` son la misma área: se juntan, no se queda solo la última.
    const clave = nombre.trim().toUpperCase();
    const previos = areas.get(clave);
    if (!previos) {
      areas.set(clave, ids);
      continue;
    }
    for (const id of ids) {
      if (previos.length >= MAX_IDS_POR_AREA) break;
      if (!previos.includes(id)) previos.push(id);
    }
  }
  return areas;
}

/**
 * La lista que Adam dejó en `system_settings` bajo `clave`, como JSON `{"VENTAS":[ids],"SOPORTE":[ids]}`.
 *
 * - `area`: devuelve solo esa área (sin importar mayúsculas). Sin `area`, la unión de todas, sin repetidos.
 * - Cada id se valida en CADA lectura: debe seguir activo y ser miembro de `companyId`. Los que no, se descartan.
 * - Fila: la de la empresa gana a la de plataforma (como `SettingsService.getValue`); una fila de OTRA empresa
 *   nunca cuenta. Sin fila, JSON roto o forma inesperada: `[]`.
 */
export async function destinatariosConfigurados(
  prisma: LectorUsuarios,
  companyId: number,
  clave: string,
  area?: string,
): Promise<Destinatario[]> {
  if (!empresaValida(companyId)) return [];
  const filas = await prisma.systemSetting.findMany({
    where: { key: clave, OR: [{ companyId }, { companyId: null }] },
    select: { companyId: true, value: true },
  });
  const fila = filas.find((f) => f.companyId === companyId) ?? filas.find((f) => f.companyId == null);
  if (!fila) return [];

  const areas = leerAreas(String(fila.value ?? ''));
  const pedidas = area == null ? [...areas.values()].flat() : (areas.get(area.trim().toUpperCase()) ?? []);
  const ids = [...new Set(pedidas)];
  if (ids.length === 0) return [];

  const filasUsuario = (await prisma.user.findMany({
    where: { id: { in: ids }, isActive: true, companyMemberships: { some: { companyId } } },
    select: SELECT_DESTINATARIO,
  })) as Destinatario[];
  // En el orden en que Adam los escribió.
  const porId = new Map(filasUsuario.map((u) => [u.id, u]));
  return ids.flatMap((id) => porId.get(id) ?? []);
}
