export type DeviceIdentity = {
  name?: string;
  model?: string;
  serial?: string;
  source?: string;
  platform?: string;
  browser?: string;
};

const STORAGE_KEY = 'nexara_device_identity';
const DEVICE_ID_KEY = 'nexara_device_id';

const normalize = (value: unknown, max = 120): string => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
};

const getStoredIdentity = (): DeviceIdentity => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DeviceIdentity;
    return {
      name: normalize(parsed?.name, 120),
      model: normalize(parsed?.model, 120),
      serial: normalize(parsed?.serial, 120),
      source: normalize(parsed?.source, 40),
      platform: normalize(parsed?.platform, 80),
      browser: normalize(parsed?.browser, 40),
    };
  } catch {
    return {};
  }
};

const createDeviceId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Ignore and fallback below.
  }

  const random = Math.random().toString(36).slice(2, 10);
  return `dev-${Date.now().toString(36)}-${random}`;
};

const getOrCreateDeviceId = (): string => {
  if (typeof window === 'undefined') return '';
  const stored = normalize(window.localStorage.getItem(DEVICE_ID_KEY), 80);
  if (stored) return stored;

  const nextId = createDeviceId();
  window.localStorage.setItem(DEVICE_ID_KEY, nextId);
  return nextId;
};

/** Fuerza lectura de plataforma / navegador desde el cliente (siempre). */
const detectBrowserEnvironment = (): Required<
  Pick<DeviceIdentity, 'platform' | 'browser' | 'name' | 'model' | 'source'>
> => {
  if (typeof navigator === 'undefined') {
    return { platform: '', browser: '', name: '', model: '', source: 'unknown' };
  }

  const ua = String(navigator.userAgent || '').toLowerCase();
  const platformRaw = String(navigator.platform || '');

  const browser = (() => {
    if (/edg\//.test(ua)) return 'Edge';
    if (/opr\/|opera/.test(ua)) return 'Opera';
    if (/chrome\//.test(ua) && !/edg\//.test(ua) && !/opr\//.test(ua)) return 'Chrome';
    if (/firefox\//.test(ua) || /fxios\//.test(ua)) return 'Firefox';
    if (/safari\//.test(ua) && !/chrome\//.test(ua)) return 'Safari';
    return 'Navegador';
  })();

  const platform = (() => {
    if (/win/.test(ua) || /win/.test(platformRaw.toLowerCase())) return 'Windows';
    if (/android/.test(ua)) return 'Android';
    if (/iphone|ipad|ipod/.test(ua)) return 'iOS';
    if (/mac/.test(ua) || /mac/.test(platformRaw.toLowerCase())) return 'macOS';
    if (/cros/.test(ua)) return 'ChromeOS';
    if (/linux/.test(ua)) return 'Linux';
    return platformRaw || 'Desconocido';
  })();

  const kind = /mobile|iphone|android/.test(ua)
    ? 'Móvil'
    : /ipad|tablet/.test(ua)
      ? 'Tablet'
      : 'Escritorio';

  const model = (() => {
    if (/iphone/.test(ua)) return 'iPhone';
    if (/ipad/.test(ua)) return 'iPad';
    if (/android/.test(ua)) return 'Android';
    if (platform === 'macOS') return 'Mac';
    if (platform === 'Windows') return 'PC';
    if (platform === 'ChromeOS') return 'Chromebook';
    return kind;
  })();

  return {
    platform,
    browser,
    name: `${kind} ${platform}`.trim(),
    model: `${browser} · ${platform}`,
    source: 'navigator',
  };
};

const getUserAgentHints = async (): Promise<Partial<DeviceIdentity>> => {
  if (typeof navigator === 'undefined') return {};

  const nav = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
      brands?: { brand: string; version: string }[];
      mobile?: boolean;
      getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
    };
  };

  const uaData = nav.userAgentData;
  if (!uaData) return {};

  try {
    const baseBrand =
      uaData.brands?.find((b) => !/not.?a.?brand/i.test(b.brand))?.brand || '';
    let model = '';
    let platform = normalize(uaData.platform, 80);

    if (uaData.getHighEntropyValues) {
      const hints = await uaData.getHighEntropyValues([
        'model',
        'platform',
        'platformVersion',
        'fullVersionList',
      ]);
      model = normalize(hints?.model, 120);
      platform = normalize(hints?.platform || platform, 80);
    }

    return {
      model: model || normalize(baseBrand, 80),
      platform,
      browser: normalize(baseBrand, 40),
      name: platform
        ? `${uaData.mobile ? 'Móvil' : 'Escritorio'} ${platform}`
        : '',
      source: 'ua-client-hints',
    };
  } catch {
    return {
      platform: normalize(uaData.platform, 80),
      source: 'ua-client-hints',
    };
  }
};

export const saveDeviceIdentity = (identity: DeviceIdentity): void => {
  if (typeof window === 'undefined') return;

  const payload: DeviceIdentity = {
    name: normalize(identity.name, 120),
    model: normalize(identity.model, 120),
    serial: normalize(identity.serial, 120),
    source: normalize(identity.source || 'manual', 40),
    platform: normalize(identity.platform, 80),
    browser: normalize(identity.browser, 40),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const getDeviceIdentityHeaders = async (): Promise<Record<string, string>> => {
  const stored = getStoredIdentity();
  const env = detectBrowserEnvironment();
  const hinted = await getUserAgentHints();
  const deviceId = getOrCreateDeviceId();

  const platform = normalize(stored.platform || hinted.platform || env.platform, 80);
  const browser = normalize(stored.browser || hinted.browser || env.browser, 40);
  const name = normalize(stored.name || hinted.name || env.name, 120);
  const model = normalize(
    stored.model || hinted.model || (browser && platform ? `${browser} · ${platform}` : env.model),
    120,
  );
  const serial = normalize(stored.serial, 120);

  const headers: Record<string, string> = {};
  if (deviceId) headers['X-Device-Id'] = deviceId;
  if (name) headers['X-Device-Name'] = name;
  if (model) headers['X-Device-Model'] = model;
  if (serial) headers['X-Device-Serial'] = serial;
  if (platform) headers['Sec-CH-UA-Platform'] = `"${platform}"`;
  if (browser) headers['X-Device-Browser'] = browser;

  return headers;
};

/** Etiqueta corta para la nube de bienvenida (lado cliente). */
export const getLocalDeviceLabel = async (): Promise<string> => {
  const headers = await getDeviceIdentityHeaders();
  const model = headers['X-Device-Model'];
  if (model) return model;
  const name = headers['X-Device-Name'];
  return name || 'Este dispositivo';
};
