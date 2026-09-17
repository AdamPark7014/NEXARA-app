/**
 * Superiores de quien ejecuta una actividad: los únicos que la cancelan o la pasan a otro compañero.
 *
 * Es superior de una persona en la actividad:
 *  - su jefe por organigrama (`managerId` hacia arriba, cualquier nivel);
 *  - el responsable o quien la creó, siempre que no la esté ejecutando él mismo;
 *  - un encargado (LEAD activo) que la recibió antes que esa persona (la cadena de despacho);
 *  - Christian (y su equivalente de pruebas) y la cuenta de desarrollo, sobre cualquiera.
 *
 * Cancelar exige ser superior de **todos** los que la ejecutan; pasarla a otro compañero, de la
 * persona a la que se reemplaza. Las reglas son funciones puras para probarlas sin base de datos;
 * `loadActivityChain` arma el contexto desde Prisma.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { isCeoEquivalentEmail, isDeveloperSuperAdminEmail } from '../common/platform-accounts.js';
import { companyWhere } from '../common/tenant/tenant-scope.js';
import { ACTIVITY_STATUS, normalizeActivityStatus } from './activity-status.js';

/** Dos personas sumadas con menos de 5 s de diferencia están en el mismo nivel de la cadena. */
export const MISMO_MOMENTO_MS = 5_000;

/** Motivo mínimo para cancelar o pasar una actividad. */
export const MOTIVO_MINIMO = 10;
export const MOTIVO_MAXIMO = 400;

export const CANCEL_FORBIDDEN =
  'Solo los superiores de quien ejecuta la actividad (su jefe, el responsable o quien la asignó, el encargado que la repartió o Christian) pueden cancelarla';
export const REASSIGN_FORBIDDEN =
  'Solo los superiores de esa persona en la actividad (su jefe, el responsable o quien la asignó, el encargado que la repartió o Christian) pueden pasarla a otro compañero';

export type ChainMember = {
  userId: number;
  rol: string;
  asignadoAt: Date;
};

export type ActivityChain = {
  id: number;
  companyId: number;
  titulo: string;
  estatus: string;
  responsableId: number;
  creadoPorId: number;
  assignmentCharge: string | null;
  /** Equipo activo (sin retirados). */
  members: ChainMember[];
  /** Jefes (managerId hacia arriba) de cada persona de la actividad. */
  managersOf: Map<number, Set<number>>;
  nombres: Map<number, string>;
};

export type ChainActor = { id: number; email?: string | null };

/** Christian, su equivalente de pruebas o la cuenta de desarrollo. */
export function isChainTopAuthority(actor?: ChainActor | null): boolean {
  return isCeoEquivalentEmail(actor?.email) || isDeveloperSuperAdminEmail(actor?.email);
}

/**
 * Quienes ejecutan: equipo activo + responsable. En despacho, quien reparte (LEAD, incluido el
 * responsable) no ejecuta. Misma regla que las evidencias obligatorias.
 */
export function chainExecutorIds(chain: Pick<ActivityChain, 'responsableId' | 'assignmentCharge' | 'members'>): number[] {
  const despacho = chain.assignmentCharge === 'despacho';
  const reparten = new Set<number>(
    despacho ? [chain.responsableId, ...chain.members.filter((m) => m.rol === 'LEAD').map((m) => m.userId)] : [],
  );
  return [...new Set([chain.responsableId, ...chain.members.map((m) => m.userId)].filter(Boolean))].filter(
    (id) => !reparten.has(id),
  );
}

/** Personas de la actividad a las que se les puede pasar el trabajo a otro: responsable + equipo activo. */
export function chainPeopleIds(chain: Pick<ActivityChain, 'responsableId' | 'members'>): number[] {
  return [...new Set([chain.responsableId, ...chain.members.map((m) => m.userId)].filter(Boolean))];
}

/** `actor` es superior de `targetUserId` dentro de esta actividad. */
export function isSuperiorInChain(actor: ChainActor | null | undefined, chain: ActivityChain, targetUserId: number): boolean {
  if (!actor?.id || !targetUserId) return false;
  if (actor.id === targetUserId) return false;
  if (isChainTopAuthority(actor)) return true;

  if (chain.managersOf.get(targetUserId)?.has(actor.id)) return true;

  const ejecuta = chainExecutorIds(chain).includes(actor.id);
  if (!ejecuta && (chain.responsableId === actor.id || chain.creadoPorId === actor.id)) return true;

  // Encargado que la recibió antes (o a la vez, si la otra persona no es encargado).
  const mine = chain.members.find((m) => m.userId === actor.id && m.rol === 'LEAD');
  const target = chain.members.find((m) => m.userId === targetUserId);
  if (mine && target) {
    const diff = target.asignadoAt.getTime() - mine.asignadoAt.getTime();
    if (diff > MISMO_MOMENTO_MS) return true;
    if (Math.abs(diff) <= MISMO_MOMENTO_MS && target.rol !== 'LEAD') return true;
  }
  return false;
}

/** Puede cancelar: superior de todos los que la ejecutan (o del responsable si aún nadie la ejecuta). */
export function canCancelActivity(actor: ChainActor | null | undefined, chain: ActivityChain): boolean {
  if (!actor?.id) return false;
  if (isChainTopAuthority(actor)) return true;
  const ejecutores = chainExecutorIds(chain);
  const objetivo = ejecutores.length ? ejecutores : [chain.responsableId];
  return objetivo.every((id) => isSuperiorInChain(actor, chain, id));
}

/** Puede pasar el trabajo de `fromUserId` a otro compañero. */
export function canReassignFrom(actor: ChainActor | null | undefined, chain: ActivityChain, fromUserId: number): boolean {
  if (!chainPeopleIds(chain).includes(fromUserId)) return false;
  return isSuperiorInChain(actor, chain, fromUserId);
}

/** Motivo limpio o `null` si no alcanza el mínimo. */
export function cleanMotivo(raw: unknown): string | null {
  const motivo = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (motivo.length < MOTIVO_MINIMO) return null;
  return motivo.slice(0, MOTIVO_MAXIMO);
}

export function isCancelledStatus(raw: unknown): boolean {
  return normalizeActivityStatus(raw) === ACTIVITY_STATUS.CANCELADA;
}

type PrismaLike = {
  activity: { findFirst: (args: any) => Promise<any> };
  user: { findMany: (args: any) => Promise<Array<{ id: number; managerId: number | null; nombre?: string | null }>> };
};

/** Arma la cadena de la actividad (equipo activo, jefes por organigrama y nombres). */
export async function loadActivityChain(
  prisma: PrismaLike,
  activityId: number,
  companyId: number | null | undefined,
): Promise<ActivityChain> {
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, deletedAt: null, ...companyWhere(companyId ?? null) },
    select: {
      id: true,
      companyId: true,
      titulo: true,
      estatus: true,
      responsableId: true,
      creadoPorId: true,
      assignmentCharge: true,
      assignees: {
        where: { retiradoAt: null },
        select: { userId: true, rol: true, asignadoAt: true },
        orderBy: { asignadoAt: 'asc' },
      },
    },
  });
  if (!activity) throw new NotFoundException('Actividad no encontrada');

  const users = await prisma.user.findMany({ select: { id: true, managerId: true, nombre: true } });
  const jefeDe = new Map(users.map((u) => [u.id, u.managerId]));
  const nombres = new Map(users.map((u) => [u.id, String(u.nombre ?? '').trim()]));
  const members: ChainMember[] = (activity.assignees ?? []).map((m: any) => ({
    userId: m.userId,
    rol: String(m.rol),
    asignadoAt: new Date(m.asignadoAt),
  }));

  const managersOf = new Map<number, Set<number>>();
  for (const id of new Set([activity.responsableId, activity.creadoPorId, ...members.map((m) => m.userId)])) {
    const jefes = new Set<number>();
    let cur = jefeDe.get(id) ?? null;
    while (cur != null && cur !== id && !jefes.has(cur)) {
      jefes.add(cur);
      cur = jefeDe.get(cur) ?? null;
    }
    managersOf.set(id, jefes);
  }

  return {
    id: activity.id,
    companyId: activity.companyId,
    titulo: activity.titulo,
    estatus: activity.estatus,
    responsableId: activity.responsableId,
    creadoPorId: activity.creadoPorId,
    assignmentCharge: activity.assignmentCharge ?? null,
    members,
    managersOf,
    nombres,
  };
}

/** Lanza 403 si `actor` no puede cancelar. */
export function assertCanCancel(actor: ChainActor | null | undefined, chain: ActivityChain) {
  if (!canCancelActivity(actor, chain)) throw new ForbiddenException(CANCEL_FORBIDDEN);
}
