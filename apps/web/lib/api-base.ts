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
  if (envBase && envBase.trim()) {
    return ensureApiBase(envBase);
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/api`;
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