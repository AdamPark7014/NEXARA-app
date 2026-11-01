import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Reglas del inicio de sesión con Google / Microsoft (OIDC), sin red ni Nest: lo que decide si se
 * confía en una identidad y a dónde se regresa. `OidcService` hace las llamadas HTTP.
 */

export type ProveedorSso = 'google' | 'microsoft' | 'oidc';

export const PROVEEDORES_SSO: readonly ProveedorSso[] = ['google', 'microsoft', 'oidc'];

export function esProveedorSso(valor: unknown): valor is ProveedorSso {
  return typeof valor === 'string' && (PROVEEDORES_SSO as readonly string[]).includes(valor);
}

/** Lo que viaja en la cookie `nx_sso` entre `oidc/start` y `oidc/callback`. */
export type EstadoSso = {
  proveedor: ProveedorSso;
  state: string;
  nonce: string;
  verifier: string;
  recordar: boolean;
  next: string | null;
  vuelta: string;
  /** Emitido (ms). */
  t: number;
};

export const COOKIE_SSO = 'nx_sso';
/** Diez minutos para elegir cuenta y volver. */
export const VIGENCIA_ESTADO_MS = 10 * 60_000;

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function aleatorio(bytes = 32): string {
  return b64url(randomBytes(bytes));
}

/** PKCE S256: el `verifier` se queda en la cookie; el `challenge` va al proveedor. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = aleatorio(48);
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function firmarEstado(estado: EstadoSso, secreto: string): string {
  const cuerpo = b64url(Buffer.from(JSON.stringify(estado), 'utf8'));
  const firma = b64url(createHmac('sha256', secreto).update(cuerpo).digest());
  return `${cuerpo}.${firma}`;
}

/** `null` si la cookie falta, está alterada, venció o no corresponde al `state` que regresó. */
export function leerEstado(
  valor: string | null | undefined,
  stateRecibido: string | null | undefined,
  secreto: string,
  ahora = Date.now(),
): EstadoSso | null {
  if (!valor || !stateRecibido) return null;
  const [cuerpo, firma] = valor.split('.');
  if (!cuerpo || !firma) return null;
  const esperada = createHmac('sha256', secreto).update(cuerpo).digest();
  const recibida = Buffer.from(firma, 'base64url');
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  let estado: EstadoSso;
  try {
    estado = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!esProveedorSso(estado?.proveedor) || typeof estado.t !== 'number') return null;
  if (ahora - estado.t > VIGENCIA_ESTADO_MS || estado.t - ahora > 60_000) return null;
  const a = Buffer.from(String(estado.state));
  const b = Buffer.from(String(stateRecibido));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return estado;
}

/** Claims del `id_token` sin verificar la firma: llegó por el canal directo con el proveedor (OIDC §3.1.3.7). */
export function claimsDeIdToken(idToken: unknown): Record<string, unknown> | null {
  if (typeof idToken !== 'string') return null;
  const partes = idToken.split('.');
  if (partes.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

export type MotivoSso =
  | 'estado'
  | 'proveedor'
  | 'token'
  | 'correo_no_verificado'
  | 'dominio_no_coincide'
  | 'no_provisionado'
  | 'inactivo';

export type ResultadoIdentidad =
  | { ok: true; email: string; subject: string; tenant: string | null }
  | { ok: false; motivo: MotivoSso };

const MICROSOFT_ISS = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0$/i;

/**
 * ¿El `id_token` es de este cliente, de esta solicitud y sigue vigente?
 * `aud` = nuestro client_id, `nonce` = el de la cookie y emisor del proveedor.
 */
export function idTokenValido(
  proveedor: ProveedorSso,
  claims: Record<string, unknown>,
  esperado: { clientId: string; nonce: string; issuer: string },
  ahora = Date.now(),
): boolean {
  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes(esperado.clientId) : aud === esperado.clientId;
  if (!audOk) return false;
  if (claims.nonce !== esperado.nonce) return false;
  const exp = Number(claims.exp);
  if (!Number.isFinite(exp) || exp * 1000 < ahora - 60_000) return false;
  const iss = String(claims.iss ?? '');
  if (proveedor === 'google') return iss === 'https://accounts.google.com' || iss === 'accounts.google.com';
  if (proveedor === 'microsoft') {
    const m = iss.match(MICROSOFT_ISS);
    return Boolean(m) && String(claims.tid ?? '').toLowerCase() === m![1].toLowerCase();
  }
  return iss.replace(/\/$/, '') === esperado.issuer.replace(/\/$/, '');
}

/**
 * Correo en el que se puede confiar para buscar la cuenta de NEXARA.
 *
 * - Google: `email_verified` tiene que ser `true`.
 * - Microsoft: el correo (o el UPN) de una cuenta de trabajo lo pone el administrador del inquilino,
 *   y cualquier inquilino puede escribir uno ajeno («nOAuth»). Por eso el dominio del correo tiene
 *   que pertenecer al mismo inquilino (`tid`) que firmó: `tenantDelDominio` lo resuelve el servicio.
 */
export function identidadConfiable(
  proveedor: ProveedorSso,
  claims: Record<string, unknown>,
  tenantDelDominio?: string | null,
): ResultadoIdentidad {
  const subject = String(claims.oid ?? claims.sub ?? '').trim();
  if (!subject) return { ok: false, motivo: 'token' };

  if (proveedor === 'google') {
    const email = String(claims.email ?? '').trim().toLowerCase();
    if (!email || claims.email_verified !== true) return { ok: false, motivo: 'correo_no_verificado' };
    return { ok: true, email, subject: String(claims.sub), tenant: typeof claims.hd === 'string' ? claims.hd : null };
  }

  if (proveedor === 'microsoft') {
    const email = correoMicrosoft(claims);
    const tid = String(claims.tid ?? '').toLowerCase();
    if (!email || !tid) return { ok: false, motivo: 'correo_no_verificado' };
    if (!tenantDelDominio || tenantDelDominio.toLowerCase() !== tid) {
      return { ok: false, motivo: 'dominio_no_coincide' };
    }
    return { ok: true, email, subject, tenant: tid };
  }

  // OIDC genérico (configuración anterior): solo con correo verificado si el IdP lo informa.
  const email = String(claims.email ?? claims.preferred_username ?? '').trim().toLowerCase();
  if (!email || claims.email_verified === false) return { ok: false, motivo: 'correo_no_verificado' };
  return { ok: true, email, subject: String(claims.sub ?? subject), tenant: null };
}

/** `email`, y si falta, `preferred_username` / `upn` cuando tienen forma de correo. */
export function correoMicrosoft(claims: Record<string, unknown>): string | null {
  for (const campo of ['email', 'preferred_username', 'upn']) {
    const v = String(claims[campo] ?? '').trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return v;
  }
  return null;
}

export function dominioDe(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

/** Inquilino de Entra que publica la configuración OIDC de un dominio (su `issuer`). */
export function tenantDeIssuer(issuer: unknown): string | null {
  const m = String(issuer ?? '').match(MICROSOFT_ISS);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Origen al que regresa el navegador: solo NEXARA (`nexara.com.mx` y sus subdominios) o localhost
 * en desarrollo. Cualquier otro valor cae al predeterminado; así nadie usa el SSO como redirector.
 */
export function vueltaSegura(origen: unknown, predeterminado: string, permitirLocal: boolean): string {
  try {
    const url = new URL(String(origen ?? ''));
    const host = url.hostname.toLowerCase();
    const nexara = url.protocol === 'https:' && (host === 'nexara.com.mx' || host.endsWith('.nexara.com.mx'));
    const local = permitirLocal && (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1');
    return nexara || local ? url.origin : predeterminado;
  } catch {
    return predeterminado;
  }
}

/**
 * Ruta interna a la que seguir después de entrar (`/erp/...`); nunca otra web ni el login.
 * Los navegadores borran tabuladores y saltos de línea de una URL: `/\t/evil.com` terminaba en
 * `//evil.com`. Por eso se rechaza cualquier carácter de control o `\` y se resuelve contra un origen.
 */
export function nextSeguro(next: unknown): string | null {
  const v = String(next ?? '').trim();
  if (!v.startsWith('/') || v.length > 500 || /[\u0000-\u001f\u007f\\]/.test(v)) return null;
  let url: URL;
  try {
    url = new URL(v, 'https://core.nexara.com.mx');
  } catch {
    return null;
  }
  if (url.origin !== 'https://core.nexara.com.mx') return null;
  const ruta = `${url.pathname}${url.search}${url.hash}`;
  if (ruta.startsWith('//') || /^\/(auth\/)?login(\/|\?|$)/i.test(ruta)) return null;
  return ruta;
}

/** Valor de una cookie en la cabecera `Cookie` cruda. */
export function leerCookie(cabecera: string | string[] | undefined, nombre: string): string | null {
  const raw = Array.isArray(cabecera) ? cabecera.join(';') : cabecera;
  if (typeof raw !== 'string') return null;
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() !== nombre) continue;
    const valor = parte.slice(i + 1).trim();
    try {
      return decodeURIComponent(valor);
    } catch {
      return valor;
    }
  }
  return null;
}
