// Módulo puro para exportación de cotizaciones a NAS
import { workDateKey } from '../common/time/workday.js';

/** Mapeo de estados DB/ES a etiquetas del encargo */
export const ETIQUETA_ESTADO_EXPORT: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
  BORRADOR: 'Borrador',
  ENVIADA: 'Enviada',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  VENCIDA: 'Vencida'
};

/** Obtiene el estado exportable dado un valor (inglés o español) */
export function estadoExportable(valor?: unknown): string {
  const key = String(valor ?? '').trim().toUpperCase();
  return ETIQUETA_ESTADO_EXPORT[key] || 'Borrador';
}

/** Genera el folio exportable */
export function folioExportable(quote: { quoteNumber?: string | null; revision?: number | null }): string {
  let folio = (quote.quoteNumber ?? '').trim();
  
  if (!folio) {
    return 'cotizacion';
  }

  const revision = quote.revision;
  
  if (revision != null && Number.isInteger(revision) && revision > 1) {
    // Si el folio no contiene ya la revisión, añadirla
    if (!folio.toLowerCase().includes(`-r${revision}`)) {
      folio += `-R${revision}`;
    }
  }
  
  return folio || 'cotizacion';
}

/** Obtiene el nombre del cliente */
export function clienteExportable(quote: { salesClient?: { name?: string | null } | null; clientCompany?: string | null; clientName?: string | null }): string {
  if (quote.salesClient?.name) {
    return quote.salesClient.name.trim();
  }
  if (quote.clientCompany) {
    return quote.clientCompany.trim();
  }
  if (quote.clientName) {
    return quote.clientName.trim();
  }
  return '';
}

/** Obtiene el nombre del proyecto */
export function proyectoExportable(quote: { proyectos?: Array<{ title?: string | null }> | null; projectName?: string | null }): string {
  if (quote.proyectos?.[0]?.title) {
    return quote.proyectos[0].title.trim();
  }
  if (quote.projectName) {
    return quote.projectName.trim();
  }
  return '';
}

/** Limpia el nombre para archivo en Windows */
export function limpiarNombreArchivoWindows(texto: string, max = 150): string {
  // Carácter prohibido estándar de archivos Windows más control ASCII básico (sin puntos)
  const forbidden = /[<>:"/\\|?*\x00-\x1f]/g;
  let limpio = texto.replace(forbidden, '').trim();
  
  // Colapsar múltiples espacios en uno y quitar los restantes
  limpio = limpio.replace(/\s+/g, ' ');
  
  if (limpio.length > max) {
    limpio = limpio.substring(0, max);
  }
  
  return limpio || 'cotizacion';
}

export function nombreArchivoExportable(opts: { folio: string; cliente: string; actualizada: Date }): string {
  const fecha = workDateKey(opts.actualizada);
  const folio = limpiarNombreArchivoWindows(opts.folio, 80);
  const cliente = limpiarNombreArchivoWindows(opts.cliente, 80);
  const cuerpo = limpiarNombreArchivoWindows(`${folio} ${cliente} ${fecha}`.trim(), 146);
  return `${cuerpo}.pdf`;
}

/** Parsea el límite de exportación */
export function parseLimiteExportable(raw: unknown, def = 100, max = 500): number {
  const val = Number(raw);
  if (!Number.isFinite(val)) return def;
  
  return Math.min(Math.max(val, 1), max);
}

/** Detecta si la cotización es solo para proyecto */
export function parseSoloConProyecto(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  if (raw === false) return false;
  if (raw === true) return true;
  const val = String(raw).trim().toLowerCase();
  if (val === 'false' || val === '0' || val === 'no') return false;
  return true;
}

/** Obtiene la ruta del PDF */
export function rutaPdfExportable(id: number): string {
  return `cotizaciones/exportables/${id}/pdf`;
}