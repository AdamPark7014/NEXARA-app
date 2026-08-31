import { createConnection } from 'node:net';
import { URL } from 'node:url';
import { buildAuthorization, parseChallenge } from './digest';

/**
 * Sonda RTSP: manda `DESCRIBE` y lee el SDP.
 *
 * Sirve para responder «¿este canal da video?» sin ffmpeg ni go2rtc. Es el
 * paso 2 del flujo que documenta HikGateway (`DESCRIBE` → `SETUP` → `PLAY`);
 * aquí solo se hace el DESCRIBE, que ya obliga al equipo a autenticar y a
 * declarar códecs y pistas. No se abre sesión de streaming, así que no ocupa
 * una de las conexiones concurrentes del firmware.
 *
 * RTSP tiene su propio reto Digest, distinto del de ISAPI: que la contraseña
 * valga en :80 no garantiza que valga en :554 (usuarios con permiso de
 * configuración pero no de reproducción son un caso real).
 *
 * **El nonce va atado a la conexión.** El servidor RTSP de Hikvision emite un
 * nonce nuevo en cada socket, así que el reto y la respuesta firmada tienen que
 * viajar por el MISMO socket. Reconectar para responder da un 401 eterno con
 * una firma perfectamente correcta — y sin pista ninguna de por qué.
 */

export type RtspProbeResult = {
  ok: boolean;
  status: number | null;
  /** Códecs anunciados en el SDP: `['H265', 'PCMU']`. */
  codecs: string[];
  /** Pistas del SDP: `['video', 'audio']`. */
  media: string[];
  /** Resolución si el SDP la declara (no todos los firmwares lo hacen). */
  resolution: string | null;
  error: string | null;
  elapsedMs: number;
};

/**
 * `url` lleva las credenciales embebidas (`rtsp://user:pass@ip:554/...`).
 * Se extraen y se usan para el Digest; nunca viajan en claro en la URI.
 */
export async function probeRtsp(url: string, timeoutMs = 8000): Promise<RtspProbeResult> {
  const started = Date.now();
  const parsed = new URL(url);
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  parsed.username = '';
  parsed.password = '';
  const target = parsed.toString();
  const port = Number(parsed.port || 554);

  const base: RtspProbeResult = {
    ok: false,
    status: null,
    codecs: [],
    media: [],
    resolution: null,
    error: null,
    elapsedMs: 0,
  };

  try {
    const response = await rtspDescribe({
      hostname: parsed.hostname,
      port,
      uri: target,
      timeoutMs,
      username,
      password,
    });

    if (response.status === 401 && !response.wwwAuthenticate) {
      return { ...base, status: 401, error: 'reto Digest ilegible', elapsedMs: since(started) };
    }

    if (response.status !== 200) {
      return {
        ...base,
        status: response.status,
        error: response.status === 401 ? 'credenciales rechazadas en RTSP' : response.reason,
        elapsedMs: since(started),
      };
    }

    const sdp = response.body;
    const media = [...sdp.matchAll(/^m=(\w+)/gm)].map((m) => m[1]);
    const codecs = [...new Set([...sdp.matchAll(/^a=rtpmap:\d+\s+([\w-]+)/gm)].map((m) => m[1]))];
    const resolution = /a=x-dimensions:\s*(\d+)\s*,\s*(\d+)/.exec(sdp);

    return {
      ok: media.includes('video'),
      status: 200,
      codecs,
      media,
      resolution: resolution ? `${resolution[1]}x${resolution[2]}` : null,
      error: media.includes('video') ? null : 'el SDP no declara pista de video',
      elapsedMs: since(started),
    };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : String(e),
      elapsedMs: since(started),
    };
  }
}

const since = (t: number) => Date.now() - t;

type RtspRawResponse = {
  status: number;
  reason: string;
  wwwAuthenticate: string | null;
  body: string;
};

/**
 * Hace el DESCRIBE completo (reto + respuesta firmada) sobre una sola conexión
 * y devuelve la última respuesta del servidor.
 */
function rtspDescribe(opts: {
  hostname: string;
  port: number;
  uri: string;
  timeoutMs: number;
  username: string;
  password: string;
}): Promise<RtspRawResponse> {
  const { hostname, port, uri, timeoutMs, username, password } = opts;

  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: hostname, port });
    let buffer = '';
    let settled = false;
    let authenticated = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    };

    const describe = (cseq: number, authorization?: string) => {
      socket.write(
        [
          `DESCRIBE ${uri} RTSP/1.0`,
          `CSeq: ${cseq}`,
          'Accept: application/sdp',
          'User-Agent: NEXARA-Integra/1.0',
          ...(authorization ? [`Authorization: ${authorization}`] : []),
          '',
          '',
        ].join('\r\n'),
      );
    };

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish(() => reject(new Error(`RTSP sin respuesta (${hostname})`))));
    socket.on('error', (e) => finish(() => reject(e)));
    socket.on('connect', () => describe(1));

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const split = buffer.indexOf('\r\n\r\n');
      if (split === -1) return;

      const head = buffer.slice(0, split);
      const body = buffer.slice(split + 4);
      const length = /Content-Length:\s*(\d+)/i.exec(head);
      // Espera al SDP completo; si no hay cuerpo declarado, ya está.
      if (length && body.length < Number(length[1])) return;

      const statusLine = /^RTSP\/1\.\d\s+(\d+)\s*(.*)$/m.exec(head);
      const status = statusLine ? Number(statusLine[1]) : 0;
      const wwwAuthenticate =
        head
          .split(/\r\n/)
          .filter((l) => /^WWW-Authenticate:/i.test(l))
          .map((l) => l.replace(/^WWW-Authenticate:\s*/i, '').trim())
          // El equipo puede ofrecer Basic y Digest; nos quedamos con Digest.
          .find((v) => /^Digest/i.test(v)) ?? null;

      if (status === 401 && !authenticated && wwwAuthenticate) {
        const challenge = parseChallenge(wwwAuthenticate);
        if (challenge) {
          authenticated = true;
          buffer = '';
          describe(
            2,
            buildAuthorization({
              username,
              password,
              method: 'DESCRIBE',
              uri,
              challenge,
              nc: 1,
            }),
          );
          return;
        }
      }

      finish(() =>
        resolve({
          status,
          reason: statusLine?.[2]?.trim() || 'sin línea de estado',
          wwwAuthenticate,
          body,
        }),
      );
    });

    socket.on('close', () =>
      finish(() => reject(new Error('el equipo cerró la conexión RTSP sin responder'))),
    );
  });
}
