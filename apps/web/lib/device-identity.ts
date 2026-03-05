export type DeviceIdentity = {
  name?: string;
  model?: string;
  serial?: string;
  source?: string;
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

const getUserAgentHints = async (): Promise<Partial<DeviceIdentity>> => {
  if (typeof navigator === 'undefined') return {};

  const nav = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
      getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
    };
  };

  const uaData = nav.userAgentData;
  if (!uaData?.getHighEntropyValues) return {};

  try {
    const hints = await uaData.getHighEntropyValues(['model', 'platform']);
    const model = normalize(hints?.model, 120);
    const platform = normalize(hints?.platform || uaData.platform, 80);
    return {
      model,
      name: platform ? `${platform} device` : '',
      source: 'ua-client-hints',
    };
  } catch {
    return {};
  }
};

export const saveDeviceIdentity = (identity: DeviceIdentity): void => {
  if (typeof window === 'undefined') return;

  const payload: DeviceIdentity = {
    name: normalize(identity.name, 120),
    model: normalize(identity.model, 120),
    serial: normalize(identity.serial, 120),
    source: normalize(identity.source || 'manual', 40),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const getDeviceIdentityHeaders = async (): Promise<Record<string, string>> => {
  const stored = getStoredIdentity();
  const hinted = await getUserAgentHints();
  const deviceId = getOrCreateDeviceId();

  const name = normalize(stored.name || hinted.name, 120);
  const model = normalize(stored.model || hinted.model, 120);
  const serial = normalize(stored.serial, 120);

  const headers: Record<string, string> = {};
  if (deviceId) headers['X-Device-Id'] = deviceId;
  if (name) headers['X-Device-Name'] = name;
  if (model) headers['X-Device-Model'] = model;
  if (serial) headers['X-Device-Serial'] = serial;

  return headers;
};
