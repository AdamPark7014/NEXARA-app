import {
  buildArtemisSignMessage,
  signArtemisRequest,
  HikCentralArtemisClient,
} from './artemis.client';
import { ArtemisApiError, ArtemisNotConfiguredError } from './artemis.errors';
import { rethrowArtemis, toArtemisOffsetIso } from './artemis.utils';

describe('HikCentralArtemisClient · firma', () => {
  const key = 'testKey';
  const secret = 'testSecret';

  it('mensaje con cuerpo incluye Content-Type application/json', () => {
    const msg = buildArtemisSignMessage(
      '/artemis/api/resource/v1/acsDoor/acsDoorList',
      key,
      true,
    );
    expect(msg).toBe(
      'POST\n*/*\napplication/json\nx-ca-key:testKey\n/artemis/api/resource/v1/acsDoor/acsDoorList',
    );
  });

  it('mensaje sin cuerpo no mete línea de Content-Type', () => {
    const msg = buildArtemisSignMessage('/artemis/api/common/v1/version', key, false);
    expect(msg).toBe('POST\n*/*\nx-ca-key:testKey\n/artemis/api/common/v1/version');
  });

  it('firma es base64 estable', () => {
    const a = signArtemisRequest('/artemis/api/common/v1/version', key, secret, true);
    const b = signArtemisRequest('/artemis/api/common/v1/version', key, secret, true);
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('cambia la firma si cambia el path o el cuerpo', () => {
    const withBody = signArtemisRequest('/artemis/api/acs/v1/door/doControl', key, secret, true);
    const noBody = signArtemisRequest('/artemis/api/acs/v1/door/doControl', key, secret, false);
    expect(withBody).not.toBe(noBody);
  });

  it('configured=false lanza ArtemisNotConfiguredError', async () => {
    const c = new HikCentralArtemisClient({ host: '', appKey: '', appSecret: '', scope: 'integra' });
    expect(c.configured).toBe(false);
    await expect(c.version()).rejects.toBeInstanceOf(ArtemisNotConfiguredError);
  });
});

describe('rethrowArtemis', () => {
  it('mapea no configurado a 503', () => {
    try {
      rethrowArtemis(new ArtemisNotConfiguredError('integra'), 'fail');
      fail('expected throw');
    } catch (e: any) {
      expect(e.status).toBe(503);
    }
  });

  it('mapea ArtemisApiError a 502', () => {
    try {
      rethrowArtemis(new ArtemisApiError('0x1', 'bad', '/x'), 'fail');
      fail('expected throw');
    } catch (e: any) {
      expect(e.status).toBe(502);
    }
  });
});

describe('toArtemisOffsetIso', () => {
  it('incluye offset no Z', () => {
    const s = toArtemisOffsetIso(new Date('2026-08-29T12:00:00Z'));
    expect(s).not.toMatch(/Z$/);
    expect(s).toMatch(/[+-]\d{2}:\d{2}$/);
  });
});

describe('HikCentralArtemisClient · surface P2', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('playbackUrls / capture / eventPictures / vehicleAdd firman POST', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: '0', msg: 'success', data: { url: 'rtsp://x' } }),
    }) as any;
    const c = new HikCentralArtemisClient({
      host: 'https://hik.test',
      appKey: 'k',
      appSecret: 's',
      scope: 'integra',
      // avoid rate-limit delay between calls in unit test
    });
    await c.playbackUrls('cam1', '2026-01-01T00:00:00-06:00', '2026-01-01T01:00:00-06:00');
    await c.cameraCapture('cam1');
    await c.eventPictures('/pic/1');
    await c.vehicleAdd({ plateNo: 'ABC123' });
    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(urls.length).toBe(4);
    expect(urls.some((u) => u.includes('playbackURLs'))).toBe(true);
    expect(urls.some((u) => u.includes('capture'))).toBe(true);
    expect(urls.some((u) => u.includes('pictures'))).toBe(true);
    expect(urls.some((u) => u.includes('vehicle'))).toBe(true);
  });
});
