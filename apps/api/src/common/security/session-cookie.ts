import type { Response } from 'express';

/**
 * Cookie de sesión compartida entre subdominios.
 *
 * El token vivía en una cookie escrita desde JavaScript (`document.cookie`), de
 * modo que cualquier XSS en cualquier subdominio podía leerlo y suplantar al
 * usuario. Ahora la emite el servidor con `HttpOnly`.
 *
 * La cabecera `Authorization` sigue teniendo precedencia: la app nativa Android
 * no tiene cookie jar y las integraciones por API key tampoco.
 */

export const SESSION_COOKIE_NAME = 'nexara_token';

/** Duración por defecto, alineada con JWT_EXPIRES_IN ("4h"). */
const DEFAULT_MAX_AGE_MS = 4 * 60 * 60 * 1000;

/** Parsea "4h" / "30m" / "7d" a milisegundos. */
export function parseExpiresToMs(raw: string | undefined): number {
  const match = String(raw ?? '').trim().match(/^(\d+)([smhd])$/i);
  if (!match) return DEFAULT_MAX_AGE_MS;
  const n = Number(match[1]);
  switch (match[2].toLowerCase()) {
    case 's': return n * 1000;
    case 'm': return n * 60_000;
    case 'h': return n * 3_600_000;
    default: return n * 86_400_000;
  }
}

/**
 * Dominio de la cookie. Debe seguir siendo `.nexara.com.mx` en producción: sin
 * él la sesión no se comparte entre consola, ventas, tickets… y el usuario
 * tendría que autenticarse en cada subdominio.
 */
function resolveCookieDomain(): string | undefined {
  const configured = process.env['SESSION_COOKIE_DOMAIN'];
  if (configured && configured.trim()) return configured.trim();
  return process.env['NODE_ENV'] === 'production' ? '.nexara.com.mx' : undefined;
}

export function sessionCookieOptions(maxAgeMs: number) {
  const isProduction = process.env['NODE_ENV'] === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    domain: resolveCookieDomain(),
    maxAge: maxAgeMs,
  };
}

/** Emite la cookie de sesión. `expiresInRaw` acepta el formato de JWT_EXPIRES_IN. */
export function setSessionCookie(res: Response, token: string, expiresInRaw?: string): void {
  const maxAgeMs = parseExpiresToMs(expiresInRaw ?? process.env['JWT_EXPIRES_IN']);
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(maxAgeMs));
}

/**
 * Borra la cookie de sesión.
 *
 * Imprescindible: con `HttpOnly` el cliente ya no puede borrarla por su cuenta,
 * así que sin esto los usuarios no podrían cerrar sesión.
 */
export function clearSessionCookie(res: Response): void {
  const { maxAge, ...options } = sessionCookieOptions(0);
  res.clearCookie(SESSION_COOKIE_NAME, options);
}

/** Extrae el valor de la cookie de sesión de una cabecera `Cookie` cruda. */
export function readSessionCookie(cookieHeader: string | string[] | undefined): string | null {
  const raw = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  if (typeof raw !== 'string') return null;

  for (const part of raw.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 0) continue;
    if (part.slice(0, separatorIndex).trim() !== SESSION_COOKIE_NAME) continue;

    const value = part.slice(separatorIndex + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

/**
 * Token de la cabecera `Authorization`, solo si parece un JWT.
 *
 * El filtro importa: durante la migración hay código cliente que puede enviar
 * `Bearer undefined` al quedarse sin token legible. Si aceptáramos ese valor,
 * la extracción fallaría en vez de caer a la cookie.
 */
export function readBearerToken(authHeader: string | string[] | undefined): string | null {
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (typeof raw !== 'string' || !raw.startsWith('Bearer ')) return null;

  const token = raw.slice(7).trim();
  if (!token) return null;
  // Un JWT tiene tres segmentos separados por puntos.
  if (token.split('.').length !== 3) return null;
  return token;
}

/** Token de la petición: cabecera primero, cookie después. */
export function sessionTokenFromHeaders(headers: {
  authorization?: string | string[];
  cookie?: string | string[];
}): string | null {
  return readBearerToken(headers.authorization) ?? readSessionCookie(headers.cookie);
}
