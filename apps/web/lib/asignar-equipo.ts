export type PasoEquipo = {
  userId: number;
  indicaciones?: string;
  rol: "LEAD" | "TECNICO" | "APOYO";
  /** Tiempo estimado de esta persona, en horas (decimal). */
  horasPlan?: number | null;
};

/**
 * Suma al equipo en orden y se detiene en el primer fallo. Regresa lo que falta, empezando por
 * el que falló, para reintentar solo eso: la actividad ya existe y no se vuelve a crear.
 */
export async function sumarPendientes(
  pasos: PasoEquipo[],
  sumar: (paso: PasoEquipo) => Promise<void>,
): Promise<{ pendientes: PasoEquipo[]; error: unknown }> {
  for (let i = 0; i < pasos.length; i++) {
    try {
      await sumar(pasos[i]);
    } catch (error) {
      return { pendientes: pasos.slice(i), error: error ?? new Error("") };
    }
  }
  return { pendientes: [], error: null };
}
