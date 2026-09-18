import {
  actualizarMiembro,
  actualizarProyecto,
  cambiarEstadoProyecto,
  type ActualizarProyecto,
  type EstadoProyecto,
  type ProyectoDetalle,
} from "@/lib/proyectos-api";

/**
 * Guarda la cabecera y, si cambió el responsable, deja al anterior como coordinador.
 *
 * La API mete al nuevo responsable al equipo con ese papel pero no toca al anterior, que se
 * quedaría también como «Responsable» en la lista del equipo. Aquí se corrige en la misma acción.
 */
export async function guardarCabecera(
  token: string,
  proyecto: ProyectoDetalle,
  cambios: ActualizarProyecto,
): Promise<ProyectoDetalle> {
  let detalle = await actualizarProyecto(token, proyecto.id, cambios);
  const anterior = proyecto.responsableId ?? null;
  const nuevo = cambios.responsableId;
  if (nuevo !== undefined && anterior && nuevo !== anterior) {
    const sigueComoResponsable = detalle.members.some((m) => m.userId === anterior && m.role === "RESPONSABLE");
    if (sigueComoResponsable) {
      detalle = await actualizarMiembro(token, proyecto.id, anterior, { role: "COORDINADOR" });
    }
  }
  return detalle;
}

/**
 * Cambia el estado. Al arrancar por primera vez se anota el inicio real, que la API no pone
 * sola: sin él, el cronograma no puede comparar plan contra realidad.
 */
export async function cambiarEstado(
  token: string,
  proyecto: ProyectoDetalle,
  hacia: EstadoProyecto,
  extra: { cancelReason?: string; actualEndDate?: string },
  hoy: string,
): Promise<ProyectoDetalle> {
  const detalle = await cambiarEstadoProyecto(token, proyecto.id, { status: hacia, ...extra });
  if (hacia === "ACTIVE" && !detalle.actualStartDate) {
    // Si esto falla, el cambio de estado ya quedó: no se pierde por la fecha.
    return actualizarProyecto(token, proyecto.id, { actualStartDate: hoy }).catch(() => detalle);
  }
  return detalle;
}
