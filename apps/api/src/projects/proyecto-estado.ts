/**
 * Vocabulario de estados del proyecto, en español y en un solo sitio.
 *
 * `OperationalProjectStatus` nació con tres valores en inglés (ACTIVE, ON_HOLD,
 * COMPLETED) y la interfaz los traducía a mano en cada pantalla, con resultados
 * distintos: en clientes ON_HOLD salía como «Inactivo» y en OPS como «En pausa».
 * Aquí se fija la traducción y se añaden los dos estados que faltaban: un proyecto
 * aprobado que todavía no arranca (`PLANNED`) y uno que se cayó (`CANCELLED`), que
 * antes se disfrazaba de pausa indefinida.
 */

export const PROYECTO_ESTADOS = [
  'PLANNED',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
] as const;

export type ProyectoEstado = (typeof PROYECTO_ESTADOS)[number];

const ETIQUETAS: Record<ProyectoEstado, string> = {
  PLANNED: 'Planeado',
  ACTIVE: 'En curso',
  ON_HOLD: 'En pausa',
  COMPLETED: 'Terminado',
  CANCELLED: 'Cancelado',
};

/** Estados en los que el proyecto ya no consume calendario: no puede ir retrasado. */
export const ESTADOS_CERRADOS: ProyectoEstado[] = ['COMPLETED', 'CANCELLED'];

export function esEstadoProyecto(valor: unknown): valor is ProyectoEstado {
  return typeof valor === 'string' && (PROYECTO_ESTADOS as readonly string[]).includes(valor);
}

export function etiquetaEstadoProyecto(valor: unknown): string {
  return esEstadoProyecto(valor) ? ETIQUETAS[valor] : 'Sin estado';
}

export function esEstadoCerrado(valor: unknown): boolean {
  return esEstadoProyecto(valor) && ESTADOS_CERRADOS.includes(valor);
}

/**
 * Transiciones permitidas. No es burocracia: evita los dos errores que ya se han
 * visto en la operación —reabrir de un clic algo que se entregó y firmó, y marcar
 * como terminado un proyecto que nunca arrancó—.
 */
const TRANSICIONES: Record<ProyectoEstado, ProyectoEstado[]> = {
  PLANNED: ['ACTIVE', 'ON_HOLD', 'CANCELLED'],
  ACTIVE: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['ACTIVE', 'PLANNED', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['ACTIVE'],
  CANCELLED: ['PLANNED', 'ACTIVE'],
};

export function puedeTransicionar(desde: unknown, hacia: unknown): boolean {
  if (!esEstadoProyecto(desde) || !esEstadoProyecto(hacia)) return false;
  if (desde === hacia) return true;
  return TRANSICIONES[desde].includes(hacia);
}

/** Papeles del equipo, con su etiqueta. */
export const PROYECTO_ROLES_EQUIPO = [
  'RESPONSABLE',
  'COORDINADOR',
  'INGENIERO',
  'INSTALADOR',
  'ADMINISTRATIVO',
  'APOYO',
] as const;

export type ProyectoRolEquipo = (typeof PROYECTO_ROLES_EQUIPO)[number];

const ETIQUETAS_ROL: Record<ProyectoRolEquipo, string> = {
  RESPONSABLE: 'Responsable',
  COORDINADOR: 'Coordinador',
  INGENIERO: 'Ingeniero',
  INSTALADOR: 'Instalador',
  ADMINISTRATIVO: 'Administrativo',
  APOYO: 'Apoyo',
};

export function etiquetaRolEquipo(valor: unknown): string {
  return typeof valor === 'string' && valor in ETIQUETAS_ROL
    ? ETIQUETAS_ROL[valor as ProyectoRolEquipo]
    : 'Apoyo';
}
