import { Agent as HttpAgent, request as httpRequest } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { buildAuthorization, parseChallenge, type DigestChallenge } from './digest';
import { parseXml, type XmlValue } from './xml';

/**
 * Cliente ISAPI directo contra un equipo Hikvision en la LAN (cámara, NVR,
 * terminal de acceso). Tercer provider de Integra — ADR-0019.
 *
 * A diferencia de Artemis y HCT no hay plataforma intermedia: el host es la IP
 * del equipo y la firma es HTTP Digest MD5 contra el reto del propio equipo.
 */

export class IsapiApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
    readonly body?: string,
  ) {
    super(`[HTTP ${status}] ${message} (${path})`);
    this.name = 'IsapiApiError';
  }
}

export class IsapiNotConfiguredError extends Error {
  constructor(scope: string) {
    super(`ISAPI no configurado (${scope})`);
    this.name = 'IsapiNotConfiguredError';
  }
}

/**
 * Credenciales rechazadas por el equipo.
 *
 * Se distingue del resto **a propósito**: los equipos Hikvision bloquean la
 * cuenta tras varios intentos fallidos (por defecto 5, 30 min). Cuando aparece
 * este error el cliente se auto-inhabilita y deja de mandar peticiones, para
 * que un sync automático no deje al cliente fuera de su propia cámara.
 */
export class IsapiAuthRejectedError extends Error {
  constructor(
    readonly host: string,
    readonly username: string,
  ) {
    super(
      `Credenciales rechazadas por ${host} (usuario "${username}"). ` +
        'Cliente inhabilitado para no bloquear la cuenta en el equipo.',
    );
    this.name = 'IsapiAuthRejectedError';
  }
}

export type IsapiClientOpts = {
  /** `http://192.168.9.34` o `https://192.168.9.34`. Sin barra final. */
  host: string;
  username: string;
  password: string;
  /** Los equipos traen certificado autofirmado; por defecto no se verifica. */
  verifyTls?: boolean;
  timeoutMs?: number;
  /** Tope local de peticiones por segundo contra el equipo. */
  reqPerSecond?: number;
  scope?: string;
};

type RawResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

type BinaryRawResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

export class HikvisionIsapiClient {
  readonly configured: boolean;
  readonly host: string;

  private challenge: DigestChallenge | null = null;
  private nc = 0;
  private authRejected = false;
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;

  private readonly username: string;
  private readonly password: string;
  private readonly verifyTls: boolean;
  private readonly timeoutMs: number;
  private readonly minGapMs: number;
  private readonly scope: string;

  /**
   * Agentes propios con **una sola conexión reutilizada** por equipo.
   *
   * La versión anterior iba sin pooling, con este razonamiento: un Hikvision
   * admite pocas conexiones simultáneas, y en LAN el handshake TCP cuesta un
   * milisegundo, así que abrir y cerrar por petición salía gratis.
   *
   * En LAN es cierto. **Por un túnel se invierte y muerde.** Medido contra el
   * sitio real a través de WireGuard: el cierre de cada conexión queda a medias
   * —el `FIN` se retransmite sin que el equipo lo confirme— así que las ranuras
   * del firmware se agotan y a partir de la segunda petición el equipo deja de
   * contestar. Síntoma: `deviceInfo` responde en 350 ms y la siguiente llamada
   * expira, con la misma petición hecha a mano funcionando.
   *
   * `maxSockets: 1` mantiene la promesa original —nunca más de una conexión por
   * equipo— y `close()` las cierra al terminar, que era la otra razón para no
   * usar el `globalAgent`: sus sockets ociosos cuelgan un CLI ya terminado.
   */
  private readonly httpAgent = new HttpAgent({
    keepAlive: true,
    maxSockets: 1,
    keepAliveMsecs: 1000,
    timeout: 10_000,
  });
  private readonly httpsAgent = new HttpsAgent({
    keepAlive: true,
    maxSockets: 1,
    keepAliveMsecs: 1000,
    timeout: 10_000,
  });

  /**
   * Cierra las conexiones vivas. Obligatorio en un CLI: sin esto el socket
   * ocioso mantiene el bucle de eventos y el proceso no termina nunca.
   */
  close(): void {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
  }

  constructor(opts: IsapiClientOpts) {
    this.host = (opts.host || '').replace(/\/$/, '');
    this.username = opts.username || '';
    this.password = opts.password || '';
    this.verifyTls = opts.verifyTls ?? false;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.minGapMs = Math.ceil(1000 / Math.max(1, opts.reqPerSecond ?? 5));
    this.scope = opts.scope || 'integra-isapi';
    this.configured = Boolean(this.host && this.username && this.password);
  }

  /** True cuando el equipo ya rechazó estas credenciales en esta instancia. */
  get rejected(): boolean {
    return this.authRejected;
  }

  /**
   * Sockets ociosos que el cliente mantiene abiertos contra el equipo.
   *
   * Como mucho **1**: es la conexión que se reutiliza. Tras `close()` vuelve a
   * 0. Expuesto para poder afirmarlo en un test — más de uno significaría estar
   * gastando las pocas ranuras del firmware, y no cerrarlos cuelga un CLI.
   */
  get idleSockets(): number {
    const count = (free: Record<string, unknown[]> | undefined) =>
      Object.values(free ?? {}).reduce((n, list) => n + list.length, 0);
    return count(this.httpAgent.freeSockets as never) + count(this.httpsAgent.freeSockets as never);
  }

  private raw(
    method: string,
    path: string,
    body?: string | Buffer,
    authorization?: string,
    contentType = 'application/xml',
  ): Promise<RawResponse> {
    const url = new URL(path, this.host);
    const isHttps = url.protocol === 'https:';
    const send = isHttps ? httpsRequest : httpRequest;
    const payload = body == null ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(body);

    return new Promise((resolve, reject) => {
      const req = send(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers: {
            Accept: 'application/json, application/xml, text/xml, */*',
            ...(payload ? { 'Content-Type': contentType } : {}),
            ...(payload ? { 'Content-Length': payload.length } : {}),
            ...(authorization ? { Authorization: authorization } : {}),
          },
          agent: isHttps ? this.httpsAgent : this.httpAgent,
          ...(isHttps ? { rejectUnauthorized: this.verifyTls } : {}),
          timeout: this.timeoutMs,
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (data += c));
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }),
          );
        },
      );
      req.on('timeout', () => req.destroy(new Error(`Timeout hablando con ${this.host}${path}`)));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  /** GET binario (fotos de rostro, etc.) — no fuerza utf8. */
  private rawBinary(
    method: string,
    path: string,
    authorization?: string,
  ): Promise<BinaryRawResponse> {
    const url = new URL(path, this.host);
    const isHttps = url.protocol === 'https:';
    const send = isHttps ? httpsRequest : httpRequest;

    return new Promise((resolve, reject) => {
      const req = send(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers: {
            Accept: 'image/*, application/octet-stream, */*',
            ...(authorization ? { Authorization: authorization } : {}),
          },
          agent: isHttps ? this.httpsAgent : this.httpAgent,
          ...(isHttps ? { rejectUnauthorized: this.verifyTls } : {}),
          timeout: this.timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer | string) => {
            chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
          });
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      req.on('timeout', () => req.destroy(new Error(`Timeout hablando con ${this.host}${path}`)));
      req.on('error', reject);
      req.end();
    });
  }

  /** Serializa y espacia las llamadas: el firmware se atraganta con ráfagas. */
  private throttle<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const wait = this.lastCall + this.minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCall = Date.now();
      return fn();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** `path` incluye la query: la firma Digest se calcula sobre la URI completa. */
  async request(
    method: string,
    path: string,
    body?: string | Buffer,
    contentType = 'application/xml',
  ): Promise<string> {
    if (!this.configured) throw new IsapiNotConfiguredError(this.scope);
    if (this.authRejected) throw new IsapiAuthRejectedError(this.host, this.username);

    return this.throttle(async () => {
      let res: RawResponse;

      if (this.challenge) {
        this.nc += 1;
        res = await this.raw(
          method,
          path,
          body,
          buildAuthorization({
            username: this.username,
            password: this.password,
            method,
            uri: path,
            challenge: this.challenge,
            nc: this.nc,
          }),
          contentType,
        );
      } else {
        res = await this.raw(method, path, body, undefined, contentType);
      }

      if (res.status === 401) {
        const header = ([] as string[])
          .concat(res.headers['www-authenticate'] ?? [])
          .find((h) => /^Digest/i.test(h));
        const fresh = header ? parseChallenge(header) : null;
        const stale = /stale\s*=\s*"?true"?/i.test(header ?? '');
        const hadChallenge = this.challenge !== null;

        // Sin reto previo, o el equipo dice que el nonce caducó: reintenta UNA vez.
        // Con reto vigente y sin `stale`, el 401 significa contraseña incorrecta.
        if (fresh && (!hadChallenge || stale)) {
          this.challenge = fresh;
          this.nc = 1;
          res = await this.raw(
            method,
            path,
            body,
            buildAuthorization({
              username: this.username,
              password: this.password,
              method,
              uri: path,
              challenge: fresh,
              nc: this.nc,
            }),
            contentType,
          );
        }

        if (res.status === 401) {
          this.authRejected = true;
          this.challenge = null;
          throw new IsapiAuthRejectedError(this.host, this.username);
        }
      }

      if (res.status < 200 || res.status >= 300) {
        throw new IsapiApiError(res.status, path, describeIsapiError(res.body), res.body);
      }
      return res.body;
    });
  }

  /** GET que devuelve el XML/JSON ya parseado a objeto. */
  async get(path: string): Promise<Record<string, XmlValue>> {
    return decode(await this.request('GET', path));
  }

  /**
   * GET de bytes (p. ej. `faceURL` del UserInfo). Misma firma Digest que el resto.
   * `path` puede ser ruta relativa (`/ISAPI/...`) o URL absoluta del mismo host.
   */
  async getBinary(pathOrUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    if (!this.configured) throw new IsapiNotConfiguredError(this.scope);
    if (this.authRejected) throw new IsapiAuthRejectedError(this.host, this.username);

    let path = pathOrUrl;
    try {
      if (/^https?:\/\//i.test(pathOrUrl)) {
        const u = new URL(pathOrUrl);
        path = u.pathname + u.search;
      }
    } catch {
      /* usa path tal cual */
    }
    if (!path.startsWith('/')) path = `/${path}`;

    return this.throttle(async () => {
      let res: BinaryRawResponse;

      if (this.challenge) {
        this.nc += 1;
        res = await this.rawBinary(
          'GET',
          path,
          buildAuthorization({
            username: this.username,
            password: this.password,
            method: 'GET',
            uri: path,
            challenge: this.challenge,
            nc: this.nc,
          }),
        );
      } else {
        res = await this.rawBinary('GET', path);
      }

      if (res.status === 401) {
        const header = ([] as string[])
          .concat(res.headers['www-authenticate'] ?? [])
          .find((h) => /^Digest/i.test(h));
        const fresh = header ? parseChallenge(header) : null;
        const stale = /stale\s*=\s*"?true"?/i.test(header ?? '');
        const hadChallenge = this.challenge !== null;

        if (fresh && (!hadChallenge || stale)) {
          this.challenge = fresh;
          this.nc = 1;
          res = await this.rawBinary(
            'GET',
            path,
            buildAuthorization({
              username: this.username,
              password: this.password,
              method: 'GET',
              uri: path,
              challenge: fresh,
              nc: this.nc,
            }),
          );
        }

        if (res.status === 401) {
          this.authRejected = true;
          this.challenge = null;
          throw new IsapiAuthRejectedError(this.host, this.username);
        }
      }

      if (res.status < 200 || res.status >= 300) {
        throw new IsapiApiError(
          res.status,
          path,
          describeIsapiError(res.body.toString('utf8').slice(0, 500)),
        );
      }

      const ctHeader = res.headers['content-type'];
      const contentType = Array.isArray(ctHeader)
        ? ctHeader[0] || 'application/octet-stream'
        : ctHeader || 'application/octet-stream';
      return { buffer: res.body, contentType };
    });
  }

  async put(path: string, body: string): Promise<Record<string, XmlValue>> {
    return decode(await this.request('PUT', path, body));
  }

  async post(path: string, body: string): Promise<Record<string, XmlValue>> {
    return decode(await this.request('POST', path, body));
  }

  /** POST JSON (`?format=json`) — UserInfo/Search, AcsEvent, etc. */
  async postJson(path: string, payload: unknown): Promise<Record<string, XmlValue>> {
    return decode(
      await this.request('POST', path, JSON.stringify(payload), 'application/json'),
    );
  }

  /** PUT JSON — UserInfo/Modify, UserInfoDetail/Delete, FDSearch/Delete. */
  async putJson(path: string, payload: unknown): Promise<Record<string, XmlValue>> {
    return decode(
      await this.request('PUT', path, JSON.stringify(payload), 'application/json'),
    );
  }

  /**
   * POST multipart (FaceDataRecord, pictureUpload).
   * Digest firma la URI completa; el cuerpo binario no entra en el hash.
   */
  async postMultipart(
    path: string,
    parts: Array<{ name: string; contentType: string; body: string | Buffer; filename?: string }>,
  ): Promise<Record<string, XmlValue>> {
    const boundary = `----NexaraIsapi${Date.now().toString(36)}`;
    const chunks: Buffer[] = [];
    for (const part of parts) {
      const disposition = part.filename
        ? `form-data; name="${part.name}"; filename="${part.filename}"`
        : `form-data; name="${part.name}"`;
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: ${disposition}\r\nContent-Type: ${part.contentType}\r\n\r\n`,
        ),
      );
      chunks.push(Buffer.isBuffer(part.body) ? part.body : Buffer.from(part.body));
      chunks.push(Buffer.from('\r\n'));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return decode(
      await this.request(
        'POST',
        path,
        Buffer.concat(chunks),
        `multipart/form-data; boundary=${boundary}`,
      ),
    );
  }

  /**
   * URL RTSP del canal, con las credenciales embebidas.
   *
   * `channelId` es el que el propio equipo reporta en
   * `/ISAPI/Streaming/channels` (101 = canal 1 main, 102 = canal 1 sub…).
   * No se calcula: se lee.
   */
  rtspUrl(channelId: string | number, opts?: { port?: number }): string {
    const hostname = new URL(this.host).hostname;
    const port = opts?.port ?? 554;
    const cred = `${encodeURIComponent(this.username)}:${encodeURIComponent(this.password)}`;
    return `rtsp://${cred}@${hostname}:${port}/Streaming/Channels/${channelId}`;
  }

  /** Igual que `rtspUrl` pero sin contraseña — para logs y respuestas de API. */
  rtspUrlRedacted(channelId: string | number, opts?: { port?: number }): string {
    const hostname = new URL(this.host).hostname;
    const port = opts?.port ?? 554;
    return `rtsp://${this.username}:***@${hostname}:${port}/Streaming/Channels/${channelId}`;
  }
}

function decode(text: string): Record<string, XmlValue> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  // Algunos firmwares rotulan JSON y mandan XML. Se decide por el contenido.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed) as Record<string, XmlValue>;
    } catch {
      /* cae a XML */
    }
  }
  return parseXml(trimmed);
}

/** ISAPI devuelve el motivo en `<ResponseStatus><statusString>`. */
function describeIsapiError(body: string): string {
  const status = /<statusString>([^<]*)<\/statusString>/i.exec(body)?.[1];
  const sub = /<subStatusCode>([^<]*)<\/subStatusCode>/i.exec(body)?.[1];
  if (status && sub) return `${status} (${sub})`;
  return status || sub || 'respuesta no OK del equipo';
}
