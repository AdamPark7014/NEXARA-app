import {
  buildArtemisSignMessage,
  signArtemisRequest,
} from './hikcentral-artemis.client';

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
    const otherPath = signArtemisRequest('/artemis/api/common/v1/version', key, secret, true);
    expect(withBody).not.toBe(noBody);
    expect(withBody).not.toBe(otherPath);
  });
});
