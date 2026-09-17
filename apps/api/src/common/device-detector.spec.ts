import { detectDeviceDetails } from './device-detector';

describe('detectDeviceDetails · descripción para avisos de inicio de sesión', () => {
  it('app Android: nombre visible del teléfono y versión del sistema', () => {
    const d = detectDeviceDetails('NexaraApp/1.0.1 (Android 14; samsung SM-S928B) OkHttp', {
      'x-device-model': 'samsung SM-S928B',
      'x-device-name': encodeURIComponent('Galaxy S24 Ultra'),
      'x-device-os': 'Android 14',
      'x-device-browser': 'NEXARA App',
    });
    expect(d.isApp).toBe(true);
    expect(d.friendly).toBe('Galaxy S24 Ultra (Android 14) · app NEXARA');
  });

  it('decodifica nombres con acentos que la app manda en URL', () => {
    const d = detectDeviceDetails('NexaraApp/1.0.1 (Android 15; Google Pixel 9) OkHttp', {
      'x-device-name': encodeURIComponent('Teléfono de Adán'),
      'x-device-os': 'Android 15',
      'x-device-browser': 'NEXARA App',
    });
    expect(d.friendly).toBe('Teléfono de Adán (Android 15) · app NEXARA');
  });

  it('app iOS: nombre comercial del iPhone', () => {
    const d = detectDeviceDetails('NexaraApp/1.0.1 (iOS 18.1; iPhone 16 Pro Max)', {
      'x-device-model': 'iPhone 16 Pro Max',
      'x-device-os': 'iOS 18.1',
      'x-device-browser': 'NEXARA App',
    });
    expect(d.friendly).toBe('iPhone 16 Pro Max (iOS 18.1) · app NEXARA');
  });

  it('navegador: «Chrome en Windows»', () => {
    const d = detectDeviceDetails(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      {},
    );
    expect(d.isApp).toBe(false);
    expect(d.friendly).toBe('Chrome en Windows');
  });
});
