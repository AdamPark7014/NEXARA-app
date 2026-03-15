const ensureApiBase = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

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

export const getSocketBaseUrl = () => {
  const envSocket = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (envSocket && envSocket.trim()) {
    return normalizeSocketOrigin(envSocket.trim().replace(/\/+$/, ''));
  }

  const fromApi = getApiBase().replace(/\/+api\/?$/, "");
  return normalizeSocketOrigin(fromApi);
};