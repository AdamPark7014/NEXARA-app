/**
 * Tipos de actividad Core (hub Actividades / pizarra).
 *
 * Tipos visibles al asignar = intersección:
 *   lo que el CREADOR puede crear × lo que el DESTINATARIO puede recibir.
 *
 * Encargados de área (+ comercial): Christian, David, Luis, Antonio, Daniela, Mónica.
 * Campo David (Joan/Israel/Juan): solo reciben tarea/proyecto/obra.
 * Soporte Antonio (Carolina/Alejandro): solo reciben tarea/proyecto/servicio.
 * Josué Encargado de Obra: todo menos servicio
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
  daniela: 'daniela.hernandez@nexara.com.mx',
  monica: 'soluciones@nexara.com.mx',
  joan: 'joan.sanchez@nexara.com.mx',
  israel: 'israel.ramos@nexara.com.mx',
  juan: 'juan.gonzalez@nexara.com.mx',
  josue: 'infraestructura@nexara.com.mx',
} as const;

export const ACTIVITY_KINDS: Record<ActivityKind, ActivityKindMeta> = {
  tarea: {
    id: 'tarea',
    title: 'Tarea',
    help: 'Del día, sin proyecto ni cliente.',
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
    help: 'Solo encargados de área.',
    emoji: '💼',
    projectMode: 'without_project',
    ticketType: 'OTRO',
    ticketTypeCustom: 'COMERCIAL',
  },
};

const ALL: ActivityKind[] = ['tarea', 'proyecto', 'obra', 'servicio', 'comercial'];
const ORDER = ALL;

function norm(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

function intersect(a: ActivityKind[], b: ActivityKind[]): ActivityKind[] {
  const setB = new Set(b);
  return ORDER.filter((k) => a.includes(k) && setB.has(k));
}

/** Qué puede crear / mandar el logueado. */
const CREATE_BY_EMAIL: Record<string, ActivityKind[]> = {
  [ORG_EMAILS.ceo]: ALL,
  [ORG_EMAILS.developer]: ALL,
  [ORG_EMAILS.david]: ['tarea', 'proyecto', 'obra', 'comercial'],
  [ORG_EMAILS.luis]: ['tarea', 'servicio', 'comercial'],
  [ORG_EMAILS.antonio]: ['tarea', 'proyecto', 'servicio', 'comercial'],
  [ORG_EMAILS.daniela]: ['tarea', 'comercial'],
  [ORG_EMAILS.monica]: ['tarea', 'comercial'],
  [ORG_EMAILS.joan]: ['tarea'],
  [ORG_EMAILS.israel]: ['tarea'],
  [ORG_EMAILS.juan]: ['tarea'],
  [ORG_EMAILS.carolina]: ['tarea'],
  [ORG_EMAILS.alejandro]: ['tarea'],
  [ORG_EMAILS.josue]: ['tarea', 'proyecto', 'obra', 'comercial'],
};

/** Qué se le puede asignar a esa persona. */
const RECEIVE_BY_EMAIL: Record<string, ActivityKind[]> = {
  [ORG_EMAILS.ceo]: ALL,
  [ORG_EMAILS.developer]: ALL,
  [ORG_EMAILS.david]: ['tarea', 'proyecto', 'obra', 'comercial'],
  [ORG_EMAILS.luis]: ['tarea', 'servicio', 'comercial'],
  [ORG_EMAILS.antonio]: ['tarea', 'proyecto', 'servicio', 'comercial'],
  // Campo de David
  [ORG_EMAILS.joan]: ['tarea', 'proyecto', 'obra'],
  [ORG_EMAILS.israel]: ['tarea', 'proyecto', 'obra'],
  [ORG_EMAILS.juan]: ['tarea', 'proyecto', 'obra'],
  // Soporte de Antonio
  [ORG_EMAILS.carolina]: ['tarea', 'proyecto', 'servicio'],
  [ORG_EMAILS.alejandro]: ['tarea', 'proyecto', 'servicio'],
  // Comercial / admin
  [ORG_EMAILS.daniela]: ['tarea', 'comercial'],
  [ORG_EMAILS.monica]: ['tarea', 'comercial'],
  // Josué Encargado de Obra
  [ORG_EMAILS.josue]: ['tarea', 'proyecto', 'obra', 'comercial'], // Encargado de obra (Josué): todo menos servicio
};

export function servicioBridgeEmail(): string {
  return ORG_EMAILS.antonio;
}

export function isServicioBridgeEmail(email?: string | null): boolean {
  return norm(email) === ORG_EMAILS.antonio;
}

export function servicioDelegateEmails(): string[] {
  return [ORG_EMAILS.carolina, ORG_EMAILS.alejandro];
}

export function soporteTeamEmails(): string[] {
  return [ORG_EMAILS.antonio, ORG_EMAILS.carolina, ORG_EMAILS.alejandro];
}

export function fieldInstallerEmails(): string[] {
  return [ORG_EMAILS.joan, ORG_EMAILS.israel, ORG_EMAILS.juan];
}

export function extrasEmailsForKind(kind: ActivityKind | null | undefined): string[] | null {
  if (kind === 'servicio') return soporteTeamEmails();
  if (kind === 'obra') return fieldInstallerEmails();
  if (kind === 'proyecto') return [...fieldInstallerEmails(), ...soporteTeamEmails()];
  if (kind === 'tarea' || kind === 'comercial' || kind === null || kind === undefined) return null;
  return null;
}

export function canCreateServicio(email?: string | null, v2?: RoleKey | null, isSuperAdmin?: boolean): boolean {
  if (isSuperAdmin || v2 === ROLES.CEO || v2 === ROLES.SUPER_ADMIN) return true;
  const e = norm(email);
  return e === ORG_EMAILS.luis || e === ORG_EMAILS.antonio || e === ORG_EMAILS.ceo;
}

export function kindsForCreator(opts: {
  v2Role: RoleKey | null | undefined;
  email?: string | null;
  isSuperAdmin?: boolean;
}): ActivityKind[] {
  if (opts.isSuperAdmin || opts.v2Role === ROLES.CEO || opts.v2Role === ROLES.SUPER_ADMIN) {
    return ALL;
  }
  const email = norm(opts.email);
  if (CREATE_BY_EMAIL[email]) return CREATE_BY_EMAIL[email];
  return ['tarea'];
}

export function kindsForTarget(email?: string | null): ActivityKind[] {
  const e = norm(email);
  if (!e) return ['tarea'];
  if (RECEIVE_BY_EMAIL[e]) return RECEIVE_BY_EMAIL[e];
  return ['tarea'];
}

/**
 * Tipos de actividad Core (hub Actividades / pizarra).
 *
 * Tipos visibles al asignar = intersección:
 *   lo que el CREADOR puede crear × lo que el DESTINATARIO puede recibir.
 *
 * Encargados de área (+ comercial): Christian, David, Luis, Antonio, Daniela, Mónica.
 * Campo David (Joan/Israel/Juan): solo reciben tarea/proyecto/obra.
 * Soporte Antonio (Carolina/Alejandro): solo reciben tarea/proyecto/servicio.
 * Josué Encargado de Obra: todo menos servicio
 */
export function kindsForAssignment(opts: {
  creatorEmail?: string | null;
  targetEmail?: string | null;
  v2Role?: RoleKey | null;
  isSuperAdmin?: boolean;
}): ActivityKind[] {
  const create = kindsForCreator({
    v2Role: opts.v2Role,
    email: opts.creatorEmail,
    isSuperAdmin: opts.isSuperAdmin,
  });
  if (!opts.targetEmail) return create;
  return intersect(create, kindsForTarget(opts.targetEmail));
}

export function metaForKind(kind: ActivityKind): ActivityKindMeta {
  return ACTIVITY_KINDS[kind];
}

export function servicioShouldGoToBridge(opts: {
  creatorEmail?: string | null;
  targetEmail?: string | null;
  isSuperAdmin?: boolean;
  isCeo?: boolean;
}): boolean {
  // Christian / superadmin: asignan servicio directo a cualquiera.
  if (opts.isSuperAdmin || opts.isCeo) return false;
  const creator = norm(opts.creatorEmail);
  const target = norm(opts.targetEmail);
  if (!creator || !target) return false;
  if (creator === ORG_EMAILS.ceo || creator === ORG_EMAILS.developer) {
    return false;
  }
  if (creator === ORG_EMAILS.antonio) return false;
  if (target === ORG_EMAILS.antonio) return false;
  // Luis (coord servicios) debe pasar primero por Antonio.
  return creator === ORG_EMAILS.luis;
}
