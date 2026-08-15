import {
  SESSION_COOKIE_NAME,
  parseExpiresToMs,
  readBearerToken,
  readSessionCookie,
  sessionTokenFromHeaders,
} from './session-cookie.js';

const JWT = 'aaa.bbb.ccc';

describe('readBearerToken', () => {
  it('acepta un JWT bien formado', () => {
    expect(readBearerToken(`Bearer ${JWT}`)).toBe(JWT);
  });

  it('descarta valores que no son JWT', () => {
    // Clave para la migración: mientras quede código cliente que construya la
    // cabecera con un token ausente, debe descartarse para caer a la cookie en
    // vez de fallar la autenticación.
    expect(readBearerToken('Bearer undefined')).toBeNull();
    expect(readBearerToken('Bearer null')).toBeNull();
    expect(readBearerToken('Bearer session-cookie')).toBeNull();
    expect(readBearerToken('Bearer ')).toBeNull();
    expect(readBearerToken('Bearer    ')).toBeNull();
  });

  it('ignora esquemas distintos de Bearer', () => {
    expect(readBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
    expect(readBearerToken(undefined)).toBeNull();
  });
});

describe('readSessionCookie', () => {
  it('extrae la cookie de sesión entre otras', () => {
    expect(readSessionCookie(`nx_session=1; ${SESSION_COOKIE_NAME}=${JWT}; panel=erp`)).toBe(JWT);
  });

  it('decodifica el valor', () => {
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=a%2Bb%2Fc`)).toBe('a+b/c');
  });

  it('devuelve null cuando no está o está vacía', () => {
    expect(readSessionCookie('nx_session=1')).toBeNull();
    expect(readSessionCookie(`${SESSION_COOKIE_NAME}=`)).toBeNull();
    expect(readSessionCookie(undefined)).toBeNull();
  });

  it('no confunde una cookie cuyo nombre termina igual', () => {
    expect(readSessionCookie(`not_${SESSION_COOKIE_NAME}=malicioso`)).toBeNull();
  });
});

describe('sessionTokenFromHeaders', () => {
  it('da precedencia a la cabecera sobre la cookie', () => {
    // La app nativa Android no tiene cookie jar: su cabecera debe mandar.
    expect(
      sessionTokenFromHeaders({
        authorization: `Bearer ${JWT}`,
        cookie: `${SESSION_COOKIE_NAME}=zzz.yyy.xxx`,
      }),
    ).toBe(JWT);
  });

  it('cae a la cookie cuando la cabecera no es utilizable', () => {
    // Este es el caso que permite migrar sin tocar ~300 puntos de llamada.
    expect(
      sessionTokenFromHeaders({
        authorization: 'Bearer session-cookie',
        cookie: `${SESSION_COOKIE_NAME}=${JWT}`,
      }),
    ).toBe(JWT);

    expect(
      sessionTokenFromHeaders({
        authorization: 'Bearer undefined',
        cookie: `${SESSION_COOKIE_NAME}=${JWT}`,
      }),
    ).toBe(JWT);
  });

  it('usa la cookie cuando no hay cabecera', () => {
    // `<img src="/uploads/...">` nunca lleva cabeceras.
    expect(sessionTokenFromHeaders({ cookie: `${SESSION_COOKIE_NAME}=${JWT}` })).toBe(JWT);
  });

  it('devuelve null sin ninguna credencial', () => {
    expect(sessionTokenFromHeaders({})).toBeNull();
    expect(sessionTokenFromHeaders({ authorization: 'Bearer undefined' })).toBeNull();
  });
});

describe('parseExpiresToMs', () => {
  it('interpreta el formato de JWT_EXPIRES_IN', () => {
    expect(parseExpiresToMs('30s')).toBe(30_000);
    expect(parseExpiresToMs('15m')).toBe(900_000);
    expect(parseExpiresToMs('4h')).toBe(14_400_000);
    expect(parseExpiresToMs('7d')).toBe(604_800_000);
  });

  it('recurre a 4 h ante un valor inválido', () => {
    expect(parseExpiresToMs('basura')).toBe(14_400_000);
    expect(parseExpiresToMs(undefined)).toBe(14_400_000);
    expect(parseExpiresToMs('')).toBe(14_400_000);
  });
});
