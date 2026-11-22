/**
 * Consulta de solo lectura (encargo 20-11): quién tiene sesión de actividad abierta
 * sin jornada de asistencia abierta. Adam decide; no cambia datos.
 */
export type SesionAbiertaRef = { userId: number };
export type JornadaAbiertaRef = { userId: number };
export type PersonaTrabajandoSinEntrada = { userId: number; nombre: string };

/** Ids con sesión corriendo y sin AttendanceDay.isOpen. */
export function idsTrabajandoSinJornada(
  sesionesAbiertas: SesionAbiertaRef[],
  jornadasAbiertas: JornadaAbiertaRef[],
): number[] {
  const conJornada = new Set(jornadasAbiertas.map((j) => j.userId));
  return [...new Set(sesionesAbiertas.map((s) => s.userId).filter((id) => !conJornada.has(id)))].sort(
    (a, b) => a - b,
  );
}

/** Une ids con mapa id→nombre; sin nombre → `#${id}`. */
export function listarTrabajandoSinJornada(
  sesionesAbiertas: SesionAbiertaRef[],
  jornadasAbiertas: JornadaAbiertaRef[],
  nombres: Map<number, string | null | undefined>,
): PersonaTrabajandoSinEntrada[] {
  return idsTrabajandoSinJornada(sesionesAbiertas, jornadasAbiertas).map((userId) => {
    const n = nombres.get(userId);
    const nombre = typeof n === 'string' && n.trim() ? n.trim() : `#${userId}`;
    return { userId, nombre };
  });
}
