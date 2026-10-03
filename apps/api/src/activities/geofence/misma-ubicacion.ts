/**
 * ¿La foto de salida tiene que tomarse donde se inició la actividad?
 *
 * Regla de Adam (02-10): lo decide el **tipo** de actividad, ya no el área de quien la
 * hace. El punto de referencia es donde esa persona inició esa actividad (su foto de
 * entrada), nunca la oficina: la geocerca de la oficina es solo de asistencia.
 *
 * - Servicio, proyecto, obra y tarea se terminan donde se empezaron.
 * - Hay tareas que por naturaleza acaban en otro lado: recoger, entregar o comprar
 *   material. Ahí no se exige.
 * - Comercial (y cualquier tipo que no esté en la lista) tampoco: la foto y el GPS se
 *   guardan igual, sin tope de distancia.
 */
const TIPOS_QUE_TERMINAN_DONDE_INICIAN = new Set(['servicio', 'proyecto', 'obra', 'tarea']);

/**
 * Subtipos de tarea que terminan en otro lugar. El subtipo viaja en `ticketTypeCustom`
 * como la etiqueta del chip («Recolección», «Entrega», «Compra de material» — ver
 * `TAREA_TIPOS` en apps/web/lib/activity-kinds.ts); se acepta también el id por si un
 * cliente manda ese.
 */
const TAREAS_QUE_TERMINAN_EN_OTRO_LADO = new Set([
  'recoleccion',
  'entrega',
  'compra',
  'compra de material',
]);

/** Sin acentos, sin mayúsculas y con los espacios colapsados: «  RECOLECCIÓN » → «recoleccion». */
function normalizar(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function tareaTerminaEnOtroLado(ticketTypeCustom: string | null | undefined): boolean {
  return TAREAS_QUE_TERMINAN_EN_OTRO_LADO.has(normalizar(ticketTypeCustom));
}

export function exigeMismaUbicacionPorTipo(
  coreKind: string | null | undefined,
  ticketTypeCustom?: string | null,
): boolean {
  const tipo = normalizar(coreKind);
  if (!TIPOS_QUE_TERMINAN_DONDE_INICIAN.has(tipo)) return false;
  if (tipo === 'tarea' && tareaTerminaEnOtroLado(ticketTypeCustom)) return false;
  return true;
}
