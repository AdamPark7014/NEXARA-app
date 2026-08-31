/**
 * NEXARA · Cross-Panel Token Handoff
 * ====================================
 * Permite que al cambiar de subdominio (ej. ops.nexara.com.mx → core.nexara.com.mx)
 * el JWT del usuario viaje en la URL (?_nxt=<encoded>) para que el destino lo
 * guarde en su propio sessionStorage sin pedir login de nuevo.
 *
 * Seguridad:
 *  - Solo se usa en HTTPS en producción.
 *  - El token ya es una credencial pública (Bearer); no agrega riesgo nuevo.
 *  - El parámetro se elimina de la URL inmediatamente después de leerlo
 *    (replaceState) para que no quede en historial ni logs del servidor.
 *  - En desarrollo sin subdominio (localhost sin prefijo) se omite el handoff
 *    (mismo origen → sessionStorage compartida).
 */

import type { PanelId } from '@/lib/access-matrix';
import { PANEL_META } from '@/lib/access-matrix';

export const HANDOFF_PARAM = '_nxt';

/** Panel ID → subdominio canónico (ver middleware CANONICAL_BY_INTERNAL_PREFIX). */
export const PANEL_CANONICAL_SUBDOMAIN: Record<PanelId, string> = {
  erp: 'core',
  crm: 'sales',
  ops: 'ops',
  studio: 'studio',
  lab: 'lab',
  integra: 'integra',
};

const SUBDOMAIN_TO_PANEL_ID: Record<string, PanelId> = {
  core: 'erp',
  erp: 'erp',
  app: 'erp',
  console: 'erp',
  consola: 'erp',
  finance: 'erp',
  sales: 'crm',
  crm: 'crm',
  ventas: 'crm',
  ops: 'ops',
  operacion: 'ops',
  studio: 'studio',
  web: 'studio',
  lab: 'lab',
  integra: 'integra',
};

/** Home interno del panel según PANEL_META.entryPath (lab/integra = /panel). */
export function panelHomeInternalPath(panelId: PanelId): string {
  const entry = PANEL_META[panelId]?.entryPath ?? '/dashboard';
  if (entry === '/' || entry === '') return `/${panelId}`;
  return `/${panelId}${entry.startsWith('/') ? entry : `/${entry}`}`;
}

/** Codifica el objeto usuario en base64 para la URL. */
export function encodeHandoff(userJson: string): string {
  try {
    return btoa(unescape(encodeURIComponent(userJson)));
  } catch {
    return '';
  }
}

/** Decodifica el parámetro de handoff de la URL. Devuelve null si falla. */
export function decodeHandoff(encoded: string): string | null {
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    return null;
  }
}

export function resolvePanelId(input: string): PanelId {
  if (input in PANEL_CANONICAL_SUBDOMAIN) return input as PanelId;
  return SUBDOMAIN_TO_PANEL_ID[input] ?? (input as PanelId);
}

/** Extrae el PanelId de una ruta interna `/erp/...`, `/ops/...`, etc. */
export function panelIdFromInternalPath(path: string): PanelId | null {
  const bare = (path || "").trim().split("?")[0].split("#")[0];
  const m = /^\/(erp|crm|ops|studio|lab|integra)(\/|$)/.exec(bare);
  return m ? (m[1] as PanelId) : null;
}

/**
 * Panel actual según pathname interno o subdominio canónico.
 * En SSR (sin window) devuelve null.
 */
export function detectCurrentPanelId(pathname?: string | null): PanelId | null {
  if (typeof window === "undefined") {
    return pathname ? panelIdFromInternalPath(pathname) : null;
  }
  const fromPath = panelIdFromInternalPath(pathname ?? window.location.pathname);
  if (fromPath) return fromPath;
  const hostLower = window.location.hostname.toLowerCase();
  const sub = hostLower.split(".")[0];
  if (!sub || sub === "localhost" || sub === "127" || sub === "www" || sub === "nexara") {
    return null;
  }
  const mapped = SUBDOMAIN_TO_PANEL_ID[sub];
  return mapped ?? null;
}

/**
 * Resuelve href navegable (mismo host relativo o URL absoluta + handoff).
 * Usar en openPath / search cuando el destino puede ser otro panel.
 */
export function resolveCrossPanelHref(
  internalPath: string,
  userJson: string | null,
  currentPanel?: PanelId | null,
): string {
  const panel = panelIdFromInternalPath(internalPath);
  if (!panel) return internalPath;
  const current = currentPanel ?? detectCurrentPanelId();
  if (current && current === panel) {
    // Mismo panel: buildCrossPanelUrl igual normaliza a publicPath en prod.
    return buildCrossPanelUrl(panel, internalPath, null);
  }
  return buildCrossPanelUrl(panel, internalPath, userJson);
}

/** true si el href apunta fuera del panel actual (necesita hard navigation). */
export function isCrossPanelHref(href: string, currentPanel?: PanelId | null): boolean {
  const target = panelIdFromInternalPath(href);
  if (!target) return false;
  const current = currentPanel ?? detectCurrentPanelId();
  return Boolean(current && current !== target);
}

export function resolveCanonicalSubdomain(panelOrSub: string): string {
  const panelId = resolvePanelId(panelOrSub);
  return PANEL_CANONICAL_SUBDOMAIN[panelId] ?? panelOrSub;
}

/**
 * Asegura ruta interna completa con prefijo de panel: /crm/dashboard.
 * Si la ruta pertenece a otro panel, usa el home del panel destino.
 */
export function normalizeInternalPanelPath(panelId: PanelId, path: string): string {
  const safe = (path || '/').trim() || '/';
  const withSlash = safe.startsWith('/') ? safe : `/${safe}`;
  const home = panelHomeInternalPath(panelId);

  if (withSlash === `/${panelId}` || withSlash === '/') return home;
  if (withSlash.startsWith(`/${panelId}/`)) {
    if (withSlash.endsWith('/executive') && panelId !== 'erp') {
      return home;
    }
    return withSlash;
  }

  const foreign = /^\/(erp|crm|ops|studio|lab|integra)(\/.*)?$/.exec(withSlash);
  if (foreign && foreign[1] !== panelId) {
    return home;
  }

  if (withSlash === '/executive' && panelId !== 'erp') {
    return home;
  }

  if (withSlash === '/dashboard' && (PANEL_META[panelId]?.entryPath === '/' || !PANEL_META[panelId]?.entryPath)) {
    return home;
  }

  return `/${panelId}${withSlash}`;
}

/** Ruta pública en subdominio (sin prefijo /erp|/crm): /dashboard, /executive, / */
export function toSubdomainPublicPath(panelId: PanelId, internalPath: string): string {
  const full = normalizeInternalPanelPath(panelId, internalPath);
  const prefix = `/${panelId}`;
  const suffix = full.slice(prefix.length) || '/';
  if (suffix === '' || suffix === '/') {
    const entry = PANEL_META[panelId]?.entryPath ?? '/dashboard';
    return entry === '/' ? '/' : entry;
  }
  return suffix;
}

function getCurrentCanonicalSub(hostname: string): string | null {
  const hostLower = hostname.toLowerCase();
  const sub = hostLower.split('.')[0];
  if (!sub || sub === 'localhost' || sub === '127' || sub === 'www' || sub === 'nexara') {
    return null;
  }
  return resolveCanonicalSubdomain(sub);
}

/**
 * Construye la URL al subdominio canónico del panel destino.
 *
 * @param panelIdOrSubdomain - ID de panel (erp|crm|…) o subdominio (core|sales|…)
 * @param entryPath          - Ruta interna (/crm/dashboard), relativa (/dashboard) o de otro panel
 * @param userJson           - JSON del usuario para handoff cross-subdominio
 */
export function buildCrossPanelUrl(
  panelIdOrSubdomain: string,
  entryPath: string,
  userJson: string | null,
): string {
  const panelId = resolvePanelId(panelIdOrSubdomain);
  const targetSub = resolveCanonicalSubdomain(panelId);
  const internalPath = normalizeInternalPanelPath(panelId, entryPath);

  if (typeof window === 'undefined') {
 
    return internalPath;
  }

  const { protocol, hostname, port } = window.location;
  const hostLower = hostname.toLowerCase();
  const portSuffix = port ? `:${port}` : '';

  const isLocal =
    hostLower === 'localhost' ||
    hostLower === '127.0.0.1' ||
    hostLower.endsWith('.local');

  const isLocalWithSubdomain =
    hostLower.includes('.localhost') && hostLower.split('.').length > 1;

  const hasProdSubdomain =
    !isLocal &&
    hostLower.endsWith('.nexara.com.mx') &&
    hostLower.split('.').length >= 4;

  const publicPath = toSubdomainPublicPath(panelId, internalPath);
  const currentSub = getCurrentCanonicalSub(hostname);

  if (hasProdSubdomain) {
    const base = `${protocol}//${targetSub}.nexara.com.mx${publicPath}`;
    if (currentSub === targetSub) return publicPath;
    if (userJson) {
      const encoded = encodeHandoff(userJson);
      return encoded ? `${base}?${HANDOFF_PARAM}=${encoded}` : base;
    }
    return base;
  }

  if (isLocalWithSubdomain) {
    const target = `${protocol}//${targetSub}.localhost${portSuffix}${publicPath}`;
    if (currentSub === targetSub) return publicPath;
    if (userJson) {
      const encoded = encodeHandoff(userJson);
      return encoded ? `${target}?${HANDOFF_PARAM}=${encoded}` : target;
    }
    return target;
  }

  return internalPath;
}

/**
 * Lee y consume el parámetro ?_nxt= de la URL actual.
 * Devuelve el JSON del usuario decodificado, o null si no existe.
 * SIEMPRE elimina el parámetro de la URL (replaceState).
 */
export function consumeHandoffParam(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(HANDOFF_PARAM);
  if (!raw) return null;

  params.delete(HANDOFF_PARAM);
  const newSearch = params.toString();
  const newUrl =
    window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
  window.history.replaceState(null, '', newUrl);

  return decodeHandoff(raw);
}
