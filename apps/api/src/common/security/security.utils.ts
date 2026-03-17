type RateLimitEntry = {
  hits: number;
  resetAt: number;
};

type BanEntry = {
  strikes: number;
  bannedUntil: number;
};

type ConnectionEntry = {
  active: number;
};

const DEFAULT_ALLOWED_SUBDOMAINS = ['consola', 'console', 'ventas', 'web', 'contabilidad', 'tickets', 'mobile'];
const DEFAULT_ALLOWED_HOST_PATTERNS: RegExp[] = [
  /^localhost(?::\d+)?$/i,
  /^127\.0\.0\.1(?::\d+)?$/i,
  /^nexara\.com\.mx(?::\d+)?$/i,
  /^www\.nexara\.com\.mx(?::\d+)?$/i,
  /^[a-z0-9-]+\.localhost(?::\d+)?$/i,
  /^[a-z0-9-]+\.nexara\.local(?::\d+)?$/i,
  /^[a-z0-9-]+\.nexara\.com\.mx(?::\d+)?$/i,
];
const DEFAULT_ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const SUSPICIOUS_PATH_PATTERN = /\.\.|%2e%2e|%00|<|>|\\/i;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SUSPICIOUS_INPUT_PATTERN = /<script|javascript:|onerror\s*=|onload\s*=|union\s+select|or\s+1\s*=\s*1|drop\s+table|information_schema|\.\.|%2e%2e|\$\{jndi:|\/etc\/passwd|\\x00|%00/i;
const HONEYPOT_PATH_PATTERN = /\/(wp-admin|wp-login|phpmyadmin|\.git|\.env|\.aws|server-status|\.well-known\/acme-challenge(?!\/))/i;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PARSED_ALLOWED_SUBDOMAINS = (() => {
  const envValue = process.env['ALLOWED_SUBDOMAINS'];
  if (!envValue) {
    return DEFAULT_ALLOWED_SUBDOMAINS;
  }

  const configured = envValue
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_ALLOWED_SUBDOMAINS;
})();

const PARSED_CORS_ORIGINS = (() => {
  const corsEnv = process.env['CORS_ORIGIN'];
  if (!corsEnv) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  return corsEnv
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
})();

const PARSED_ALLOWED_HOST_PATTERNS = (() => {
  const envHosts = process.env['ALLOWED_HOSTS'];
  if (!envHosts) {
    return DEFAULT_ALLOWED_HOST_PATTERNS;
  }

  const exactHosts = envHosts
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .map((host) => host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .map((host) => new RegExp(`^${host}(?::\\d+)?$`, 'i'));

  return [...DEFAULT_ALLOWED_HOST_PATTERNS, ...exactHosts];
})();

export const getAllowedSubdomains = (): string[] => {
  return PARSED_ALLOWED_SUBDOMAINS;
};

export const getConfiguredCorsOrigins = (): string[] => {
  return PARSED_CORS_ORIGINS;
};

export const isOriginAllowed = (origin?: string | null): boolean => {
  // No origin header = same-origin request (server-to-server, curl, etc.)
  if (!origin) {
    return true;
  }

  const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i;
  const localhostSubdomainPattern = /^https?:\/\/[a-z0-9-]+\.localhost(?::\d+)?$/i;

  if (process.env.NODE_ENV !== 'production') {
    if (localhostPattern.test(origin) || localhostSubdomainPattern.test(origin)) {
      return true;
    }
  }

  const corsOrigins = getConfiguredCorsOrigins();
  if (corsOrigins.includes(origin)) {
    return true;
  }

  const allowedSubdomains = getAllowedSubdomains().map(escapeRegex).join('|');
  const localSubdomainPattern = new RegExp(`^http:\\/\\/(${allowedSubdomains})\\.localhost:\\d+$`, 'i');
  const prodSubdomainPattern = new RegExp(`^https:\\/\\/(${allowedSubdomains})\\.nexara\\.com\\.mx$`, 'i');
  const anyLocalSubdomainPattern = /^https?:\/\/[a-z0-9-]+\.localhost:\d+$/i;

  if (localSubdomainPattern.test(origin)) {
    return true;
  }

  if (prodSubdomainPattern.test(origin)) {
    return true;
  }

  if (origin === 'https://nexara.com.mx' || origin === 'https://www.nexara.com.mx') {
    return true;
  }

  // Allow any *.localhost subdomain only outside production
  if (process.env.NODE_ENV !== 'production') {
    return anyLocalSubdomainPattern.test(origin);
  }

  return false;
};

export const resolveCorsOrigin = (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
  if (isOriginAllowed(origin)) {
    return callback(null, true);
  }

  return callback(new Error('Not allowed by CORS'));
};

export const isMethodAllowed = (method: string): boolean => {
  return DEFAULT_ALLOWED_METHODS.includes((method || '').toUpperCase());
};

export const isPathSuspicious = (pathValue?: string | null): boolean => {
  if (!pathValue) {
    return false;
  }

  return SUSPICIOUS_PATH_PATTERN.test(pathValue);
};

export const isHoneypotPath = (pathValue?: string | null): boolean => {
  if (!pathValue) {
    return false;
  }

  return HONEYPOT_PATH_PATTERN.test(pathValue);
};

export const getAllowedHostPatterns = (): RegExp[] => {
  return PARSED_ALLOWED_HOST_PATTERNS;
};

export const isHostAllowed = (host?: string | null): boolean => {
  if (!host) {
    return false;
  }

  return getAllowedHostPatterns().some((pattern) => pattern.test(host));
};

const hasDangerousKeysDeep = (value: unknown, depth = 0): boolean => {
  if (depth > 8 || value == null) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasDangerousKeysDeep(item, depth + 1));
  }

  if (typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (DANGEROUS_KEYS.has(key)) {
      return true;
    }
    if (hasDangerousKeysDeep(record[key], depth + 1)) {
      return true;
    }
  }

  return false;
};

export const hasPrototypePollutionPayload = (...values: unknown[]): boolean => {
  return values.some((value) => hasDangerousKeysDeep(value));
};

const hasSuspiciousInputDeep = (value: unknown, depth = 0): boolean => {
  if (depth > 8 || value == null) {
    return false;
  }

  if (typeof value === 'string') {
    return SUSPICIOUS_INPUT_PATTERN.test(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasSuspiciousInputDeep(item, depth + 1));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const [key, nested] of Object.entries(record)) {
      if (SUSPICIOUS_INPUT_PATTERN.test(key)) {
        return true;
      }
      if (hasSuspiciousInputDeep(nested, depth + 1)) {
        return true;
      }
    }
  }

  return false;
};

export const hasSuspiciousInputPayload = (...values: unknown[]): boolean => {
  return values.some((value) => hasSuspiciousInputDeep(value));
};

export const normalizeClientIp = (ip?: string | null): string => {
  const normalized = (ip || '').trim();
  if (!normalized) {
    return 'unknown';
  }

  if (normalized.startsWith('::ffff:')) {
    return normalized.slice(7);
  }

  return normalized;
};

export const getClientIpFromRequestMeta = (forwardedFor: string | string[] | undefined, fallback?: string | null): string => {
  const candidateIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]
      : fallback;

  return normalizeClientIp(candidateIp || fallback || 'unknown');
};

export const isMutatingMethod = (method?: string | null): boolean => {
  const normalized = (method || '').toUpperCase();
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE';
};

export const isAllowedContentType = (contentType?: string | null): boolean => {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith('application/json') ||
    normalized.startsWith('application/x-www-form-urlencoded') ||
    normalized.startsWith('multipart/form-data')
  );
};

export const isSafeFetchSite = (fetchSite?: string | null): boolean => {
  if (!fetchSite) {
    return true;
  }

  const normalized = fetchSite.toLowerCase().trim();
  return normalized === 'same-origin' || normalized === 'same-site' || normalized === 'none';
};

export const createInMemoryIpBanList = (options: {
  maxStrikes: number;
  banWindowMs: number;
}) => {
  const store = new Map<string, BanEntry>();

  const now = () => Date.now();

  const cleanup = (ip: string) => {
    const current = store.get(ip);
    if (!current) {
      return;
    }

    if (current.bannedUntil <= now() && current.strikes <= 0) {
      store.delete(ip);
    }
  };

  // Periodic sweep to prevent unbounded Map growth
  setInterval(() => {
    const currentTime = Date.now();
    for (const [ip, entry] of store) {
      if (entry.bannedUntil <= currentTime && entry.strikes <= 0) {
        store.delete(ip);
      }
    }
  }, 5 * 60_000).unref();

  const addStrike = (ip: string, weight = 1) => {
    const currentTime = now();
    const current = store.get(ip) || { strikes: 0, bannedUntil: 0 };

    if (current.bannedUntil > currentTime) {
      current.strikes += Math.max(1, weight);
      current.bannedUntil = Math.max(current.bannedUntil, currentTime + options.banWindowMs);
      store.set(ip, current);
      return current;
    }

    current.strikes += Math.max(1, weight);
    if (current.strikes >= options.maxStrikes) {
      current.bannedUntil = currentTime + options.banWindowMs;
      current.strikes = 0;
    }

    store.set(ip, current);
    cleanup(ip);
    return current;
  };

  const isBanned = (ip: string) => {
    const current = store.get(ip);
    if (!current) {
      return false;
    }

    if (current.bannedUntil <= now()) {
      current.bannedUntil = 0;
      store.set(ip, current);
      cleanup(ip);
      return false;
    }

    return true;
  };

  const retryAfterMs = (ip: string) => {
    const current = store.get(ip);
    if (!current || current.bannedUntil <= now()) {
      return 0;
    }

    return Math.max(0, current.bannedUntil - now());
  };

  return {
    addStrike,
    isBanned,
    retryAfterMs,
  };
};

export const createInMemoryRateLimiter = (options: {
  maxHits: number;
  windowMs: number;
  keyGenerator?: (ip: string, path: string) => string;
}) => {
  const store = new Map<string, RateLimitEntry>();

  // Periodic sweep to prevent unbounded Map growth
  setInterval(() => {
    const currentTime = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= currentTime) {
        store.delete(key);
      }
    }
  }, 5 * 60_000).unref();

  return (ip: string, path: string) => {
    const now = Date.now();
    const key = options.keyGenerator ? options.keyGenerator(ip, path) : `${ip}:${path}`;
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      const nextState: RateLimitEntry = {
        hits: 1,
        resetAt: now + options.windowMs,
      };
      store.set(key, nextState);
      return {
        allowed: true,
        remaining: options.maxHits - 1,
        retryAfterMs: options.windowMs,
      };
    }

    current.hits += 1;

    const isAllowed = current.hits <= options.maxHits;
    return {
      allowed: isAllowed,
      remaining: Math.max(0, options.maxHits - current.hits),
      retryAfterMs: Math.max(0, current.resetAt - now),
    };
  };
};

export const createInMemoryWsConnectionGuard = (maxConnectionsPerIp: number) => {
  const activeConnections = new Map<string, ConnectionEntry>();

  const open = (ip: string) => {
    const current = activeConnections.get(ip) || { active: 0 };
    if (current.active >= maxConnectionsPerIp) {
      return {
        allowed: false,
        active: current.active,
      };
    }

    current.active += 1;
    activeConnections.set(ip, current);
    return {
      allowed: true,
      active: current.active,
    };
  };

  const close = (ip: string) => {
    const current = activeConnections.get(ip);
    if (!current) {
      return;
    }

    current.active = Math.max(0, current.active - 1);
    if (current.active === 0) {
      activeConnections.delete(ip);
      return;
    }

    activeConnections.set(ip, current);
  };

  return {
    open,
    close,
  };
};
