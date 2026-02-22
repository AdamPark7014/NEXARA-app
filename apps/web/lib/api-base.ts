const ensureApiBase = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
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

export const getSocketBaseUrl = () => getApiBase().replace(/\/+api\/?$/, "");