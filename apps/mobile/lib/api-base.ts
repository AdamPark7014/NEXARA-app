const ensureApiBase = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

const MOBILE_IP_API_HOST = '138.197.42.104';
const MOBILE_APP_PORT = '3002';
const MOBILE_API_PORT = '3001';

const normalizeSocketOrigin = (baseUrl: string) => {
  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === 'nexara.com.mx' || host === 'www.nexara.com.mx' || host === 'app.nexara.com.mx') {
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
    const currentPort = window.location.port;
    const isLocalOrigin =
      originHost === "localhost" ||
      originHost === "127.0.0.1" ||
      originHost.endsWith(".localhost");
    const allowCrossOriginApi = process.env.NEXT_PUBLIC_ALLOW_CROSS_ORIGIN_API === 'true';
    const sameOriginApi = `${currentOrigin}/api`;

    if (isLocalOrigin && !allowCrossOriginApi) {
      return sameOriginApi;
    }

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

    if (originHost === 'app.nexara.com.mx') {
      return sameOriginApi;
    }

    if (originHost === MOBILE_IP_API_HOST && currentPort === MOBILE_APP_PORT) {
      return sameOriginApi;
    }

    return sameOriginApi;
  }

  if (envBase && envBase.trim()) {
    return ensureApiBase(envBase);
  }

  return `http://${MOBILE_IP_API_HOST}:${MOBILE_APP_PORT}/api`;
};

export const getApiBaseCandidates = () => {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = ensureApiBase(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  const envBase = process.env.NEXT_PUBLIC_API_URL;
  const allowCrossOriginApi = process.env.NEXT_PUBLIC_ALLOW_CROSS_ORIGIN_API === 'true';

  if (typeof window !== "undefined" && window.location?.origin) {
    const { origin, protocol, hostname, port } = window.location;
    const lowerHost = hostname.toLowerCase();

    addCandidate(`${origin}/api`);

    if (allowCrossOriginApi && envBase && envBase.trim()) {
      addCandidate(envBase);
    }

    if (port === MOBILE_APP_PORT) {
      addCandidate(`${protocol}//${hostname}:3001`);
    }

    if (
      lowerHost === "app.nexara.com.mx" ||
      lowerHost === "nexara.com.mx" ||
      lowerHost === "www.nexara.com.mx"
    ) {
      addCandidate(`${protocol}//api.nexara.com.mx`);
    }

    addCandidate(getApiBase());
    return candidates;
  }

  addCandidate(getApiBase());

  if (envBase && envBase.trim()) {
    addCandidate(envBase);
  }

  return candidates;
};

export const buildApiUrl = (path: string) => {
  const base = getApiBase().replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
};

export const getApiAssetOrigin = () => {
  const envBase = process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== "undefined" && window.location?.origin) {
    const protocol = window.location.protocol;
    const host = window.location.hostname.toLowerCase();
    const port = window.location.port;

    if (host === MOBILE_IP_API_HOST && port === MOBILE_APP_PORT) {
      return `${protocol}//${host}:${MOBILE_API_PORT}`;
    }

    if (host === 'nexara.com.mx' || host === 'www.nexara.com.mx' || host === 'app.nexara.com.mx' || host.endsWith('.nexara.com.mx')) {
      return `${protocol}//api.nexara.com.mx`;
    }
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