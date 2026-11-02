/**
 * Fechas sin hora que manda la API.
 *
 * Las columnas `@db.Date` (emisión, vencimiento, periodos, pólizas, pagos, movimientos del banco)
 * viajan como medianoche UTC. Con `new Date(iso)`, en hora de México `2026-09-18T00:00:00.000Z` es el
 * 17 a las 18:00: la pantalla mostraba un día antes y una factura que vence hoy contaba como vencida.
 *
 * Es la misma regla de `formatoFecha` en `cotizaciones-api.ts`. Un instante con hora (`createdAt`,
 * `closedAt`) se queda como está.
 */
const SIN_HORA = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/;

/** El día que dice la API a medianoche local. Sin valor, o si no es una fecha, `null`. */
export function aFechaLocal(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const partes = SIN_HORA.exec(valor);
  const fecha = partes ? new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])) : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** La misma fecha en texto, en español de México. Sin fecha válida, `vacio`. */
export function formatoFechaLocal(
  valor: string | null | undefined,
  opciones?: Intl.DateTimeFormatOptions,
  vacio = "—",
): string {
  const fecha = aFechaLocal(valor);
  return fecha ? fecha.toLocaleDateString("es-MX", opciones) : vacio;
}
