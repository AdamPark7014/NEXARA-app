/**
 * Control de acceso para `/uploads`.
 *
 * Todo lo que se sube (CVs, nómina, evidencias, documentos de cliente) es
 * material interno: las lecturas también exigen token. Solo los subdirectorios
 * que alimentan el sitio público quedan abiertos, mediante lista blanca
 * explícita — deny-by-default para cualquier carpeta nueva.
 */

import { SESSION_COOKIE_NAME, sessionTokenFromHeaders } from './session-cookie.js';

/** Subdirectorios servidos al sitio público de marketing. */
export const PUBLIC_UPLOAD_PREFIXES = ['hero', 'page-media', 'news', 'case-studies'];

export { SESSION_COOKIE_NAME };

/**
 * True solo si la ruta cae bajo un prefijo público. Normaliza separadores y
 * porcentaje-codificación para que `..%2f` o `\` no puedan simular un prefijo
 * público y escapar a una carpeta privada.
 */
export function isPublicUploadPath(rawPath: string): boolean {
  let decoded = rawPath.split('?')[0] || '';
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Secuencia de escape inválida: se trata como no público.
    return false;
  }

  const normalized = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter((segment) => segment.length > 0);

  if (segments.length === 0) return false;
  // Cualquier travesía de directorios invalida la ruta.
  if (segments.some((segment) => segment === '..' || segment === '.')) return false;

  return PUBLIC_UPLOAD_PREFIXES.includes(segments[0]);
}

/**
 * Extrae el token de la cabecera `Authorization` o, en su defecto, de la cookie
 * de sesión: el navegador no envía cabeceras en `<img src="/uploads/...">`, así
 * que sin la cookie exigir token rompería toda imagen del ERP.
 */
export function readUploadToken(headers: {
  authorization?: string | string[];
  cookie?: string | string[];
}): string | null {
  return sessionTokenFromHeaders(headers);
}
