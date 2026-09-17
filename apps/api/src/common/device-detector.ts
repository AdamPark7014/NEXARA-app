type HeaderBag = Record<string, string | string[] | undefined>;

const getHeaderValue = (headers: HeaderBag | undefined, name: string): string => {
  if (!headers) return '';
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
};

const cleanClientHint = (value: string): string => value.replace(/^"+|"+$/g, '').trim();

export type DetectedDevice = {
  kind: string;
  model: string;
  os: string;
  browser: string;
  serial?: string;
  deviceId?: string;
  /** Etiqueta corta para UI: "Chrome · Windows" */
  label: string;
  /** Texto compacto para auditoría / lastLoginDevice */
  summary: string;
  /**
   * Descripción para la persona, al estilo Instagram/Facebook:
   * «iPhone 16 Pro Max (iOS 18.1) · app NEXARA», «Galaxy S24 Ultra (Android 14) · app NEXARA»,
   * «Chrome en Windows».
   */
  friendly: string;
  /** Viene de la app nativa (no de un navegador). */
  isApp: boolean;
};

/** Nombre del teléfono: la app lo manda codificado en URL porque puede traer acentos. */
const decodeHeader = (value: string): string => {
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
};

/** Detecta dispositivo desde UA + headers de identidad del cliente. */
export const detectDeviceDetails = (
  userAgent?: string | null,
  headers?: HeaderBag,
): DetectedDevice => {
  const ua = (userAgent || '').toLowerCase();
  const hintedModel = cleanClientHint(getHeaderValue(headers, 'sec-ch-ua-model'));
  const explicitModel = cleanClientHint(getHeaderValue(headers, 'x-device-model'));
  const explicitName = decodeHeader(cleanClientHint(getHeaderValue(headers, 'x-device-name')));
  const explicitOs = cleanClientHint(getHeaderValue(headers, 'x-device-os'));
  const providedSerial = cleanClientHint(getHeaderValue(headers, 'x-device-serial'));
  const providedDeviceId = cleanClientHint(getHeaderValue(headers, 'x-device-id'));
  const platformHint = cleanClientHint(getHeaderValue(headers, 'sec-ch-ua-platform'));
  const explicitBrowser = cleanClientHint(getHeaderValue(headers, 'x-device-browser'));

  const kind = /mobile|iphone|android/.test(ua)
    ? 'Móvil'
    : /ipad|tablet/.test(ua)
      ? 'Tablet'
      : 'Escritorio';

  const os = (() => {
    if (platformHint && platformHint !== '?0') return platformHint.replace(/^"|"$/g, '');
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'iOS';
    if (ua.includes('mac os') || ua.includes('macintosh')) return 'macOS';
    if (ua.includes('cros')) return 'ChromeOS';
    if (ua.includes('linux')) return 'Linux';
    return '';
  })();

  const browser = (() => {
    if (explicitBrowser) return explicitBrowser;
    if (ua.includes('edg/')) return 'Edge';
    if (ua.includes('opr/') || ua.includes('opera')) return 'Opera';
    if (ua.includes('chrome/') && !ua.includes('edg/') && !ua.includes('opr/')) return 'Chrome';
    if (ua.includes('firefox/') || ua.includes('fxios/')) return 'Firefox';
    if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
    return '';
  })();

  const model = (() => {
    if (explicitModel) return explicitModel;
    if (explicitName) return explicitName;
    if (hintedModel && hintedModel !== '?0' && hintedModel !== 'unknown') return hintedModel;
    if (/iphone/.test(ua)) return 'iPhone';
    if (/ipad/.test(ua)) return 'iPad';
    if (/android/.test(ua)) {
      if (/samsung|sm-/.test(ua)) return 'Samsung';
      if (/pixel/.test(ua)) return 'Pixel';
      if (/redmi|mi\s|xiaomi/.test(ua)) return 'Xiaomi';
      if (/huawei/.test(ua)) return 'Huawei';
      if (/motorola|moto/.test(ua)) return 'Motorola';
      return 'Android';
    }
    if (kind === 'Escritorio') {
      if (os === 'Windows') return 'PC';
      if (os === 'macOS') return 'Mac';
      if (os === 'Linux') return 'PC Linux';
      if (os === 'ChromeOS') return 'Chromebook';
      return 'PC';
    }
    return kind;
  })();

  const parts = [browser, os || (model.includes('·') ? '' : model)].filter(Boolean);
  const label =
    explicitModel && explicitModel.includes('·')
      ? explicitModel
      : parts.length
        ? parts.join(' · ')
        : kind;
  const summaryParts = [kind, os || model, browser].filter(
    (v, i, arr) => Boolean(v) && arr.indexOf(v) === i,
  );
  const summary = (summaryParts.join(' · ') || label).slice(0, 255);

  const isApp = /nexara app/i.test(browser) || /nexaraapp\//.test(ua);
  const friendly = (() => {
    if (isApp) {
      // Android manda el nombre visible (Galaxy S24 Ultra) y el modelo técnico (samsung SM-S928B).
      const equipo = explicitName || explicitModel || model;
      const sistema = explicitOs || os;
      return `${equipo}${sistema && !equipo.includes(sistema) ? ` (${sistema})` : ''} · app NEXARA`;
    }
    if (browser && os) return `${browser} en ${os === 'macOS' ? 'Mac' : os}`;
    return label;
  })().slice(0, 200);

  return {
    kind,
    model,
    os: os || 'Desconocido',
    browser: browser || 'Desconocido',
    serial: providedSerial || undefined,
    deviceId: providedDeviceId || undefined,
    label,
    summary,
    friendly,
    isApp,
  };
};

/** Compat: string para lastLoginDevice / notificaciones. */
export const detectDeviceFromUserAgent = (
  userAgent?: string | null,
  headers?: HeaderBag,
): string => detectDeviceDetails(userAgent, headers).summary;
