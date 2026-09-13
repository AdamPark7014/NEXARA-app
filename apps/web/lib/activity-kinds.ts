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
    // El subtipo (Levantamiento, Junta…) viaja en ticketTypeCustom; ver TAREA_TIPOS.
    ticketType: 'OTRO',
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

/**
 * Subtipos de Tarea. Se guardan como ticketType OTRO + ticketTypeCustom = label
 * (o el texto libre de «Otro»). Servicio, proyecto, obra y comercial no van aquí:
 * ya tienen su propio tipo.
 */
export type TareaTipoId =
  | 'levantamiento'
  | 'recoleccion'
  | 'entrega'
  | 'junta'
  | 'compra'
  | 'preparacion'
  | 'tramite'
  | 'capacitacion'
  | 'documentacion'
  | 'otro';

export const TAREA_TIPOS: ReadonlyArray<{ id: TareaTipoId; label: string; emoji: string }> = [
  { id: 'levantamiento', label: 'Levantamiento', emoji: '📐' },
  { id: 'recoleccion', label: 'Recolección', emoji: '📦' },
  { id: 'entrega', label: 'Entrega', emoji: '🚚' },
  { id: 'junta', label: 'Junta', emoji: '🤝' },
  { id: 'compra', label: 'Compra de material', emoji: '🛒' },
  { id: 'preparacion', label: 'Preparación de equipo', emoji: '🔧' },
  { id: 'tramite', label: 'Trámite', emoji: '📄' },
  { id: 'capacitacion', label: 'Capacitación', emoji: '🎓' },
  { id: 'documentacion', label: 'Reporte / documentación', emoji: '📝' },
  { id: 'otro', label: 'Otro', emoji: '✏️' },
];

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
  [ORG_EMAILS.luis]: ['tarea', 'proyecto', 'servicio', 'comercial'],
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
  [ORG_EMAILS.luis]: ['tarea', 'proyecto', 'servicio', 'comercial'],
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

/** Encargo al responsable (encargados con gente a cargo). */
export type AssignmentCharge = 'ejecucion' | 'despacho';

export type AssignmentChargeMeta = {
  id: AssignmentCharge;
  title: string;
  help: string;
  badge: string;
};

export const ASSIGNMENT_CHARGES: Record<AssignmentCharge, AssignmentChargeMeta> = {
  ejecucion: {
    id: 'ejecucion',
    title: 'Ejecución directa',
    help: 'Queda a su cargo personal: la realiza él mismo.',
    badge: 'Ejecución',
  },
  despacho: {
    id: 'despacho',
    title: 'Despacho a equipo',
    help: 'Queda a su cargo coordinar: la asigna a alguien de su subordinación.',
    badge: 'Despacho',
  },
};

/** Encargados a quienes dirección asigna como despacho (siempre coordinan, no ejecutan). */
const CHARGE_MANAGER_EMAILS = new Set<string>([
  ORG_EMAILS.david,
  ORG_EMAILS.luis,
  ORG_EMAILS.antonio,
  ORG_EMAILS.josue,
]);

/**
 * Encargados de área: se auto-asignan (solo a sí mismos) y ordenan su cola en
 * Mis actividades con justificación. Espejo de AREA_MANAGER_EMAILS en la API
 * (apps/api/src/me/my-activities.service.ts).
 */
const AREA_MANAGER_EMAILS = new Set<string>([
  ORG_EMAILS.developer,
  ORG_EMAILS.david,
  ORG_EMAILS.luis,
  ORG_EMAILS.antonio,
  ORG_EMAILS.josue,
  ORG_EMAILS.daniela,
  ORG_EMAILS.monica,
]);

export function isAreaManagerEmail(email?: string | null): boolean {
  return AREA_MANAGER_EMAILS.has(norm(email));
}

export function isCeoEmail(email?: string | null): boolean {
  return norm(email) === ORG_EMAILS.ceo;
}

export function canOfferAssignmentCharge(email?: string | null): boolean {
  return CHARGE_MANAGER_EMAILS.has(norm(email));
}

/**
 * Solo Luis + Servicio: al asignarle no hay elección — siempre «Despacho a equipo» + cupo.
 * David / Antonio / Josué siguen eligiendo con canOfferAssignmentCharge.
 */
export function forcesDespachoOnly(
  email?: string | null,
  kind?: ActivityKind | null,
): boolean {
  return norm(email) === ORG_EMAILS.luis && kind === 'servicio';
}

/**
 * Solo Luis + Tarea / Proyecto / Comercial: ejecución directa (actividad personal),
 * sin paso de despacho ni picker de equipo.
 */
export function forcesEjecucionOnly(
  email?: string | null,
  kind?: ActivityKind | null,
): boolean {
  if (norm(email) !== ORG_EMAILS.luis || !kind) return false;
  return kind === 'tarea' || kind === 'proyecto' || kind === 'comercial';
}

/** Prefijo en indicaciones LEAD para el cupo de personas del despacho. */
export function formatDispatchHeadcountNote(n: number, extra?: string): string {
  const cupo = Math.max(1, Math.min(50, Math.round(Number(n) || 1)));
  const base = `Cupo: ${cupo} persona${cupo === 1 ? '' : 's'}.`;
  const more = (extra || '').trim();
  return more ? `${base} ${more}` : base;
}

export function parseDispatchHeadcount(text?: string | null): number | null {
  if (!text) return null;
  const m = text.match(/Cupo:\s*(\d+)\s*persona/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pool típico de subordinados para despacho (por email del encargado). */
export function dispatchPoolEmails(managerEmail?: string | null): string[] {
  const e = norm(managerEmail);
  if (e === ORG_EMAILS.david) return fieldInstallerEmails();
  if (e === ORG_EMAILS.antonio) return servicioDelegateEmails();
  if (e === ORG_EMAILS.josue) return fieldInstallerEmails();
  // Luis solo manda a Antonio; Antonio decide el soporte.
  if (e === ORG_EMAILS.luis) return [ORG_EMAILS.antonio];
  return [];
}

/** Encargado de área del miembro (instaladores → David, soporte → Antonio). */
export function coordinatorEmailForMember(email?: string | null): string | null {
  const e = norm(email);
  if (!e) return null;
  if (
    e === ORG_EMAILS.david ||
    e === ORG_EMAILS.antonio ||
    e === ORG_EMAILS.josue ||
    e === ORG_EMAILS.luis
  ) {
    return e;
  }
  if (fieldInstallerEmails().includes(e)) return ORG_EMAILS.david;
  if (servicioDelegateEmails().includes(e)) return ORG_EMAILS.antonio;
  return null;
}

/**
 * Pool de equipo al asignar: en despacho une subordinados del encargado +
 * extras del tipo (p. ej. Proyecto = instaladores + soporte).
 * Devuelve [] si no hay filtro (usar roster completo).
 */
export function teamPoolEmailsForAssignment(opts: {
  managerEmail?: string | null;
  kind?: ActivityKind | null;
  charge?: AssignmentCharge | null;
}): string[] {
  const manager = norm(opts.managerEmail);
  const fromCharge =
    opts.charge === 'despacho' ? dispatchPoolEmails(opts.managerEmail) : [];
  const fromKind = extrasEmailsForKind(opts.kind ?? null) ?? [];
  if (!fromCharge.length && !fromKind.length) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...fromCharge, ...fromKind]) {
    const e = norm(raw);
    if (!e || e === manager || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/** Coordinadores ajenos al responsable primario que hay que sumar (LEAD). */
export function peerCoordinatorEmails(opts: {
  primaryEmail?: string | null;
  memberEmails: string[];
}): string[] {
  const primary = norm(opts.primaryEmail);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of opts.memberEmails) {
    const coord = coordinatorEmailForMember(raw);
    if (!coord || coord === primary || seen.has(coord)) continue;
    seen.add(coord);
    out.push(coord);
  }
  return out;
}

export function labelForAssignmentCharge(charge?: string | null): AssignmentChargeMeta | null {
  if (charge === 'ejecucion' || charge === 'despacho') return ASSIGNMENT_CHARGES[charge];
  return null;
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
