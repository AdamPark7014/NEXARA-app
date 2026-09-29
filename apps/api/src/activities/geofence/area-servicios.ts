/**
 * Área de Servicios.
 *
 * No hay una entidad «área». El área es el departamento (`Department.nombre`).
 * Una actividad es de esa área por el departamento de su responsable: es el mismo
 * vínculo que usa `findByDepartment`. El tipo `coreKind = servicio` es otra cosa:
 * un servicio lo puede ejecutar Sistemas, y una tarea puede ser de Servicios.
 */
export function normalizarNombreArea(nombre: string | null | undefined): string {
  return (nombre ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
}

/** El departamento se llama Servicios (sin importar mayúsculas ni acentos). */
export function esDepartamentoServicios(nombre: string | null | undefined): boolean {
  return normalizarNombreArea(nombre) === 'servicios';
}
