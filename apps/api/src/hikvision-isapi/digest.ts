import { createHash, randomBytes } from 'node:crypto';

/**
 * Autenticación HTTP Digest (MD5) — RFC 2617.
 *
 * Los equipos Hikvision en LAN no aceptan Basic ni tokens: cada petición se
 * firma contra un reto que el propio equipo emite en el 401. Portado de
 * `HIKVISION-apps/templates/isapi-node/src/isapi/digest.ts`, que ya está
 * probado contra gateway y contra cámara.
 */

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

export interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

/**
 * Parte el encabezado `WWW-Authenticate` del 401.
 *
 * No se puede partir por comas a secas: los valores vienen entrecomillados y
 * el `realm` de Hikvision trae paréntesis — p. ej. `realm="IP Camera(GK713)"`.
 */
export function parseChallenge(header: string): DigestChallenge | null {
  if (!/^Digest/i.test(header)) return null;

  const fields: Record<string, string> = {};
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|([^,\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header)) !== null) {
    fields[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
  }

  if (!fields.nonce || !fields.realm) return null;
  return {
    realm: fields.realm,
    nonce: fields.nonce,
    qop: fields.qop,
    opaque: fields.opaque,
    algorithm: fields.algorithm,
  };
}

/**
 * Arma el encabezado `Authorization`.
 *
 * `uri` debe ser la ruta CON su query string: HA2 se calcula sobre la URI
 * completa, así que omitir `?format=json` devuelve 401 sin explicar por qué.
 */
export function buildAuthorization(opts: {
  username: string;
  password: string;
  method: string;
  uri: string;
  challenge: DigestChallenge;
  nc: number;
}): string {
  const { username, password, method, uri, challenge } = opts;
  const cnonce = randomBytes(16).toString('hex');
  const nc = opts.nc.toString(16).padStart(8, '0');

  let ha1 = md5(`${username}:${challenge.realm}:${password}`);
  if (challenge.algorithm?.toLowerCase() === 'md5-sess') {
    ha1 = md5(`${ha1}:${challenge.nonce}:${cnonce}`);
  }
  const ha2 = md5(`${method}:${uri}`);

  // Hikvision anuncia qop="auth"; el caso sin qop se conserva por firmwares viejos.
  const qop = challenge.qop?.split(',')[0]?.trim();
  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);

  return `Digest ${parts.join(', ')}`;
}
