/**
 * Quién abre una ficha del padrón y quién le suma un tipo.
 *
 * Es una sola regla para Ventas (`getClient`, `addClientSector`) y para Proyectos (abrirle un
 * proyecto a un cliente lo deja como cliente de proyecto): un corporativo o uno de proyecto lo
 * ve toda la empresa; un comercial solo su dueño, quien administra el padrón y quien lleva su
 * sector. Sumar un tipo es editar el padrón: lo hace quien administra el padrón y lleva ese
 * sector. Vive fuera de `VentasService` para que Proyectos no tenga que inyectarlo y para que
 * las dos puertas no se separen con el tiempo.
 */
import { ForbiddenException } from '@nestjs/common';
import { isSalesTeamLeadUser } from '../common/org-roles.js';
import { canManageClients, CLIENT_MANAGE_FORBIDDEN } from './client-permissions.js';
import {
  canSeeClientesModule,
  clientSectorsForActor,
  clientSectorsForEmail,
  sectoresDelCliente,
  type ClientSectorCode,
} from './client-sectors.js';

/** Lo que trae `req.user` (JWT) y que importa aquí. Cualquier objeto con estos campos sirve. */
export type ActorDelPadron =
  | {
      id?: number | null;
      email?: string | null;
      roleKey?: string | null;
      isSuperAdmin?: boolean;
      permissions?: string[];
      orgRoleKey?: string | null;
      role?: string | null;
    }
  | null
  | undefined;

/** Lo que hace falta de la ficha para decidir si alguien la abre. */
export type FichaDelPadron =
  | {
      ownerId?: number | null;
      tipo?: string | null;
      sectors?: Array<{ sector: string }> | null;
    }
  | null
  | undefined;

export const CLIENT_VIEW_FORBIDDEN = 'No tienes acceso a este cliente';
export const CLIENT_REUSE_FORBIDDEN =
  'Ya existe un cliente con ese nombre en el padrón y no tienes acceso a él. Pide a coordinación que le sume el tipo que necesitas.';

/** v2: coord_ventas y cualquier rol de tier >= 70 (coordinadores, directores, CEO). */
const V2_MANAGER_ROLES = new Set([
  'ceo',
  'dir_admin',
  'dir_operaciones',
  'arquitecto',
  'coord_ventas',
  'coord_operaciones',
  'coord_admin',
]);

export function esSuperAdmin(user: ActorDelPadron): boolean {
  return Boolean(user?.isSuperAdmin);
}

/**
 * Ve métricas y clientes del equipo completo: SuperAdmin, console admin / sales team lead
 * (legacy) o rol v2 de coordinación y dirección.
 */
export function esGerenteDeVentas(user: ActorDelPadron): boolean {
  if (!user) return false;
  if (esSuperAdmin(user)) return true;
  if (isSalesTeamLeadUser(user)) return true;
  return Boolean(user.roleKey && V2_MANAGER_ROLES.has(user.roleKey));
}

/** Abre lo de este dueño: sin dueño, cualquiera; si no, gerencia, la matriz de correos o el propio dueño. */
export function puedeAbrirDelDueno(user: ActorDelPadron, ownerId?: number | null): boolean {
  if (!ownerId) return true;
  if (esGerenteDeVentas(user)) return true;
  if (canSeeClientesModule(user?.email)) return true;
  return user?.id === ownerId;
}

/** Coordinación y gerencia ven el padrón de su empresa, no solo los clientes que ellos crearon. */
export function vePadronDeLaEmpresa(user: ActorDelPadron): boolean {
  if (esGerenteDeVentas(user)) return true;
  return canManageClients({ id: user?.id, email: user?.email, roleKey: user?.roleKey }, false);
}

/**
 * La regla de la ficha (`getClient`): por qué no puede abrirla, o `null` si puede.
 * Corporativo y proyecto se eligen en la actividad: son de la empresa, no del sector ni del
 * dueño. Un comercial lo abre su dueño, quien administra el padrón y quien lleva su sector.
 */
export function porQueNoVeCliente(client: FichaDelPadron, user: ActorDelPadron): string | null {
  const tipos = sectoresDelCliente(client);
  if (tipos.includes('CORPORATIVO') || tipos.includes('PROYECTO')) return null;
  if (!vePadronDeLaEmpresa(user) && !puedeAbrirDelDueno(user, client?.ownerId)) return CLIENT_VIEW_FORBIDDEN;
  const allowedSectors = clientSectorsForActor(user);
  if (allowedSectors.length && !esSuperAdmin(user) && !esGerenteDeVentas(user) && tipos.length) {
    if (!tipos.some((s) => allowedSectors.includes(s))) return CLIENT_VIEW_FORBIDDEN;
  }
  return null;
}

export function puedeVerCliente(client: FichaDelPadron, user: ActorDelPadron): boolean {
  return porQueNoVeCliente(client, user) === null;
}

export function assertPuedeVerCliente(client: FichaDelPadron, user: ActorDelPadron): void {
  const motivo = porQueNoVeCliente(client, user);
  if (motivo) throw new ForbiddenException(motivo);
}

/** Por qué no puede usar esos sectores (matriz de correos, si no el rol), o `null` si puede. */
export function porQueNoUsaSectores(user: ActorDelPadron, sectors: ClientSectorCode[]): string | null {
  if (esSuperAdmin(user)) return null;
  const byEmail = clientSectorsForEmail(user?.email);
  if (byEmail.length) {
    const vetado = sectors.find((s) => !byEmail.includes(s));
    return vetado ? `No puedes usar el sector ${vetado}` : null;
  }
  if (esGerenteDeVentas(user)) return null;
  const allowed = clientSectorsForActor(user);
  if (!allowed.length) return 'No tienes acceso al módulo de clientes';
  const vetado = sectors.find((s) => !allowed.includes(s));
  return vetado ? `No puedes usar el sector ${vetado}` : null;
}

export function assertPuedeUsarSectores(user: ActorDelPadron, sectors: ClientSectorCode[]): void {
  const motivo = porQueNoUsaSectores(user, sectors);
  if (motivo) throw new ForbiddenException(motivo);
}

type PrismaConUsuarios = { user: { count(args: unknown): Promise<number> } };

/** Tiene personal a su cargo: alguien activo lo tiene como jefe directo (`managerId`). */
export async function tienePersonalACargo(prisma: unknown, userId?: number | null): Promise<boolean> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const count = await (prisma as PrismaConUsuarios).user.count({ where: { managerId: id, isActive: true } });
  return count > 0;
}

/** Agrega y edita el padrón (`canManageClients`), contando a quien tiene gente a su cargo. */
export async function gestionaElPadron(prisma: unknown, user: ActorDelPadron): Promise<boolean> {
  const actor = { id: user?.id, email: user?.email, roleKey: user?.roleKey };
  if (canManageClients(actor, false)) return true;
  return canManageClients(actor, await tienePersonalACargo(prisma, user?.id));
}

/**
 * Lo mismo que pide `addClientSector`: abrir la ficha, editar el padrón y llevar ese sector.
 * Devuelve por qué no, o `null` si puede sumarle el tipo.
 */
export async function porQueNoSumaTipo(
  prisma: unknown,
  client: FichaDelPadron,
  user: ActorDelPadron,
  sector: ClientSectorCode,
): Promise<string | null> {
  const ficha = porQueNoVeCliente(client, user);
  if (ficha) return ficha;
  if (!(await gestionaElPadron(prisma, user))) return CLIENT_MANAGE_FORBIDDEN;
  return porQueNoUsaSectores(user, [sector]);
}
