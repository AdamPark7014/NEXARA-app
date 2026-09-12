/**
 * Tipos de actividad Core (hub Actividades / pizarra).
 * No hay módulos sidebar Tareas/Proyectos: el tipo decide el payload.
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
  /** Servicio pide cliente corporativo (sin proyecto). */
  needsServiceClient?: boolean;
};

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
  },
  servicio: {
    id: 'servicio',
    title: 'Servicio',
    help: 'Cliente de servicio corporativo (sin proyecto).',
    emoji: '🛠️',
    projectMode: 'without_project',
    needsServiceClient: true,
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
const OPS_FIELD: ActivityKind[] = ['tarea', 'proyecto', 'obra'];

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
  if (email === 'operaciones@nexara.com.mx' || opts.v2Role === ROLES.COORD_OPERACIONES) {
    return OPS_FIELD;
  }
  return ['tarea', 'proyecto'];
}

export function metaForKind(kind: ActivityKind): ActivityKindMeta {
  return ACTIVITY_KINDS[kind];
}