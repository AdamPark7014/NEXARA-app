/**
 * Estatus canónico de Actividad.
 *
 * `Activity.estatus` es una columna de texto libre y el código llegó a usar dos
 * grafías para el mismo estado: `Finalizada` (femenino) y `Finalizado`
 * (masculino). La única ruta que escribe un estado final —el cierre de hoja de
 * servicio— guarda `Finalizada`; sin embargo once puntos de lectura filtran por
 * `Finalizado`, valor que **ningún** camino escribe. Esos informes (KPIs de
 * dirección, analítica, cron de SLA, triage, buscador…) leían cero o contaban
 * como abiertas actividades ya cerradas.
 *
 * Este módulo fija el vocabulario y ofrece emparejado tolerante a alias, de modo
 * que las filas históricas —escritas con cualquiera de las dos grafías— se leen
 * correctamente sin necesidad de migrar datos.
 */

export const ACTIVITY_STATUS = {
  PENDIENTE: 'Pendiente',
  ASIGNADA: 'Asignada',
  EN_PROCESO: 'En Proceso',
  /**
   * Trabajo terminado en campo, a la espera de la validación del Arquitecto.
   *
   * El organigrama define esa validación ("Validación final de trabajos" y
   * "Josué valida y envía a Administración y Dirección"), pero antes no existía:
   * la actividad se cerraba sola al completar las evidencias. Reutilizar
   * `Pendiente` tampoco servía, porque no distinguía lo que nadie ha empezado
   * de lo que espera visto bueno.
   */
  POR_VALIDAR: 'Por Validar',
  FINALIZADA: 'Finalizada',
  RECHAZADA: 'Rechazada',
  CANCELADA: 'Cancelada',
} as const;

export type ActivityStatus = (typeof ACTIVITY_STATUS)[keyof typeof ACTIVITY_STATUS];

/**
 * Grafías históricas aceptadas por cada estado canónico.
 *
 * Se comparan normalizadas (sin acentos, sin espacios, minúsculas), así que
 * basta con listar las variantes de género y separador.
 */
const STATUS_ALIASES: Record<ActivityStatus, string[]> = {
  [ACTIVITY_STATUS.PENDIENTE]: ['pendiente'],
  [ACTIVITY_STATUS.ASIGNADA]: ['asignada', 'asignado'],
  [ACTIVITY_STATUS.EN_PROCESO]: ['enproceso', 'enprogreso'],
  [ACTIVITY_STATUS.POR_VALIDAR]: ['porvalidar', 'envalidacion', 'pendientevalidacion'],
  [ACTIVITY_STATUS.FINALIZADA]: ['finalizada', 'finalizado', 'completada', 'completado'],
  [ACTIVITY_STATUS.RECHAZADA]: ['rechazada', 'rechazado'],
  [ACTIVITY_STATUS.CANCELADA]: ['cancelada', 'cancelado'],
};

/** Estados que cierran la actividad: no consumen SLA ni cuentan como abiertas. */
export const CLOSED_STATUSES: ActivityStatus[] = [
  ACTIVITY_STATUS.FINALIZADA,
  ACTIVITY_STATUS.CANCELADA,
];

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Estado canónico correspondiente a un valor cualquiera, o `null` si no se reconoce. */
export function normalizeActivityStatus(raw: unknown): ActivityStatus | null {
  const key = normalizeKey(raw);
  if (!key) return null;

  for (const [canonical, aliases] of Object.entries(STATUS_ALIASES) as Array<
    [ActivityStatus, string[]]
  >) {
    if (aliases.includes(key)) return canonical;
  }
  return null;
}

/**
 * Todas las grafías almacenadas que equivalen a un estado canónico.
 *
 * Es lo que hay que usar en los `where` de Prisma: los datos existentes mezclan
 * ambas formas y filtrar por una sola deja fuera la mitad.
 */
export function statusVariants(status: ActivityStatus): string[] {
  const aliases = STATUS_ALIASES[status] ?? [];
  const out = new Set<string>([status]);

  for (const alias of aliases) {
    // Reconstruye las grafías reales a partir del alias normalizado.
    if (alias === 'porvalidar') out.add('Por Validar');
    else if (alias === 'envalidacion') out.add('En Validacion');
    else if (alias === 'pendientevalidacion') out.add('Pendiente Validacion');
    else if (alias === 'enproceso') out.add('En Proceso');
    else if (alias === 'enprogreso') {
      out.add('En Progreso');
      out.add('EN_PROGRESO');
    } else {
      out.add(alias.charAt(0).toUpperCase() + alias.slice(1));
    }
  }

  return [...out];
}

/** Variantes de todos los estados que cierran una actividad. */
export function closedStatusVariants(): string[] {
  return [...new Set(CLOSED_STATUSES.flatMap((status) => statusVariants(status)))];
}

/** `where` de Prisma para actividades cerradas. */
export const CLOSED_ACTIVITY_WHERE = { estatus: { in: closedStatusVariants() } };

/** `where` de Prisma para actividades abiertas (todo lo que no está cerrado). */
export const OPEN_ACTIVITY_WHERE = { estatus: { notIn: closedStatusVariants() } };

/**
 * `where` de Prisma para actividades finalizadas **con éxito**.
 *
 * Distinto de `CLOSED_ACTIVITY_WHERE`: los KPIs de trabajo completado no deben
 * contar las canceladas.
 */
export const FINISHED_ACTIVITY_WHERE = {
  estatus: { in: statusVariants(ACTIVITY_STATUS.FINALIZADA) },
};

/** True si el valor almacenado corresponde a una actividad cerrada. */
export function isClosedStatus(raw: unknown): boolean {
  const status = normalizeActivityStatus(raw);
  return status != null && CLOSED_STATUSES.includes(status);
}

/** True si el valor almacenado corresponde a una actividad finalizada con éxito. */
export function isFinishedStatus(raw: unknown): boolean {
  return normalizeActivityStatus(raw) === ACTIVITY_STATUS.FINALIZADA;
}

function toSqlList(values: string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
}

/** Lista SQL entrecomillada para los `$queryRaw` que aún filtran por texto. */
export function closedStatusSqlList(): string {
  return toSqlList(closedStatusVariants());
}

/** Igual que la anterior, pero solo para finalizadas con éxito. */
export function finishedStatusSqlList(): string {
  return toSqlList(statusVariants(ACTIVITY_STATUS.FINALIZADA));
}
