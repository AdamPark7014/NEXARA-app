import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { HikvisionIsapiClient, IsapiApiError, IsapiAuthRejectedError } from './isapi.client';

/**
 * Pruebas del **transporte**, contra un servidor local que habla Digest igual
 * que un equipo Hikvision. Los demás tests usan un cliente falso y se saltan
 * justo esta capa: el socket, el agente HTTP y el baile del reto 401.
 *
 * Sin esto, un cambio en el agente HTTP rompe el cliente contra hardware real
 * y toda la suite sigue en verde.
 */

const md5 = (s: string) => createHash('md5').update(s).digest('hex');
const USER = 'admin';
const PASS = 'clave-de-prueba';
const REALM = 'IP Camera(GK713)';

type FakeDeviceOpts = {
  /** Nonce nuevo por conexión, como hace el RTSP de Hikvision. */
  nonce?: string;
  /** Fuerza 401 aunque la firma sea correcta (contraseña incorrecta). */
  alwaysReject?: boolean;
  body?: string;
  status?: number;
};

function startFakeDevice(opts: FakeDeviceOpts = {}) {
  const nonce = opts.nonce ?? 'nonce-fijo';
  const requests: { path: string; authorization?: string }[] = [];

  const server: Server = createServer((req, res) => {
    requests.push({ path: req.url ?? '', authorization: req.headers.authorization });
    const auth = req.headers.authorization;

    const challenge = () => {
      res.writeHead(401, {
        'WWW-Authenticate': `Digest qop="auth", realm="${REALM}", nonce="${nonce}", stale="FALSE"`,
        'Content-Type': 'text/xml',
      });
      res.end('<ResponseStatus><statusString>Unauthorized</statusString></ResponseStatus>');
    };

    if (!auth) return challenge();
    if (opts.alwaysReject) return challenge();

    // Recalcula la firma esperada exactamente como el RFC.
    const field = (name: string) => new RegExp(`${name}="?([^",]+)"?`).exec(auth)?.[1] ?? '';
    const ha1 = md5(`${USER}:${REALM}:${PASS}`);
    const ha2 = md5(`GET:${field('uri')}`);
    const expected = md5(
      `${ha1}:${nonce}:${field('nc')}:${field('cnonce')}:${field('qop')}:${ha2}`,
    );
    if (field('response') !== expected) return challenge();

    res.writeHead(opts.status ?? 200, { 'Content-Type': 'application/xml' });
    res.end(
      opts.body ??
        '<DeviceInfo><model>DS-2CD2123G2-LIS2U</model><deviceName>Prueba</deviceName></DeviceInfo>',
    );
  });

  return new Promise<{ port: number; close: () => Promise<void>; requests: typeof requests }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () =>
        resolve({
          port: (server.address() as AddressInfo).port,
          close: () => new Promise<void>((r) => server.close(() => r())),
          requests,
        }),
      );
    },
  );
}

describe('HikvisionIsapiClient · transporte', () => {
  it('resuelve el reto 401 y devuelve el cuerpo parseado', async () => {
    const dev = await startFakeDevice();
    try {
      const client = new HikvisionIsapiClient({
        host: `http://127.0.0.1:${dev.port}`,
        username: USER,
        password: PASS,
      });
      const xml = await client.get('/ISAPI/System/deviceInfo');
      expect((xml.DeviceInfo as Record<string, unknown>).model).toBe('DS-2CD2123G2-LIS2U');
      // Reto + petición firmada.
      expect(dev.requests).toHaveLength(2);
      expect(dev.requests[0].authorization).toBeUndefined();
      expect(dev.requests[1].authorization).toMatch(/^Digest /);
    } finally {
      await dev.close();
    }
  });

  it('reusa el reto: la segunda llamada ya no necesita el 401', async () => {
    const dev = await startFakeDevice();
    try {
      const client = new HikvisionIsapiClient({
        host: `http://127.0.0.1:${dev.port}`,
        username: USER,
        password: PASS,
        reqPerSecond: 50,
      });
      await client.get('/ISAPI/System/deviceInfo');
      await client.get('/ISAPI/Streaming/channels');
      // 2 de la primera (reto + firmada) + 1 de la segunda.
      expect(dev.requests).toHaveLength(3);
      expect(dev.requests[2].authorization).toMatch(/^Digest /);
    } finally {
      await dev.close();
    }
  });

  it('reutiliza una sola conexión y la cierra al terminar', async () => {
    const dev = await startFakeDevice();
    try {
      const client = new HikvisionIsapiClient({
        host: `http://127.0.0.1:${dev.port}`,
        username: USER,
        password: PASS,
        reqPerSecond: 50,
      });
      await client.get('/ISAPI/System/deviceInfo');
      await client.get('/ISAPI/Streaming/channels');
      await new Promise((r) => setImmediate(r));

      // Nunca más de una: el firmware admite pocas conexiones a la vez. Y
      // reutilizarla es lo que evita que, a través de un túnel, se acumulen
      // cierres a medias hasta que el equipo deja de contestar.
      expect(client.idleSockets).toBeLessThanOrEqual(1);

      // Sin esto el socket ocioso cuelga un CLI que ya terminó su trabajo.
      client.close();
      // destroy() cierra los sockets, pero la lista de libres se vacía cuando
      // llega el evento 'close' del socket, no en el mismo tick.
      await new Promise((r) => setTimeout(r, 50));
      expect(client.idleSockets).toBe(0);
    } finally {
      await dev.close();
    }
  });

  it('ante credenciales incorrectas se inhabilita y no vuelve a llamar', async () => {
    const dev = await startFakeDevice({ alwaysReject: true });
    try {
      const client = new HikvisionIsapiClient({
        host: `http://127.0.0.1:${dev.port}`,
        username: USER,
        password: 'incorrecta',
        reqPerSecond: 50,
      });
      await expect(client.get('/ISAPI/System/deviceInfo')).rejects.toBeInstanceOf(
        IsapiAuthRejectedError,
      );
      const afterFirst = dev.requests.length;
      expect(client.rejected).toBe(true);

      // La clave del freno: el segundo intento NO toca la red. Los equipos
      // Hikvision bloquean la cuenta a los pocos fallos.
      await expect(client.get('/ISAPI/System/deviceInfo')).rejects.toBeInstanceOf(
        IsapiAuthRejectedError,
      );
      expect(dev.requests).toHaveLength(afterFirst);
      expect(afterFirst).toBeLessThanOrEqual(2);
    } finally {
      await dev.close();
    }
  });

  it('traduce un error del equipo a IsapiApiError con su statusString', async () => {
    const dev = await startFakeDevice({
      status: 400,
      body: '<ResponseStatus><statusString>Invalid Operation</statusString>' +
        '<subStatusCode>notSupport</subStatusCode></ResponseStatus>',
    });
    try {
      const client = new HikvisionIsapiClient({
        host: `http://127.0.0.1:${dev.port}`,
        username: USER,
        password: PASS,
      });
      await expect(client.get('/ISAPI/AccessControl/capabilities')).rejects.toThrow(
        /Invalid Operation \(notSupport\)/,
      );
      await expect(client.get('/ISAPI/AccessControl/capabilities')).rejects.toBeInstanceOf(
        IsapiApiError,
      );
    } finally {
      await dev.close();
    }
  });

  it('sin credenciales no intenta siquiera conectarse', async () => {
    const client = new HikvisionIsapiClient({ host: 'http://127.0.0.1:1', username: '', password: '' });
    expect(client.configured).toBe(false);
    await expect(client.get('/ISAPI/System/deviceInfo')).rejects.toThrow(/no configurado/i);
  });

  it('construye el RTSP con el usuario escapado y sin filtrar la contraseña', () => {
    const client = new HikvisionIsapiClient({
      host: 'http://192.168.9.34',
      username: 'admin',
      password: 'cla ve@rara',
    });
    expect(client.rtspUrl(101)).toBe(
      'rtsp://admin:cla%20ve%40rara@192.168.9.34:554/Streaming/Channels/101',
    );
    expect(client.rtspUrlRedacted(101)).toBe(
      'rtsp://admin:***@192.168.9.34:554/Streaming/Channels/101',
    );
  });
});
