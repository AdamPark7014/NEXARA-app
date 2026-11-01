import {
  claimsDeIdToken,
  firmarEstado,
  identidadConfiable,
  idTokenValido,
  leerCookie,
  leerEstado,
  nextSeguro,
  pkce,
  tenantDeIssuer,
  vueltaSegura,
  type EstadoSso,
} from './sso-reglas.js';
import { createHash } from 'node:crypto';

const SECRETO = 'secreto-de-prueba';
const TENANT_NEXARA = '8a0ab518-8671-4fee-948c-64cd5df828a7';
const TENANT_AJENO = '11111111-2222-3333-4444-555555555555';

const estado = (extra: Partial<EstadoSso> = {}): EstadoSso => ({
  proveedor: 'microsoft',
  state: 'st-123',
  nonce: 'n-456',
  verifier: 'v',
  recordar: true,
  next: '/erp/cotizaciones/4',
  vuelta: 'https://core.nexara.com.mx',
  t: Date.now(),
  ...extra,
});

describe('sso-reglas · estado firmado (cookie nx_sso)', () => {
  it('se lee de vuelta si el state coincide', () => {
    const cookie = firmarEstado(estado(), SECRETO);
    expect(leerEstado(cookie, 'st-123', SECRETO)?.next).toBe('/erp/cotizaciones/4');
  });

  it('rechaza otro state, otra firma, cookie alterada o vencida', () => {
    const cookie = firmarEstado(estado(), SECRETO);
    expect(leerEstado(cookie, 'otro', SECRETO)).toBeNull();
    expect(leerEstado(cookie, 'st-123', 'otro-secreto')).toBeNull();
    const [cuerpo, firma] = cookie.split('.');
    const alterado = Buffer.from(JSON.stringify({ ...estado(), recordar: false })).toString('base64url');
    expect(leerEstado(`${alterado}.${firma}`, 'st-123', SECRETO)).toBeNull();
    expect(leerEstado(`${cuerpo}.`, 'st-123', SECRETO)).toBeNull();
    const viejo = firmarEstado(estado({ t: Date.now() - 11 * 60_000 }), SECRETO);
    expect(leerEstado(viejo, 'st-123', SECRETO)).toBeNull();
    expect(leerEstado(null, 'st-123', SECRETO)).toBeNull();
  });
});

describe('sso-reglas · PKCE', () => {
  it('el challenge es el SHA-256 del verifier en base64url', () => {
    const { verifier, challenge } = pkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});

describe('sso-reglas · id_token', () => {
  const ahora = Date.now();
  const base = { aud: 'cliente', nonce: 'n-456', exp: Math.floor(ahora / 1000) + 600 };

  it('Google: emisor de Google, aud y nonce nuestros', () => {
    const esperado = { clientId: 'cliente', nonce: 'n-456', issuer: 'https://accounts.google.com' };
    expect(idTokenValido('google', { ...base, iss: 'https://accounts.google.com' }, esperado, ahora)).toBe(true);
    expect(idTokenValido('google', { ...base, iss: 'https://evil.example' }, esperado, ahora)).toBe(false);
    expect(idTokenValido('google', { ...base, iss: 'accounts.google.com', nonce: 'otro' }, esperado, ahora)).toBe(false);
    expect(idTokenValido('google', { ...base, iss: 'accounts.google.com', aud: 'otro' }, esperado, ahora)).toBe(false);
    expect(
      idTokenValido('google', { ...base, iss: 'accounts.google.com', exp: Math.floor(ahora / 1000) - 3600 }, esperado, ahora),
    ).toBe(false);
  });

  it('Microsoft: el emisor tiene que ser el inquilino del propio token', () => {
    const esperado = { clientId: 'cliente', nonce: 'n-456', issuer: 'https://login.microsoftonline.com/organizations/v2.0' };
    const iss = `https://login.microsoftonline.com/${TENANT_NEXARA}/v2.0`;
    expect(idTokenValido('microsoft', { ...base, iss, tid: TENANT_NEXARA }, esperado, ahora)).toBe(true);
    expect(idTokenValido('microsoft', { ...base, iss, tid: TENANT_AJENO }, esperado, ahora)).toBe(false);
  });

  it('decodifica los claims de un JWT y descarta basura', () => {
    const jwt = ['x', Buffer.from(JSON.stringify({ sub: 'a' })).toString('base64url'), 'y'].join('.');
    expect(claimsDeIdToken(jwt)).toEqual({ sub: 'a' });
    expect(claimsDeIdToken('no-es-jwt')).toBeNull();
    expect(claimsDeIdToken(undefined)).toBeNull();
  });
});

describe('sso-reglas · correo confiable', () => {
  it('Google exige email_verified', () => {
    expect(identidadConfiable('google', { sub: '1', email: 'Ana@Nexara.com.mx', email_verified: true })).toEqual({
      ok: true,
      email: 'ana@nexara.com.mx',
      subject: '1',
      tenant: null,
    });
    expect(identidadConfiable('google', { sub: '1', email: 'ana@nexara.com.mx', email_verified: false })).toEqual({
      ok: false,
      motivo: 'correo_no_verificado',
    });
  });

  it('Microsoft: el dominio del correo debe ser del mismo inquilino que firmó (nOAuth)', () => {
    const claims = { oid: 'o-1', tid: TENANT_NEXARA, preferred_username: 'gerencia@nexara.com.mx' };
    expect(identidadConfiable('microsoft', claims, TENANT_NEXARA)).toMatchObject({ ok: true, email: 'gerencia@nexara.com.mx' });
    // Un inquilino ajeno que pone el correo de NEXARA en su usuario no entra.
    expect(identidadConfiable('microsoft', { ...claims, tid: TENANT_AJENO }, TENANT_NEXARA)).toEqual({
      ok: false,
      motivo: 'dominio_no_coincide',
    });
    // Dominio que no está en Microsoft 365.
    expect(identidadConfiable('microsoft', claims, null)).toEqual({ ok: false, motivo: 'dominio_no_coincide' });
  });

  it('Microsoft prefiere email y cae a preferred_username / upn con forma de correo', () => {
    expect(
      identidadConfiable('microsoft', { oid: 'o', tid: TENANT_NEXARA, upn: 'Luis@nexara.com.mx', preferred_username: 'luis' }, TENANT_NEXARA),
    ).toMatchObject({ ok: true, email: 'luis@nexara.com.mx' });
    expect(identidadConfiable('microsoft', { oid: 'o', tid: TENANT_NEXARA, preferred_username: 'luis' }, TENANT_NEXARA)).toEqual({
      ok: false,
      motivo: 'correo_no_verificado',
    });
  });

  it('el inquilino sale del issuer de la configuración del dominio', () => {
    expect(tenantDeIssuer(`https://login.microsoftonline.com/${TENANT_NEXARA}/v2.0`)).toBe(TENANT_NEXARA);
    expect(tenantDeIssuer('https://accounts.google.com')).toBeNull();
  });
});

describe('sso-reglas · a dónde se regresa', () => {
  const pred = 'https://core.nexara.com.mx';

  it('solo origenes de NEXARA (o localhost en desarrollo)', () => {
    expect(vueltaSegura('https://ventas.nexara.com.mx/x?y=1', pred, false)).toBe('https://ventas.nexara.com.mx');
    expect(vueltaSegura('https://nexara.com.mx', pred, false)).toBe('https://nexara.com.mx');
    expect(vueltaSegura('https://nexara.com.mx.evil.com', pred, false)).toBe(pred);
    expect(vueltaSegura('http://core.nexara.com.mx', pred, false)).toBe(pred);
    expect(vueltaSegura('http://localhost:3000', pred, false)).toBe(pred);
    expect(vueltaSegura('http://localhost:3000', pred, true)).toBe('http://localhost:3000');
    expect(vueltaSegura('basura', pred, true)).toBe(pred);
  });

  it('next solo rutas internas y nunca el login', () => {
    expect(nextSeguro('/erp/cotizaciones/4')).toBe('/erp/cotizaciones/4');
    expect(nextSeguro('//evil.com')).toBeNull();
    expect(nextSeguro('/\\evil.com')).toBeNull();
    expect(nextSeguro('https://evil.com')).toBeNull();
    expect(nextSeguro('/login?next=/x')).toBeNull();
    expect(nextSeguro(undefined)).toBeNull();
  });

  it('lee una cookie de la cabecera', () => {
    expect(leerCookie('a=1; nx_sso=abc.def; b=2', 'nx_sso')).toBe('abc.def');
    expect(leerCookie(undefined, 'nx_sso')).toBeNull();
  });
});
