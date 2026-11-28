import {
  esLlaveSecreta,
  formaDe,
  mensajeSeguroParaLog,
  paramsParaLog,
  pareceToken,
  pathParaLog,
  usuarioParaLog,
} from './mascara-log';

const HEX32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const TOKEN_BASE64URL = 'aB3dE5gH7jK9mN1pQ3sT5v';

/** Cuántos niveles de objetos o arreglos anidados tiene un valor (un objeto plano cuenta 1). */
function profundidad(valor: unknown): number {
  if (!valor || typeof valor !== 'object') return 0;
  const hijos = Array.isArray(valor) ? valor : Object.values(valor as Record<string, unknown>);
  return 1 + Math.max(0, ...hijos.map(profundidad));
}

describe('usuarioParaLog', () => {
  it('de un JWT completo deja solo id, roleKey e isClient (sin correo, jti ni permisos)', () => {
    const jwt = {
      id: 42,
      roleId: 3,
      departmentId: 7,
      permissions: Array.from({ length: 20 }, (_, i) => `modulo.accion.${i}`),
      isSuperAdmin: false,
      roleKey: 'tecnico',
      orgRoleKey: 'campo',
      email: 'maria.lopez@nexara.com.mx',
      clientId: null,
      isClient: false,
      jti: '7f0c2b9e-1d3a-4c55-9a40-0e7d7a2f6a11',
      rem: true,
      accesos: ['finanzas', 'nomina'],
    };
    const visto = usuarioParaLog(jwt);
    expect(visto).toEqual({ id: 42, roleKey: 'tecnico', isClient: false });
    expect(Object.keys(visto!).sort()).toEqual(['id', 'isClient', 'roleKey']);
    const texto = JSON.stringify(visto);
    expect(texto).not.toContain('maria.lopez');
    expect(texto).not.toContain('7f0c2b9e');
    expect(texto).not.toContain('modulo.accion');
  });

  it('un cliente del portal queda marcado y sin id', () => {
    expect(usuarioParaLog({ id: null, isClient: true, clientId: 9, companyId: 1, permissions: [] })).toEqual({
      id: null,
      roleKey: null,
      isClient: true,
    });
  });

  it('sin sesión o con algo que no es un objeto da null', () => {
    expect(usuarioParaLog(undefined)).toBeNull();
    expect(usuarioParaLog(null)).toBeNull();
    expect(usuarioParaLog('maria@x.com')).toBeNull();
    expect(usuarioParaLog(7)).toBeNull();
  });

  it('un id o un rol con forma de correo no pasa', () => {
    expect(usuarioParaLog({ id: 'maria@x.com', roleKey: 'a@b.com' })).toEqual({
      id: null,
      roleKey: null,
      isClient: false,
    });
  });
});

describe('formaDe', () => {
  it('dice qué campos llegaron y de qué tipo, sin ningún valor', () => {
    const forma = formaDe({
      password: 'abc',
      photoUrl: 'data:image/jpeg;base64,' + 'A'.repeat(100000),
      latitude: 19.04,
      tags: ['a', 'b'],
      nested: { a: { b: { c: 1 } } },
    }) as Record<string, unknown>;
    const texto = JSON.stringify(forma);
    expect(texto).not.toContain('abc');
    expect(texto).not.toContain('AAAA');
    expect(texto).not.toContain('19.04');
    expect(texto).not.toContain('data:image');
    expect(forma['password']).toBe('s:3');
    expect(forma['photoUrl']).toBe('s:100023');
    expect(forma['latitude']).toBe('n');
    expect(forma['tags']).toEqual(['[2]', 's:1']);
    expect(texto.length).toBeLessThan(400);
  });

  it('cubre los tipos simples', () => {
    expect(formaDe('hola')).toBe('s:4');
    expect(formaDe('')).toBe('s:0');
    expect(formaDe(12.5)).toBe('n');
    expect(formaDe(10n)).toBe('n');
    expect(formaDe(true)).toBe('b');
    expect(formaDe(null)).toBeNull();
    expect(formaDe(undefined)).toBeNull();
    expect(formaDe(new Date())).toBe('fecha');
    expect(formaDe(() => 1)).toBe('x');
    expect(formaDe(Buffer.alloc(5000))).toBe('bin:5000');
  });

  it('un arreglo dice cuántos elementos tiene y la forma del primero; vacío o muy hondo, solo el número', () => {
    expect(formaDe([])).toBe('[0]');
    expect(formaDe([{ id: 1, nombre: 'Zoe' }, { id: 2 }])).toEqual(['[2]', { id: 'n', nombre: 's:3' }]);
    expect(formaDe({ items: [{ sub: [1, 2, 3] }] })).toEqual({ items: ['[1]', { sub: '[3]' }] });
  });

  it('máximo 30 llaves: si hay más, la última dice cuántas faltaron', () => {
    const grande: Record<string, number> = {};
    for (let i = 0; i < 100; i++) grande[`campo${i}`] = i;
    const forma = formaDe(grande) as Record<string, unknown>;
    expect(Object.keys(forma)).toHaveLength(30);
    expect(forma['campo0']).toBe('n');
    expect(forma['campo28']).toBe('n');
    expect(forma['campo29']).toBeUndefined();
    expect(forma['…']).toBe('+71');

    const justo: Record<string, number> = {};
    for (let i = 0; i < 30; i++) justo[`c${i}`] = i;
    expect(Object.keys(formaDe(justo) as object)).toHaveLength(30);
    expect((formaDe(justo) as Record<string, unknown>)['…']).toBeUndefined();
  });

  it('máximo 3 niveles: más abajo solo dice cuántas llaves hay', () => {
    const hondo = { a: { b: { c: { d: { e: 'secreto' } } } } };
    const forma = formaDe(hondo);
    expect(forma).toEqual({ a: { b: { c: '{1}' } } });
    expect(profundidad(forma)).toBe(3);
    expect(JSON.stringify(forma)).not.toContain('secreto');
    // Un arreglo anidado también se corta.
    expect(profundidad(formaDe({ a: [[[[1]]]] }))).toBeLessThanOrEqual(3);
  });

  it('una referencia circular no revienta ni se repite', () => {
    const a: Record<string, unknown> = { nombre: 'x' };
    a['yo'] = a;
    a['lista'] = [a];
    expect(formaDe(a)).toEqual({ nombre: 's:1', yo: '[ciclo]', lista: ['[1]', '[ciclo]'] });
  });

  it('el mismo objeto repetido sin ser un ciclo se describe las dos veces', () => {
    const compartido = { id: 1 };
    expect(formaDe({ a: compartido, b: compartido })).toEqual({ a: { id: 'n' }, b: { id: 'n' } });
  });

  it('una llave que carga un dato (correo, token, texto largo) no se escribe', () => {
    const forma = formaDe({
      'maria@x.com': 1,
      [HEX32]: 2,
      ['x'.repeat(100)]: 3,
      normal: 4,
    }) as Record<string, unknown>;
    const texto = JSON.stringify(forma);
    expect(texto).not.toContain('maria');
    expect(texto).not.toContain(HEX32);
    expect(forma['normal']).toBe('n');
  });

  it('una llave __proto__ no cambia el prototipo del resultado', () => {
    const crudo = JSON.parse('{"__proto__": {"admin": true}, "a": 1}');
    const forma = formaDe(crudo) as Record<string, unknown>;
    expect(Object.getPrototypeOf(forma)).toBe(Object.prototype);
    expect((forma as { admin?: unknown }).admin).toBeUndefined();
    expect(forma['a']).toBe('n');
  });

  it('un getter que lanza o un proxy roto no tumban el filtro', () => {
    const malo = {
      get peligro(): string {
        throw new Error('no se puede leer');
      },
      ok: 1,
    };
    expect(formaDe(malo)).toEqual({ peligro: null, ok: 'n' });
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('roto');
        },
      },
    );
    expect(formaDe(proxy)).toBe('?');
  });
});

describe('pathParaLog', () => {
  it('sustituye el token de ruta y tacha el query salvo la lista blanca', () => {
    expect(
      pathParaLog(`/api/cotizaciones-publicas/${TOKEN_BASE64URL}/sign?token=zzz&estado=PENDIENTE&q=maria`),
    ).toBe('/api/cotizaciones-publicas/<token>/sign?token=*&estado=PENDIENTE&q=*');
  });

  it('enmascara el token del buzón de Hikvision y deja el número de sitio', () => {
    expect(pathParaLog(`/api/integra/hik/3/${HEX32}`)).toBe('/api/integra/hik/3/<token>');
  });

  it('un UUID es un token', () => {
    expect(pathParaLog('/api/x/7f0c2b9e-1d3a-4c55-9a40-0e7d7a2f6a11/ver')).toBe('/api/x/<token>/ver');
  });

  it('una ruta sin nada secreto no cambia', () => {
    expect(pathParaLog('/api/users/bajas?estado=PENDIENTE')).toBe('/api/users/bajas?estado=PENDIENTE');
    expect(pathParaLog('/api/activity-evidence/123/entry-photo')).toBe('/api/activity-evidence/123/entry-photo');
    expect(pathParaLog('/')).toBe('/');
    expect(pathParaLog('/api/page-content/seo_home')).toBe('/api/page-content/seo_home');
  });

  it('el código de recolección se enmascara aunque sea corto; pendientes no', () => {
    expect(pathParaLog('/api/tool-requests/pickup/ACD7YN')).toBe('/api/tool-requests/pickup/<codigo>');
    expect(pathParaLog('/api/tool-requests/pickup/pendientes')).toBe('/api/tool-requests/pickup/pendientes');
  });

  it('un correo en la ruta o en un valor del query no sale', () => {
    expect(pathParaLog('/api/users/por-correo/maria@x.com')).toBe('/api/users/por-correo/<correo>');
    expect(pathParaLog('/api/users/por-correo/maria%40x.com')).toBe('/api/users/por-correo/<correo>');
    expect(pathParaLog('/api/users?estado=maria@x.com')).toBe('/api/users?estado=*');
    // Escrito con `%`: pasa el filtro de caracteres, así que se mira ya decodificado.
    expect(pathParaLog('/api/users?estado=maria%40x.com')).toBe('/api/users?estado=*');
    expect(pathParaLog('/api/users?estado=En%20Proceso')).toBe('/api/users?estado=En%20Proceso');
    expect(pathParaLog('/api/users?estado=%E0%A4%A')).toBe('/api/users?estado=*');
  });

  it('los filtros de la lista blanca se conservan y cualquier otro valor queda como *', () => {
    expect(pathParaLog('/api/a?semana=2026-W47&limit=50&page=2&desde=2026-11-01&hasta=2026-11-28&sort=nombre&orden=asc')).toBe(
      '/api/a?semana=2026-W47&limit=50&page=2&desde=2026-11-01&hasta=2026-11-28&sort=nombre&orden=asc',
    );
    expect(pathParaLog('/api/a?search=maria&email=maria@x.com&Estado=ABIERTA&flag')).toBe(
      '/api/a?search=*&email=*&Estado=ABIERTA&flag',
    );
  });

  it('un valor de la lista blanca con forma de token o demasiado largo se tacha', () => {
    expect(pathParaLog(`/api/a?estado=${HEX32}`)).toBe('/api/a?estado=*');
    expect(pathParaLog(`/api/a?estado=${'X'.repeat(80)}`)).toBe('/api/a?estado=*');
  });

  it('quita el fragmento, acota una URL enorme y no lanza con un valor que no es texto', () => {
    expect(pathParaLog('/api/a#secreto')).toBe('/api/a');
    const larga = pathParaLog('/api/a?' + 'q=1&'.repeat(5000));
    expect(larga.length).toBeLessThanOrEqual(400);
    expect(pathParaLog(undefined)).toBe('');
    expect(pathParaLog(12 as never)).toBe('');
  });
});

describe('paramsParaLog', () => {
  it('conserva el número y el slug, enmascara el token', () => {
    expect(paramsParaLog({ id: '12', slug: 'wifi-empresarial-horas-pico', token: HEX32 })).toEqual({
      id: '12',
      slug: 'wifi-empresarial-horas-pico',
      token: '<token>',
    });
  });

  it('un token con otro nombre de parámetro también se enmascara, y un número de verdad se conserva', () => {
    expect(paramsParaLog({ siteId: 3, hash: HEX32, uuid: '7f0c2b9e-1d3a-4c55-9a40-0e7d7a2f6a11' })).toEqual({
      siteId: 3,
      hash: '<token>',
      uuid: '<token>',
    });
  });

  it('un parámetro que por su nombre es un secreto se enmascara aunque sea corto (código de recolección)', () => {
    expect(paramsParaLog({ code: 'ACD7YN' })).toEqual({ code: '<token>' });
  });

  it('un texto largo queda como su longitud y un correo como <correo>', () => {
    expect(paramsParaLog({ q: 'palabra '.repeat(20), correo: 'maria@x.com' })).toEqual({
      q: 's:160',
      correo: '<correo>',
    });
  });

  it('sin parámetros da un objeto vacío y no lanza con algo raro', () => {
    expect(paramsParaLog(undefined)).toEqual({});
    expect(paramsParaLog(null)).toEqual({});
    expect(paramsParaLog({})).toEqual({});
    // Un parámetro que no es texto ni número (un comodín que llega como arreglo) solo dice cuántos elementos trae.
    expect(paramsParaLog({ 0: ['a', 'b'] })).toEqual({ 0: '[2]' });
  });
});

describe('mensajeSeguroParaLog', () => {
  it('quita una foto en base64 pegada en el mensaje y recorta', () => {
    const msg = 'No se pudo guardar la foto data:image/jpeg;base64,' + 'A'.repeat(50000) + ' de la actividad';
    const limpio = mensajeSeguroParaLog(msg);
    expect(limpio).toBe('No se pudo guardar la foto [archivo]');
    expect(mensajeSeguroParaLog('x'.repeat(1000))).toHaveLength(300);
    expect(mensajeSeguroParaLog('x'.repeat(1000), 50)).toHaveLength(50);
  });

  it('quita correos y JWT y deja el resto en una sola línea', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firmaFirmaFirma';
    expect(mensajeSeguroParaLog(`El usuario maria@x.com\nusó ${jwt}   hoy`)).toBe('El usuario <correo> usó <token> hoy');
  });

  it('un valor que no es texto no revienta', () => {
    expect(mensajeSeguroParaLog(undefined)).toBe('');
    expect(mensajeSeguroParaLog(null)).toBe('');
    expect(mensajeSeguroParaLog({ a: 1 })).toBe('');
    expect(mensajeSeguroParaLog(['uno', 'dos'])).toBe('uno | dos');
  });

  it('no parte un emoji a la mitad al recortar', () => {
    const recortado = mensajeSeguroParaLog('a'.repeat(299) + '😀😀', 300);
    expect(recortado).toBe('a'.repeat(299));
  });
});

describe('esLlaveSecreta', () => {
  it('reconoce por el nombre contraseñas, tokens, claves y datos de pago', () => {
    for (const llave of [
      'password', 'passwordHash', 'portalPassword', 'newPassword', 'passwd', 'contrasena', 'contraseña',
      'token', 'accessToken', 'refresh_token', 'webhookToken', 'apiKey', 'api_key', 'x-api-key',
      'secret', 'clientSecret', 'cardNumber', 'accountNumber',
    ]) {
      expect(esLlaveSecreta(llave)).toBe(true);
    }
  });

  it('reconoce RFC, CURP, NSS, CLABE y taxId al inicio o al final del nombre', () => {
    for (const llave of [
      'rfc', 'RFC', 'curp', 'nss', 'clabe', 'taxId', 'receptorRfc', 'emisorRfc', 'companyRfc', 'counterpartyRfc',
      'counterpartyClabe', 'rfcEmisor', 'rfc_receptor', 'empleado_nss', 'CURP_titular',
    ]) {
      expect(esLlaveSecreta(llave)).toBe(true);
    }
  });

  it('no confunde nombres de negocio con secretos', () => {
    for (const llave of [
      'titulo', 'nombre', 'email', 'secretaria', 'secretario', 'Secretaría', 'marfcom', 'code', 'pin', 'otp',
      'statusCode', 'message', 'error', 'cantidad', 'latitude', '',
    ]) {
      expect(esLlaveSecreta(llave)).toBe(false);
    }
  });

  it('un valor que no es texto no revienta', () => {
    expect(esLlaveSecreta(undefined as unknown as string)).toBe(false);
    expect(esLlaveSecreta(7 as unknown as string)).toBe(false);
  });
});

describe('pareceToken', () => {
  it('reconoce UUID, hex largo, JWT y tokens con dígito; no una palabra ni un slug', () => {
    expect(pareceToken(HEX32)).toBe(true);
    expect(pareceToken('0123456789abcdef')).toBe(true);
    expect(pareceToken('7f0c2b9e-1d3a-4c55-9a40-0e7d7a2f6a11')).toBe(true);
    expect(pareceToken('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma')).toBe(true);
    expect(pareceToken(TOKEN_BASE64URL)).toBe(true);
    expect(pareceToken('wifi-empresarial-horas-pico')).toBe(false);
    expect(pareceToken('electrocardiograficamente')).toBe(false);
    expect(pareceToken('12')).toBe(false);
    expect(pareceToken('')).toBe(false);
  });
});
