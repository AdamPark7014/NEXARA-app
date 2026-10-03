/**
 * Formatos de Asistencias (sin segundos en ninguna pantalla).
 *
 * «8:02 a.m.» para una hora y «6 h 41» / «41 min» para una duración. La jornada se
 * lee de un vistazo: los segundos solo hacían que el número temblara.
 */

/** «8:02 a.m.»; «—» si no hay hora o no es válida. */
export function horaCorta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

/** «6 h 41» · «6 h» · «41 min» · «0 min». */
export function duracionCorta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 min";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Lo mismo, en minutos (los totales de la API vienen en minutos). */
export function minutosCortos(minutos: number): string {
  return duracionCorta(Math.max(0, minutos) * 60_000);
}

/** Milisegundos entre dos horas ISO (o hasta `ahora` si no hay fin). */
export function transcurrido(desde?: string | null, hasta?: string | null, ahora: number = Date.now()): number {
  if (!desde) return 0;
  const inicio = new Date(desde).getTime();
  if (!Number.isFinite(inicio)) return 0;
  const fin = hasta ? new Date(hasta).getTime() : ahora;
  if (!Number.isFinite(fin)) return 0;
  return Math.max(0, fin - inicio);
}

/** «viernes 2 de octubre» para el encabezado del día. */
export function diaLargo(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
}
