/**
 * Sesión aislada por pestaña del navegador.
 * sessionStorage no se comparte entre pestañas; las cookies sí — por eso
 * la auth principal vive en sessionStorage y las cookies compartidas solo
 * se usan como fallback al cambiar de subdominio (sin ?_nxt=).
 */

export const FRESH_LOGIN_PARAM = 'fresh';

export function isBrowserLoginPath(): boolean {
  if (typeof window === 'undefined') return false;
  return /^\/login(\/|$)/.test(window.location.pathname)
    || /^\/auth\/login(\/|$)/.test(window.location.pathname);
}

/** Limpia la sesión de ESTA pestaña y quita ?fresh= de la URL. */
export function consumeFreshLoginIntent(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (!params.has(FRESH_LOGIN_PARAM)) return false;

  params.delete(FRESH_LOGIN_PARAM);
  const nextSearch = params.toString();
  const nextUrl =
    window.location.pathname + (nextSearch ? `?${nextSearch}` : '') + window.location.hash;
  window.history.replaceState(null, '', nextUrl);

  try {
    window.sessionStorage.removeItem('nexara_user');
  } catch {
    /* ignore */
  }
  return true;
}

export function buildFreshLoginUrl(nextPath?: string): string {
  const next = nextPath ? `&next=${encodeURIComponent(nextPath)}` : '';
  return `/login?${FRESH_LOGIN_PARAM}=1${next}`;
}
