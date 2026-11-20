/**
 * Puente entre un proyecto de la plataforma y su carpeta en la NAS.
 *
 * El conector de la NAS escribe, sin mover nada existente:
 *   <carpeta del proyecto>/06 Plataforma/Cotizaciones Plataforma/
 *   <carpeta del proyecto>/06 Plataforma/Evidencia en campo Plataforma/<AAAA-MM-DD> <AN-folio> <título>/
 *
 * Módulo puro (sin Prisma ni fechas implícitas) para poder probar los nombres.
 */

export const FUENTE_NAS = 'NAS';
export const CARPETA_PLATAFORMA = '06 Plataforma';
export const CARPETA_COTIZACIONES = `${CARPETA_PLATAFORMA}/Cotizaciones Plataforma`;
export const CARPETA_EVIDENCIA = `${CARPETA_PLATAFORMA}/Evidencia en campo Plataforma`;

/** Lo que Windows/SMB no acepta en un nombre, más espacios repetidos y puntos al final. */
export function nombreSeguro(texto: string, max = 120): string {
  const limpio = String(texto ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return limpio.slice(0, max).trim() || 'Sin nombre';
}

/** Fecha local de México en AAAA-MM-DD (la NAS se lee en oficina). */
export function fechaCarpeta(fecha: Date | string | null | undefined): string {
  if (!fecha) return 'sin-fecha';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return 'sin-fecha';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** `<AAAA-MM-DD> <AN-folio> <título>` para la carpeta de evidencia de una actividad. */
export function carpetaDeActividad(a: { fecha: Date | string | null | undefined; folio: string | null | undefined; titulo: string }): string {
  const partes = [fechaCarpeta(a.fecha), a.folio ? nombreSeguro(a.folio, 30) : null, nombreSeguro(a.titulo, 80)];
  return nombreSeguro(partes.filter(Boolean).join(' '), 140);
}

/** Nombre del archivo de evidencia: orden, tipo y el nombre original, para que se lea en la NAS. */
export function nombreDeEvidencia(indice: number, tipo: string, url: string): string {
  const original = decodeURIComponent(String(url ?? '').split('?')[0].split('/').pop() || 'archivo');
  const n = String(indice + 1).padStart(2, '0');
  return nombreSeguro(`${n} ${tipo} ${original}`, 150);
}

/** Ruta relativa normalizada para `fuenteRef`: barras normales, sin barras al inicio/fin ni dobles. */
export function normalizarFuenteRef(ruta: string): string {
  return String(ruta ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('/');
}
