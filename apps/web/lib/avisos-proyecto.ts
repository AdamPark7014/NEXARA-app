/**
 * Confirmaciones de desactivar y eliminar un proyecto operativo. Las usan la ficha del
 * proyecto (`OpsProjectDetailShell`) y la ficha del cliente, para que digan lo mismo.
 */

/** Una frase: queda inactivo, se conservan actividades e historial y se puede reactivar. */
export function avisoAlDesactivarProyecto(titulo: string): string {
  return `«${titulo}» quedará inactivo: sus actividades y su historial se conservan y podrás reactivarlo después.`;
}

/**
 * Una frase: se borra para siempre (las actividades guardan su historial) y, aparte,
 * la alternativa de desactivarlo si solo está detenido.
 */
export function avisoAlEliminarProyecto(titulo: string): string {
  return `El proyecto «${titulo}» se eliminará para siempre y sus actividades conservarán su historial; si solo está detenido, mejor desactívalo.`;
}
