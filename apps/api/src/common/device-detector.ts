type HeaderBag = Record<string, string | string[] | undefined>;

const getHeaderValue = (headers: HeaderBag | undefined, name: string): string => {
  if (!headers) return '';
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
};

const cleanClientHint = (value: string): string => value.replace(/^"+|"+$/g, '').trim();

export const detectDeviceFromUserAgent = (userAgent?: string | null, headers?: HeaderBag): string => {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return 'Dispositivo: desconocido · SO: desconocido · Navegador: desconocido';

  const kind = /mobile|iphone|android/.test(ua)
    ? 'Movil'
    : /ipad|tablet/.test(ua)
      ? 'Tablet'
      : 'Escritorio';

  const hintedModel = cleanClientHint(getHeaderValue(headers, 'sec-ch-ua-model'));
  const explicitModel = cleanClientHint(getHeaderValue(headers, 'x-device-model'));
  const explicitName = cleanClientHint(getHeaderValue(headers, 'x-device-name'));
  const providedSerial = cleanClientHint(getHeaderValue(headers, 'x-device-serial'));
  const providedDeviceId = cleanClientHint(getHeaderValue(headers, 'x-device-id'));
  const platformHint = cleanClientHint(getHeaderValue(headers, 'sec-ch-ua-platform'));

  const deviceModel = (() => {
    if (explicitModel) return explicitModel;
    if (explicitName) return explicitName;
    if (hintedModel && hintedModel !== '?0' && hintedModel !== 'unknown') return hintedModel;
    if (/iphone/.test(ua)) return 'iPhone';
    if (/ipad/.test(ua)) return 'iPad';
    if (/ipod/.test(ua)) return 'iPod';
    if (/android/.test(ua)) {
      if (/samsung|sm-/.test(ua)) return 'Samsung Android';
      if (/pixel/.test(ua)) return 'Google Pixel';
      if (/redmi|mi\s|xiaomi/.test(ua)) return 'Xiaomi Android';
      if (/huawei/.test(ua)) return 'Huawei Android';
      if (/motorola|moto/.test(ua)) return 'Motorola Android';
      return 'Android';
    }
    if (kind === 'Escritorio') {
      if (platformHint) return `${platformHint} Desktop`;
      if (/macintosh|mac os/.test(ua)) return 'Mac';
      if (/windows/.test(ua)) return 'PC Windows';
      if (/linux/.test(ua)) return 'PC Linux';
      return 'PC';
    }
    return kind;
  })();

  const os = (() => {
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'iOS';
    if (ua.includes('mac os') || ua.includes('macintosh')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    return 'SO desconocido';
  })();

  const browser = (() => {
    if (ua.includes('edg/')) return 'Edge';
    if (ua.includes('opr/') || ua.includes('opera')) return 'Opera';
    if (ua.includes('chrome/') && !ua.includes('edg/') && !ua.includes('opr/')) return 'Chrome';
    if (ua.includes('firefox/')) return 'Firefox';
    if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
    return 'Navegador desconocido';
  })();

  const serialText = providedSerial ? providedSerial : 'No disponible (web)';
  const deviceIdText = providedDeviceId ? providedDeviceId : 'No asignado';
  return `Dispositivo: ${kind} (${deviceModel}) · SO: ${os} · Navegador: ${browser} · Serie: ${serialText} · ID: ${deviceIdText}`;
};
