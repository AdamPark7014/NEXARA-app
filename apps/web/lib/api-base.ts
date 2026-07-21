const ensureApiBase = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

const WEB_IP_API_HOST = '138.197.42.104';
const WEB_APP_PORT = '3002';
const WEB_API_PORT = '3001';

const normalizeSocketOrigin = (baseUrl: string) => {
  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === 'nexara.com.mx' || host === 'www.nexara.com.mx') {
      return `${parsed.protocol}//api.nexara.com.mx`;
    }
    return parsed.origin;
  } catch {
    return baseUrl;
  }
};

function isNexaraPanelHost(host: string): boolean {
  return host.endsWith(".nexara.com.mx") && host !== "api.nexara.com.mx";
}

export const getApiBase = () => {
  // Server-side: use internal Docker network URL if set (avoids hairpin NAT through Traefik)
  if (typeof window === "undefined") {
    const internalUrl = process.env.API_INTERNAL_URL;
    if (internalUrl && internalUrl.trim()) {
      return ensureApiBase(internalUrl.trim());
    }
  }

  const envBase = process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== "undefined" && window.location?.origin) {
    const originHost = window.location.hostname.toLowerCase();
    const currentOrigin = window.location.origin;
    const pageProtocol = window.location.protocol;

    // Traefik enruta /api al backend en el mismo host del panel (ops, core, etc.).
    if (isNexaraPanelHost(originHost)) {
      return `${currentOrigin}/api`;
    }

    const isLocalOrigin =
      originHost === "localhost" ||
      originHost === "127.0.0.1" ||
      originHost.endsWith(".localhost");
    const allowCrossOriginApi = process.env.NEXT_PUBLIC_ALLOW_CROSS_ORIGIN_API === 'true';

    if (envBase && envBase.trim()) {
      const normalizedEnvBase = ensureApiBase(envBase);
      const lowerEnvBase = normalizedEnvBase.toLowerCase();
      const pointsToLocalhost =
        lowerEnvBase.includes("//localhost") ||
        lowerEnvBase.includes("//127.0.0.1") ||
        lowerEnvBase.includes(".localhost");

      if (pointsToLocalhost) {
        if (isLocalOrigin) return normalizedEnvBase;
      } else {
        try {
          const envUrl = new URL(normalizedEnvBase);
          const isSameOriginApi = envUrl.origin === currentOrigin;
          const isMixedContent = pageProtocol === "https:" && envUrl.protocol === "http:";

          if (isMixedContent) {
            // Evita bloqueo del navegador (HTTPS → HTTP) que parece "sin conexión".
          } else if (isSameOriginApi) {
            return normalizedEnvBase;
          } else if (allowCrossOriginApi) {
            return normalizedEnvBase;
          }
        } catch {
          // Keep fallback to same-origin /api when parsing fails.
        }
      }
    }

    return `${currentOrigin}/api`;
  }

  if (envBase && envBase.trim()) {
    return ensureApiBase(envBase);
  }

  return "http://localhost:3001/api";
};

export const buildApiUrl = (path: string) => {
  const base = getApiBase().replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
};

/**
 * Fetch autenticado NEXARA: añade `X-Company-Id` desde tenant activo (browser).
 * Preferir este helper en nuevas llamadas al API.
 */
export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && !(typeof FormData !== "undefined" && init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem("nexara_active_company_id");
    const id = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(id)) headers.set("X-Company-Id", String(id));
  }
  return fetch(buildApiUrl(path), { ...init, headers });
}

/** Nest may respond 200 with an empty body when the handler returns null. */
export async function parseResponseJson<T>(res: Response): Promise<T | null> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text.trim()) return null;
  return JSON.parse(text) as T;
}

/** Trailing slashes removed; use for legacy `${API_URL}/path` or pass paths through {@link buildApiUrl}. */
export const getApiBaseTrimmed = () => getApiBase().replace(/[\/.]+$/, "");

export const getApiAssetOrigin = () => {
  const envAssetOrigin = process.env.NEXT_PUBLIC_API_ASSET_ORIGIN;
  const envBase = process.env.NEXT_PUBLIC_API_URL;

  // Browser-based detection takes priority for nexara.com.mx subdomains and direct-IP
  // dev mode, so that a stale/HTTP env var never causes mixed-content failures on HTTPS.
  if (typeof window !== "undefined" && window.location?.origin) {
    const protocol = window.location.protocol;
    const host = window.location.hostname.toLowerCase();
    const port = window.location.port;

    if (host === WEB_IP_API_HOST && port === WEB_APP_PORT) {
      return `${protocol}//${host}:${WEB_API_PORT}`;
    }

    if (
      host === "nexara.com.mx" ||
      host === "www.nexara.com.mx" ||
      host === "app.nexara.com.mx" ||
      host.endsWith(".nexara.com.mx")
    ) {
      // Return same page origin so Next.js can proxy /uploads internally.
      // api.nexara.com.mx is not a real subdomain; API and uploads run behind
      // the same reverse-proxy as the page (e.g. consola.nexara.com.mx).
      return window.location.origin;
    }
  }

  if (envAssetOrigin && envAssetOrigin.trim()) {
    let origin = envAssetOrigin.trim().replace(/\/+$/, '');
    // Upgrade HTTP→HTTPS when the page is served over HTTPS to avoid mixed content.
    if (
      typeof window !== "undefined" &&
      window.location?.protocol === 'https:' &&
      origin.startsWith('http://')
    ) {
      origin = origin.replace(/^http:\/\//i, 'https://');
    }
    return origin;
  }

  if (envBase && envBase.trim()) {
    try {
      return new URL(ensureApiBase(envBase)).origin;
    } catch {
      // Fall through to getApiBase-based origin.
    }
  }

  return getApiBase().replace(/\/+api\/?$/, "").replace(/\/+$/, "");
};

export const getSocketBaseUrl = () => {
  if (typeof window !== "undefined" && window.location?.origin) {
    const host = window.location.hostname.toLowerCase();
    if (isNexaraPanelHost(host)) {
      return window.location.origin;
    }
  }

  const envSocket = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (envSocket && envSocket.trim()) {
    return normalizeSocketOrigin(envSocket.trim().replace(/\/+$/, ''));
  }

  const fromApi = getApiBase().replace(/\/+api\/?$/, "");
  return normalizeSocketOrigin(fromApi);
};