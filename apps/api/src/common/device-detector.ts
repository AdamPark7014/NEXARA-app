export const detectDeviceFromUserAgent = (userAgent?: string | null): string => {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return 'Dispositivo desconocido';

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

  const kind = /mobile|iphone|android/.test(ua)
    ? 'Móvil'
    : /ipad|tablet/.test(ua)
      ? 'Tablet'
      : 'Escritorio';

  return `${kind} · ${os} · ${browser}`;
};
