import { HikConnectTeamsClient } from './hct.client';

describe('HikConnectTeamsClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('configured=false sin host/keys', () => {
    const c = new HikConnectTeamsClient({ host: '', appKey: '', secretKey: '' });
    expect(c.configured).toBe(false);
  });

  it('token/get + cameras usan areaDomain y header Token', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = jest.fn(async (url: any, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('token/get')) {
        return {
          ok: true,
          json: async () => ({
            errorCode: '0',
            data: {
              accessToken: 'hcc.test',
              areaDomain: 'https://team.example.com',
              expireTime: Math.floor(Date.now() / 1000) + 86400,
            },
          }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          errorCode: '0',
          data: { cameraList: [{ cameraID: 'c1', cameraName: 'Cam 1' }], total: 1 },
        }),
      } as any;
    }) as any;

    const c = new HikConnectTeamsClient({
      host: 'https://ius.hikcentralconnect.com',
      appKey: 'ak',
      secretKey: 'sk',
      scope: 'test',
    });
    const cams = await c.cameras(1, 10);
    expect(cams.cameraList?.[0]?.cameraID).toBe('c1');
    expect(calls[0].url).toContain('/api/hccgw/platform/v1/token/get');
    expect(calls[1].url).toContain('https://team.example.com/api/hccgw/resource/v1/areas/cameras/get');
    expect((calls[1].init?.headers as any).Token).toBe('hcc.test');
  });

  it('remoteDoorControl usa path acs/v1/remote/control', async () => {
    global.fetch = jest.fn(async (url: any) => {
      if (String(url).includes('token/get')) {
        return {
          ok: true,
          json: async () => ({
            errorCode: '0',
            data: { accessToken: 't', areaDomain: 'https://t.example.com', expireTime: 9e12 },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({ errorCode: '0', data: {} }) } as any;
    }) as any;
    const c = new HikConnectTeamsClient({
      host: 'https://ius.hikcentralconnect.com',
      appKey: 'ak',
      secretKey: 'sk',
    });
    await c.remoteDoorControl(['door-1']);
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/acs/v1/remote/control'))).toBe(true);
  });
});
