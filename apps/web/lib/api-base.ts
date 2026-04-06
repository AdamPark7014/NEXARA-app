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

export const getApiBase = () => {
  const envBase = process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== "undefined" && window.location?.origin) {
    const originHost = window.location.hostname.toLowerCase();
    const currentOrigin = window.location.origin;
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

          if (isSameOriginApi) return normalizedEnvBase;
          if (allowCrossOriginApi) return normalizedEnvBase;
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
      // Always use HTTPS for production nexara subdomains, regardless of env vars.
      return `https://api.nexara.com.mx`;
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
  const envSocket = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (envSocket && envSocket.trim()) {
    return normalizeSocketOrigin(envSocket.trim().replace(/\/+$/, ''));
  }

  const fromApi = getApiBase().replace(/\/+api\/?$/, "");
  return normalizeSocketOrigin(fromApi);
};