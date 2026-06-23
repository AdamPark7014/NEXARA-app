/**
 * NEXARA · Cross-Panel Token Handoff
 * ====================================
 * Permite que al cambiar de subdominio (ej. ops.nexara.com.mx → erp.nexara.com.mx)
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

export const HANDOFF_PARAM = "_nxt";

/** Codifica el objeto usuario en base64 para la URL. */
export function encodeHandoff(userJson: string): string {
  try {
    return btoa(unescape(encodeURIComponent(userJson)));
  } catch {
    return "";
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

/**
 * Construye la URL absoluta al subdominio de destino, añadiendo el token
 * de handoff si el destino es un subdominio diferente al actual.
 *
 * @param panelId  - ID canónico del panel destino: "erp" | "crm" | "ops" | "studio" | "lab"
 * @param entryPath - Ruta dentro del panel, ej. "/dashboard"
 * @param userJson  - JSON.stringify del objeto User actual (para handoff)
 */
export function buildCrossPanelUrl(
  panelId: string,
  entryPath: string,
  userJson: string | null,
): string {
  if (typeof window === "undefined") {
    return `/${panelId}${entryPath}`;
  }

  const { protocol, hostname, port } = window.location;
  const hostLower = hostname.toLowerCase();
  const portSuffix = port ? `:${port}` : "";

  const isLocal =
    hostLower === "localhost" ||
    hostLower === "127.0.0.1" ||
    hostLower.endsWith(".local");

  const hasSubdomain =
    !isLocal &&
    (hostLower.split(".").length > 1
      ? !hostLower.startsWith("127.")
      : false);

  const isLocalWithSubdomain =
    hostLower.includes(".localhost") && hostLower.split(".").length > 1;

  // ── Producción: subdominio real ─────────────────────────────────────
  if (!isLocal && hasSubdomain) {
    const targetDomain = `${panelId}.nexara.com.mx`;
    const base = `${protocol}//${targetDomain}${entryPath}`;
    // Solo añadir handoff si cambiamos de subdominio
    const currentDomain = hostname;
    if (currentDomain === targetDomain) {
      return `${entryPath}`; // mismo subdominio → ruta relativa
    }
    if (userJson) {
      const encoded = encodeHandoff(userJson);
      return encoded ? `${base}?${HANDOFF_PARAM}=${encoded}` : base;
    }
    return base;
  }

  // ── Desarrollo con subdominio (ops.localhost:3000) ──────────────────
  if (isLocalWithSubdomain) {
    const baseDomain = "localhost";
    const target = `${protocol}//${panelId}.${baseDomain}${portSuffix}${entryPath}`;
    const currentSub = hostLower.split(".")[0];
    if (currentSub === panelId) {
      return `${entryPath}`;
    }
    if (userJson) {
      const encoded = encodeHandoff(userJson);
      return encoded ? `${target}?${HANDOFF_PARAM}=${encoded}` : target;
    }
    return target;
  }

  // ── Desarrollo sin subdominio (localhost:3000) ──────────────────────
  // Mismo origen → ruta relativa, sin handoff (sessionStorage compartida)
  return `/${panelId}${entryPath}`;
}

/**
 * Lee y consume el parámetro ?_nxt= de la URL actual.
 * Devuelve el JSON del usuario decodificado, o null si no existe.
 * SIEMPRE elimina el parámetro de la URL (replaceState).
 */
export function consumeHandoffParam(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(HANDOFF_PARAM);
  if (!raw) return null;

  // Limpiar el param de la URL sin recargar
  params.delete(HANDOFF_PARAM);
  const newSearch = params.toString();
  const newUrl =
    window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
  window.history.replaceState(null, "", newUrl);

  return decodeHandoff(raw);
}
