/**
 * Utilidades para cookies compartidas entre subdomios.
 * Las cookies con Domain=.nexara.com.mx funcionan en:
 * - core.nexara.com.mx
 * - studio.nexara.com.mx
 * - ops.nexara.com.mx
 * - sales.nexara.com.mx
 * - lab.nexara.com.mx
 */

interface CookieOptions {
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Setea una cookie que funciona en TODOS los subdomios de nexara.com.mx
 */
export function setSharedCookie(
  name: string,
  value: string,
  options?: CookieOptions,
): void {
  // Guard: SSR check + document availability
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  try {
    const isHttps = window.location.protocol === 'https:';
    const isProduction = window.location.hostname.includes('nexara.com.mx');
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // En localhost, no usar domain (si no, no funciona)
    const domain = isProduction ? '.nexara.com.mx' : undefined;

    const cookieParts = [
      `${name}=${encodeURIComponent(value)}`,
      `Path=${options?.path || '/'}`,
      `Max-Age=${options?.maxAge || 86400}`, // 24 horas default
    ];

    if (domain) {
      cookieParts.push(`Domain=${domain}`);
    }

    if (isHttps) {
      cookieParts.push('Secure');
    }

    cookieParts.push(`SameSite=${options?.sameSite || 'Lax'}`);

    document.cookie = cookieParts.join('; ');
  } catch (err) {
    console.warn(`[setSharedCookie] Error setting cookie "${name}":`, err);
  }
}

/**
 * Lee una cookie compartida entre subdomios
 */
export function getSharedCookie(name: string): string | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;

  try {
    const nameEQ = `${name}=`;
    const cookies = document.cookie.split(';');

    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      if (trimmed.startsWith(nameEQ)) {
        return decodeURIComponent(trimmed.substring(nameEQ.length));
      }
    }
  } catch (err) {
    console.warn(`[getSharedCookie] Error reading cookie "${name}":`, err);
  }

  return null;
}

/**
 * Borra una cookie compartida
 */
export function deleteSharedCookie(name: string): void {
  setSharedCookie(name, '', { maxAge: 0 });
}

/**
 * Claves de cookies compartidas
 */
export const SHARED_COOKIE_KEYS = {
  ACCESS_TOKEN: 'nexara_token',
  USER: 'nexara_user',
} as const;
