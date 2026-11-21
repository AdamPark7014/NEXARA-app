/**
 * Día pactado de un préstamo (inicio, devolución, prórroga). Lo que se pacta es un DÍA, no una
 * hora, y hay filas guardadas de tres maneras: la web de antes mandaba el día a medianoche UTC
 * (en México, la tarde del día anterior: la lista mostraba un día menos y lo daba por vencido
 * desde las 6 de la tarde), la prórroga de la web a las 23:59 locales y las apps a mediodía UTC.
 * Aquí se lee siempre el día que la persona eligió. Es la misma regla del servidor
 * (`apps/api/src/tool-requests/plazo-prestamo.ts`) y la de las apps.
 */

const ZONA = "America/Mexico_City";

const enMexico = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Hoy (o el instante dado) como `AAAA-MM-DD` en México. */
export function diaEnMexico(fecha: Date = new Date()): string {
  return enMexico.format(fecha);
}

/** El día (`AAAA-MM-DD`) que la persona eligió, o `null` si no hay fecha. */
export function diaPactado(valor: string | null | undefined): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const fecha = new Date(texto);
  if (Number.isNaN(fecha.getTime())) return null;
  const iso = fecha.toISOString();
  // Medianoche UTC exacta es un día suelto: vale el día escrito, no el de México.
  if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
  return enMexico.format(fecha);
}

/** «24 nov 2026», o «—» si no hay fecha. */
export function textoDiaPactado(valor: string | null | undefined): string {
  const dia = diaPactado(valor);
  if (!dia) return "—";
  return new Date(`${dia}T12:00:00.000Z`).toLocaleDateString("es-MX", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Vencido es que el día pactado ya pasó: durante todo ese día el préstamo sigue en plazo. */
export function diaPactadoVencido(valor: string | null | undefined, ahora: Date = new Date()): boolean {
  const dia = diaPactado(valor);
  return dia !== null && dia < enMexico.format(ahora);
}

/** Días completos que lleva vencido (0 si sigue en plazo). */
export function diasDeAtraso(valor: string | null | undefined, ahora: Date = new Date()): number {
  const dia = diaPactado(valor);
  if (!dia) return 0;
  const hoy = enMexico.format(ahora);
  const diferencia = (Date.parse(`${hoy}T00:00:00.000Z`) - Date.parse(`${dia}T00:00:00.000Z`)) / 86_400_000;
  return Math.max(0, Math.round(diferencia));
}

/** Lo que se manda al servidor: el día elegido a mediodía de México (18:00 UTC, sin horario de verano). */
export function diaParaApi(dia: string): string {
  return `${dia}T18:00:00.000Z`;
}
