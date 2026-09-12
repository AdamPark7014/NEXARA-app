/**
 * Tipos de actividad Core (hub Actividades / pizarra).
 * No hay módulos sidebar Tareas/Proyectos: el tipo decide el payload.
 *
 * Org (emails canónicos seed):
 * - Christian (gerencia@) → todos los tipos → cualquiera
 * - David (operaciones@) → tarea/proyecto/obra → instaladores
 * - Luis (direccion.operaciones@) → tarea/servicio → servicios van a Antonio
 * - Antonio (jose.ramirez@) → tarea/proyecto + servicio (puente) → Carolina/Alejandro
 */
import { ROLES, type RoleKey } from '@/lib/rbac/roles';
import type { ActivityProjectMode } from '@/lib/ops-activity-form';

export type ActivityKind = 'tarea' | 'proyecto' | 'obra' | 'servicio' | 'comercial';

export type ActivityKindMeta = {
  id: ActivityKind;
  title: string;
  help: string;
  emoji: string;
  projectMode: ActivityProjectMode;
  ticketType?: string;
  ticketTypeCustom?: string;
  needsServiceClient?: boolean;
  /** Servicio/obra: pedir día + hora de agenda. */
  requiresSchedule?: boolean;
};

export const ORG_EMAILS = {
  ceo: 'gerencia@nexara.com.mx',
  developer: 'developer@nexara.com.mx',
  david: 'operaciones@nexara.com.mx',
  luis: 'direccion.operaciones@nexara.com.mx',
  antonio: 'jose.ramirez@nexara.com.mx',
  carolina: 'soporte@nexara.com.mx',
  alejandro: 'alejandro.gonzalez@nexara.com.mx',
} as const;

export const ACTIVITY_KINDS: Record<ActivityKind, ActivityKindMeta> = {
  tarea: {
    id: 'tarea',
    title: 'Tarea',
    help: 'Del día, sin proyecto ni cliente. (Todos)',
    emoji: '✅',
    projectMode: 'without_project',
    ticketType: 'PREVENTIVO',
  },
  proyecto: {
    id: 'proyecto',
    title: 'Proyecto',
    help: 'Liga a un proyecto operativo y su cliente.',
    emoji: '📁',
    projectMode: 'with_project',
  },
  obra: {
    id: 'obra',
    title: 'Obra',
    help: 'Instalación / obra en sitio, ligada a proyecto.',
    emoji: '🏗️',
    projectMode: 'with_project',
    ticketType: 'INSTALACION',
    requiresSchedule: true,
  },
  servicio: {
    id: 'servicio',
    title: 'Servicio',
    help: 'Cliente de servicio. Luis → Antonio → soporte.',
    emoji: '🛠️',
    projectMode: 'without_project',
    needsServiceClient: true,
    requiresSchedule: true,
  },
  comercial: {
    id: 'comercial',
    title: 'Comercial',
    help: 'Seguimiento o compromiso comercial.',
    emoji: '💼',
    projectMode: 'without_project',
    ticketType: 'OTRO',
    ticketTypeCustom: 'COMERCIAL',
  },
};

const ALL: ActivityKind[] = ['tarea', 'proyecto', 'obra', 'servicio', 'comercial'];

/** Matriz por email (prioridad sobre rol genérico). */
const KINDS_BY_EMAIL: Record<string, ActivityKind[]> = {
  [ORG_EMAILS.ceo]: ALL,
  [ORG_EMAILS.developer]: ALL,
  [ORG_EMAILS.david]: ['tarea', 'proyecto', 'obra'],
  [ORG_EMAILS.luis]: ['tarea', 'servicio'],
  [ORG_EMAILS.antonio]: ['tarea', 'proyecto', 'servicio'],
  [ORG_EMAILS.carolina]: ['tarea'],
  [ORG_EMAILS.alejandro]: ['tarea'],
};

/** A quién deben llegar los servicios primero (puente). */
export function servicioBridgeEmail(): string {
  return ORG_EMAILS.antonio;
}

export function isServicioBridgeEmail(email?: string | null): boolean {
  return (email || '').toLowerCase() === ORG_EMAILS.antonio;
}

/** Subordinados de Antonio para delegar servicios. */
export function servicioDelegateEmails(): string[] {
  return [ORG_EMAILS.carolina, ORG_EMAILS.alejandro];
}

export function canCreateServicio(email?: string | null, v2?: RoleKey | null, isSuperAdmin?: boolean): boolean {
  if (isSuperAdmin || v2 === ROLES.CEO || v2 === ROLES.SUPER_ADMIN) return true;
  const e = (email || '').toLowerCase();
  return e === ORG_EMAILS.luis || e === ORG_EMAILS.antonio || e === ORG_EMAILS.ceo;
}

/** Qué tipos puede crear el usuario logueado. */
export function kindsForCreator(opts: {
  v2Role: RoleKey | null | undefined;
  email?: string | null;
  isSuperAdmin?: boolean;
}): ActivityKind[] {
  if (opts.isSuperAdmin || opts.v2Role === ROLES.CEO || opts.v2Role === ROLES.SUPER_ADMIN) {
    return ALL;
  }
  const email = (opts.email || '').toLowerCase();
  if (KINDS_BY_EMAIL[email]) return KINDS_BY_EMAIL[email];
  if (opts.v2Role === ROLES.COORD_OPERACIONES) {
    // fallback genérico coords: no asumir David
    return ['tarea', 'proyecto'];
  }
  return ['tarea'];
}

export function metaForKind(kind: ActivityKind): ActivityKindMeta {
  return ACTIVITY_KINDS[kind];
}

/**
 * Si el creador manda un servicio a alguien que no es el puente,
 * la UI debe avisar / redirigir a Antonio.
 */
export function servicioShouldGoToBridge(opts: {
  creatorEmail?: string | null;
  targetEmail?: string | null;
}): boolean {
  const creator = (opts.creatorEmail || '').toLowerCase();
  const target = (opts.targetEmail || '').toLowerCase();
  if (!creator || !target) return false;
  // Luis (y en general quien crea servicio que no es Antonio) debe apuntar al puente
  if (creator === ORG_EMAILS.antonio) return false;
  if (target === ORG_EMAILS.antonio) return false;
  return creator === ORG_EMAILS.luis || creator === ORG_EMAILS.ceo || creator === ORG_EMAILS.developer;
}
