import {
  HttpException,
  HttpStatus,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MulterError } from 'multer';
import { AllExceptionsFilter, clasificarError } from './all-exception.filter.js';
import {
  huellaDeError,
  normalizarMensaje,
  normalizarRuta,
  resumenInterno,
  rutaPatron,
} from './normalizar.js';

/** Un error con el nombre de clase de Prisma, sin arrastrar su runtime. */
function errorDePrisma(nombre: string, mensaje: string, code?: string): Error {
  class Nombrada extends Error {}
  Object.defineProperty(Nombrada, 'name', { value: nombre });
  const e = new Nombrada(mensaje);
  if (code) (e as unknown as { code: string }).code = code;
  return e;
}

describe('normalizarMensaje', () => {
  it('lo que va entre comillas se vuelve <texto>', () => {
    expect(normalizarMensaje('Sección "seo_home" no tiene contenido publicado todavía.')).toBe(
      'Sección <texto> no tiene contenido publicado todavía.',
    );
  });

  it('lo que va entre paréntesis se vuelve (<texto>) y el resto del mensaje se queda', () => {
    expect(normalizarMensaje('Tu rol (ing_campo) no puede acceder a GET /api/users/assignable')).toBe(
      'Tu rol (<texto>) no puede acceder a GET /api/users/assignable',
    );
  });

  it('el mismo mensaje con otro número da el mismo resultado', () => {
    expect(normalizarMensaje('Actividad 1234 no encontrada')).toBe(normalizarMensaje('Actividad 99 no encontrada'));
    expect(normalizarMensaje('Actividad 1234 no encontrada')).toBe('Actividad <n> no encontrada');
  });

  it('uuid, correo, JWT y un hexadecimal de 32 caracteres se vuelven marcadores', () => {
    expect(normalizarMensaje('Falta 3f2b8c1e-5a7d-4e90-9b21-0c8d7e6f5a4b en la lista')).toBe(
      'Falta <uuid> en la lista',
    );
    expect(normalizarMensaje('No existe adam.perez@empresa.com.mx')).toBe('No existe <correo>');
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(normalizarMensaje(`Token inválido ${jwt}`)).toBe('Token inválido <token>');
    expect(normalizarMensaje('Clave a1b2c3d4e5f60718293a4b5c6d7e8f90 rechazada')).toBe('Clave <token> rechazada');
  });

  it('las fechas con hora y las horas sueltas se vuelven <fecha> y <hora>', () => {
    expect(normalizarMensaje('Se registró el 2026-11-25T16:12:07Z')).toBe('Se registró el <fecha>');
    expect(normalizarMensaje('Salida 2026-11-25')).toBe('Salida <fecha>');
    expect(normalizarMensaje('Ya checaste a las 16:15')).toBe('Ya checaste a las <hora>');
    expect(normalizarMensaje('A las 7:05:30 no')).toBe('A las <hora> no');
  });

  it('un monto se vuelve <monto>', () => {
    expect(normalizarMensaje('El viático de $1,234.50 excede el tope')).toBe('El viático de <monto> excede el tope');
  });

  it('las comillas latinas, curvas, simples y los acentos graves también', () => {
    expect(normalizarMensaje('Falta «uno» y “dos” y \'tres\' y `cuatro`')).toBe(
      'Falta <texto> y <texto> y <texto> y <texto>',
    );
  });

  it('un apóstrofo dentro de una palabra no abre una cita', () => {
    expect(normalizarMensaje("it's fine: 'x'")).toBe("it's fine: <texto>");
  });

  it('un arreglo se resume con sus tres primeros textos distintos', () => {
    expect(normalizarMensaje(['a', 'b', 'a'])).toBe('a | b');
    expect(normalizarMensaje(['a', 'b', 'c', 'd'])).toBe('a | b | c');
    expect(normalizarMensaje(['Falta el dato 1', 'Falta el dato 2'])).toBe('Falta el dato <n>');
  });

  it('es idempotente en 20 ejemplos reales y raros', () => {
    const ejemplos: unknown[] = [
      'Sección "seo_home" no tiene contenido publicado todavía.',
      'Tu rol (ing_campo) no puede acceder a GET /api/users/assignable',
      'Actividad 1234 no encontrada',
      'Falta 3f2b8c1e-5a7d-4e90-9b21-0c8d7e6f5a4b en la lista',
      'No existe adam.perez@empresa.com.mx',
      'Se registró el 2026-11-25T16:12:07Z a las 16:15',
      'El viático de $1,234.50 excede el tope de $ 2000',
      'Falta «uno» y “dos” y \'tres\' y `cuatro`',
      ['Falta el dato 1', 'Falta el dato 2', 'Otro (x) problema'],
      'Hoy es Día de la Revolución: no se labora (festivo 20 de noviembre).',
      'a (b (c) d) e',
      'doble   espacio\ny salto\tde línea',
      'x'.repeat(300),
      `${'palabra '.repeat(40)} 12345 "cola"`,
      '(((',
      '"sin cerrar y (sin cerrar',
      'Clave a1b2c3d4e5f60718293a4b5c6d7e8f90 rechazada, reintenta 12:30:45:10',
      'Invalid <texto> invocation: <n>',
      '2026-11-25 16:12 -06:00 y 2026-01-01T00:00:00.000+00:00',
      "l'a 'b'c 'd' e 'f",
    ];
    expect(ejemplos).toHaveLength(20);
    for (const ejemplo of ejemplos) {
      const una = normalizarMensaje(ejemplo);
      expect(normalizarMensaje(una)).toBe(una);
    }
  });

  it('recorta a 240 caracteres', () => {
    expect(normalizarMensaje('palabra '.repeat(60)).length).toBeLessThanOrEqual(240);
    expect(normalizarMensaje('x'.repeat(300)).length).toBeLessThanOrEqual(240);
  });

  it('null, undefined, números y objetos dan cadena vacía', () => {
    expect(normalizarMensaje(null)).toBe('');
    expect(normalizarMensaje(undefined)).toBe('');
    expect(normalizarMensaje({ message: 'x' })).toBe('');
    expect(normalizarMensaje(42)).toBe('');
  });

  it('los mensajes con acentos conservan sus acentos', () => {
    const texto = 'Hoy es Día de la Revolución: no se labora. Corrección: sesión, jornada, año.';
    expect(normalizarMensaje(texto)).toBe(texto);
  });

  it('una palabra larga sin dígitos no es un token', () => {
    expect(normalizarMensaje('Falta grabaciones-reuniones-participantes-extra')).toBe(
      'Falta grabaciones-reuniones-participantes-extra',
    );
  });
});

describe('normalizarMensaje · comillas que no se cierran o son demasiado largas', () => {
  it('una comilla sin cerrar corta el texto ahí: lo que sigue puede ser un valor', () => {
    expect(normalizarMensaje('Falla con "Juan Perez Lopez')).toBe('Falla con');
    expect(normalizarMensaje('Falta «el dato de Juan')).toBe('Falta');
    expect(normalizarMensaje('Falta “el dato de Juan')).toBe('Falta');
    expect(normalizarMensaje("Falla con 'Juan Perez")).toBe('Falla con');
    expect(normalizarMensaje('Falla con `Juan Perez')).toBe('Falla con');
  });

  it('un texto entre comillas o acentos graves de más de 200 caracteres no se cuela', () => {
    const largo = 'Juan Perez '.repeat(30);
    for (const [abre, cierra] of [['"', '"'], ['`', '`'], ['«', '»'], ['“', '”'], ["'", "'"]]) {
      const resultado = normalizarMensaje(`Valor ${abre}${largo}${cierra} inválido`);
      expect(resultado).toBe('Valor');
      expect(resultado).not.toContain('Juan');
    }
  });

  it('lo que va antes y después de una cita corta sigue igual; solo la comilla suelta corta', () => {
    expect(normalizarMensaje('Sin "a" y con "b" y luego "c sin cerrar 99')).toBe('Sin <texto> y con <texto> y luego');
  });

  it('el apóstrofo dentro de una palabra se queda: no abre ninguna cita', () => {
    expect(normalizarMensaje("Can't find 'x' (it's gone)")).toBe("Can't find <texto> (<texto>)");
    expect(normalizarMensaje("l'a 'b'c 'd' e 'f")).toBe("l'a");
  });

  it('lo que queda después de cortar también es idempotente', () => {
    for (const ejemplo of ['Falla con "Juan', `Valor \`${'Juan '.repeat(60)}\``, "l'a 'b'c 'd' e 'f", 'a "b" c "d']) {
      const una = normalizarMensaje(ejemplo);
      expect(normalizarMensaje(una)).toBe(una);
    }
  });

  it('un recorte nunca deja la mitad de un emoji', () => {
    const sinSustitutoSuelto = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const enElLimiteDeSalida = normalizarMensaje(`${'a'.repeat(239)}😀`);
    expect(enElLimiteDeSalida).toBe('a'.repeat(239));
    expect(sinSustitutoSuelto.test(enElLimiteDeSalida)).toBe(false);
    const enElLimiteDeEntrada = normalizarMensaje(`${'a'.repeat(999)}😀`);
    expect(sinSustitutoSuelto.test(enElLimiteDeEntrada)).toBe(false);
    expect(normalizarMensaje('Sesión 😀 cerrada')).toBe('Sesión 😀 cerrada');
  });
});

describe('entrada enorme · el costo no crece con el cuadrado del texto', () => {
  /** Lo que tardaba antes: 200,000 caracteres daban 23 s. Con el tope de entrada son décimas de ms. */
  const LIMITE_MS = 50;

  function tarda(fn: () => unknown): number {
    const inicio = process.hrtime.bigint();
    fn();
    return Number(process.hrtime.bigint() - inicio) / 1e6;
  }

  // Compila las expresiones regulares antes de medir: se mide el costo del texto, no el arranque.
  beforeAll(() => {
    normalizarMensaje('calentando 12 (a) b@c.com "x" `y` 2026-11-25');
    resumenInterno(errorDePrisma('PrismaClientKnownRequestError', 'Invalid `prisma.a.b()` invocation:\n\ncalentando', 'P2002'));
  });

  const casos: Array<[string, string]> = [
    ['200,000 letras seguidas', 'a'.repeat(200_000)],
    ['«ab12» repetido hasta 200,000 caracteres', 'ab12'.repeat(50_000)],
    ['un «(» y 200,000 caracteres sin cerrar', `(${'a'.repeat(200_000)}`],
    ['«( » repetido', '( '.repeat(100_000)],
    ['«a@» repetido', 'a@'.repeat(100_000)],
    ['un correo con dominio larguísimo', `x@${'ab.'.repeat(70_000)}`],
    ['«eyJ» repetido', 'eyJ'.repeat(70_000)],
    ['números con puntos y una letra al final', `${'1.'.repeat(100_000)}a`],
    ['una comilla y 200,000 caracteres', `"${'b '.repeat(100_000)}`],
    ['200,000 espacios', ' '.repeat(200_000)],
  ];

  it.each(casos)('normalizarMensaje: %s tarda menos de 50 ms', (_nombre, texto) => {
    let resultado = '';
    const ms = tarda(() => {
      resultado = normalizarMensaje(texto);
    });
    expect(ms).toBeLessThan(LIMITE_MS);
    expect(resultado.length).toBeLessThanOrEqual(240);
  });

  it('un arreglo enorme de mensajes iguales tampoco se alarga', () => {
    const unico = 'a'.repeat(900);
    const ms = tarda(() => normalizarMensaje(Array.from({ length: 20_000 }, () => unico)));
    expect(ms).toBeLessThan(LIMITE_MS);
  });

  it.each(casos)('resumenInterno de un error común: %s tarda menos de 50 ms', (_nombre, texto) => {
    const e = new Error(texto);
    e.stack = `Error: ${texto}\n    at X.y (/app/apps/api/dist/me/foo.js:12:3)`;
    let resumen = '';
    const ms = tarda(() => {
      resumen = resumenInterno(e);
    });
    expect(ms).toBeLessThan(LIMITE_MS);
    expect(resumen.length).toBeLessThanOrEqual(200);
    expect(resumen).toContain('en foo.js:12');
  });

  it.each(casos)('resumenInterno de un error de Prisma: %s tarda menos de 50 ms', (_nombre, texto) => {
    const enUnaLinea = errorDePrisma('PrismaClientValidationError', `Invalid \`prisma.cotizacion.update()\` invocation: ${texto}`);
    const enVariasLineas = errorDePrisma('PrismaClientKnownRequestError', `Invalid \`prisma.cotizacion.update()\` invocation:\n\n${texto}`, 'P2010');
    for (const e of [enUnaLinea, enVariasLineas]) {
      let resumen = '';
      const ms = tarda(() => {
        resumen = resumenInterno(e);
      });
      expect(ms).toBeLessThan(LIMITE_MS);
      expect(resumen.length).toBeLessThanOrEqual(200);
      expect(resumen).toContain('prisma.cotizacion.update');
    }
  });

  it('un mensaje de millones de caracteres o de millones de saltos de línea no se recorre entero', () => {
    const e1 = errorDePrisma('PrismaClientValidationError', `Invalid \`prisma.x.y()\` invocation:\n${'{ a: 1 }\n'.repeat(500_000)}`);
    const e2 = errorDePrisma('PrismaClientKnownRequestError', `Invalid \`prisma.x.y()\` invocation:\n${'\n'.repeat(3_000_000)}`, 'P2002');
    const e3 = new Error('boom');
    e3.stack = `Error: boom\n${'\n'.repeat(3_000_000)}    at X.y (/app/apps/api/dist/me/foo.js:12:3)`;
    for (const e of [e1, e2, e3]) {
      const ms = tarda(() => resumenInterno(e));
      expect(ms).toBeLessThan(LIMITE_MS);
    }
  });
});

describe('normalizarRuta', () => {
  it('quita el query y vuelve :n el número', () => {
    expect(normalizarRuta('/api/activity-evidence/123/entry-photo?x=1')).toBe('/api/activity-evidence/:n/entry-photo');
  });

  it('un token de enlace público se vuelve :token', () => {
    expect(normalizarRuta('/api/cotizaciones-publicas/aB3dE5gH7jK9mN1pQ3sT5v/sign')).toBe(
      '/api/cotizaciones-publicas/:token/sign',
    );
    expect(normalizarRuta('/api/integra/hik/3/b1c2d3e4f5a6b7c8d9e0f1a2')).toBe('/api/integra/hik/:n/:token');
  });

  it('una palabra larga sin dígito se queda: no es un token', () => {
    expect(normalizarRuta('/api/grabaciones-reuniones/7/partes')).toBe('/api/grabaciones-reuniones/:n/partes');
  });

  it('un uuid se vuelve :uuid', () => {
    expect(normalizarRuta('/api/files/3f2b8c1e-5a7d-4e90-9b21-0c8d7e6f5a4b/download')).toBe('/api/files/:uuid/download');
  });

  it('un correo (escrito o con %40) y el código tras /pickup/ se vuelven marcadores', () => {
    expect(normalizarRuta('/api/users/por-correo/maria@x.com')).toBe('/api/users/por-correo/:correo');
    expect(normalizarRuta('/api/users/por-correo/maria%40x.com')).toBe('/api/users/por-correo/:correo');
    expect(normalizarRuta('/api/tool-requests/pickup/ACD7YN')).toBe('/api/tool-requests/pickup/:codigo');
    expect(normalizarRuta('/api/tool-requests/pickup/pendientes')).toBe('/api/tool-requests/pickup/pendientes');
    expect(normalizarRuta('/api/tool-requests/pickup/:codigo')).toBe('/api/tool-requests/pickup/:codigo');
  });

  it('quita la barra final, conserva la raíz y recorta a 160', () => {
    expect(normalizarRuta('/api/clients/')).toBe('/api/clients');
    expect(normalizarRuta('/')).toBe('/');
    expect(normalizarRuta('/?a=1')).toBe('/');
    expect(normalizarRuta('')).toBe('');
    expect(normalizarRuta(`/${'a/'.repeat(200)}`).length).toBeLessThanOrEqual(160);
  });

  it('es idempotente', () => {
    const una = normalizarRuta('/api/cotizaciones-publicas/aB3dE5gH7jK9mN1pQ3sT5v/sign?x=1');
    expect(normalizarRuta(una)).toBe(una);
  });
});

describe('rutaPatron', () => {
  it('usa el patrón que declaró el controlador, con el prefijo global', () => {
    expect(
      rutaPatron({ route: { path: '/api/activity-evidence/:id/entry-photo' }, originalUrl: '/api/activity-evidence/9/entry-photo?x=1' }),
    ).toBe('/api/activity-evidence/:id/entry-photo');
  });

  it('sin ruta de Express (un 404) usa la URL normalizada', () => {
    expect(rutaPatron({ originalUrl: '/api/activity-evidence/9/entry-photo?x=1' })).toBe('/api/activity-evidence/:n/entry-photo');
    expect(rutaPatron({ url: '/api/clients/5' })).toBe('/api/clients/:n');
    expect(rutaPatron({ route: { path: /regex/ }, url: '/api/x/5' })).toBe('/api/x/:n');
    expect(rutaPatron(undefined)).toBe('');
  });
});

describe('huellaDeError', () => {
  const base = { metodo: 'POST', ruta: '/api/x/:id', estado: 422, codigo: 'JORNADA_NO_ABIERTA', mensaje: 'Actividad 1 no encontrada' };

  it('es estable y de 16 caracteres hexadecimales', () => {
    const h = huellaDeError(base);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(huellaDeError({ ...base })).toBe(h);
  });

  it('no cambia si solo cambian los números o el método va en minúsculas', () => {
    expect(huellaDeError({ ...base, mensaje: 'Actividad 99 no encontrada' })).toBe(huellaDeError(base));
    expect(huellaDeError({ ...base, metodo: 'post' })).toBe(huellaDeError(base));
  });

  it('cambia con el estado, la ruta o el código', () => {
    const h = huellaDeError(base);
    expect(huellaDeError({ ...base, estado: 409 })).not.toBe(h);
    expect(huellaDeError({ ...base, ruta: '/api/y/:id' })).not.toBe(h);
    expect(huellaDeError({ ...base, codigo: undefined })).not.toBe(h);
  });
});

describe('resumenInterno', () => {
  const cuerpoConValores = [
    'Invalid `prisma.cotizacion.update()` invocation:',
    '',
    '{',
    '  where: {',
    '    id: 5',
    '  },',
    '  data: {',
    '    email: "x@y.com",',
    '    nombre: "Zoe",',
    '    ~~~~~~',
    '  }',
    '}',
    '',
    'Unknown argument `nombre`. Available options are marked with ?.',
  ].join('\n');

  it('un error de validación de Prisma dice dónde falló y nunca los valores enviados', () => {
    const resumen = resumenInterno(errorDePrisma('PrismaClientValidationError', cuerpoConValores));
    expect(resumen).toContain('PrismaClientValidationError');
    expect(resumen).toContain('prisma.cotizacion.update');
    expect(resumen).not.toContain('x@y.com');
    expect(resumen).not.toContain('Zoe');
    expect(resumen).not.toMatch(/[{}@]/);
    expect(resumen.length).toBeLessThanOrEqual(200);
  });

  it('aunque el cuerpo con valores sea lo último del mensaje, no se cuela ningún valor', () => {
    const alReves = [
      'Invalid `prisma.cotizacion.update()` invocation:',
      '{',
      '  data: {',
      '    email: "x@y.com",',
      '    nombre: "Zoe",',
      '    telefono: 2381234567',
      '  }',
      '}',
    ].join('\n');
    const resumen = resumenInterno(errorDePrisma('PrismaClientValidationError', alReves));
    expect(resumen).toContain('prisma.cotizacion.update');
    expect(resumen).not.toContain('x@y.com');
    expect(resumen).not.toContain('Zoe');
    expect(resumen).not.toContain('2381234567');
    expect(resumen).not.toMatch(/[{}@]/);
  });

  it('un error conocido de Prisma incluye su código P y la causa sin los nombres de campo', () => {
    const resumen = resumenInterno(
      errorDePrisma(
        'PrismaClientKnownRequestError',
        'Invalid `prisma.user.create()` invocation:\n\n\nUnique constraint failed on the fields: (`email`)',
        'P2002',
      ),
    );
    expect(resumen).toBe('PrismaClientKnownRequestError prisma.user.create P2002 Unique constraint failed on the fields: (<texto>)');
  });

  it('un TypeError dice el archivo y la línea de nuestro código, no de node_modules', () => {
    const e = new TypeError("Cannot read properties of null (reading 'userId')");
    e.stack = [
      "TypeError: Cannot read properties of null (reading 'userId')",
      '    at Object.<anonymous> (/app/node_modules/algo/dist/index.js:9:9)',
      '    at MeService.foo (/app/apps/api/dist/me/foo.js:123:45)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
    ].join('\n');
    const resumen = resumenInterno(e);
    expect(resumen).toBe('TypeError: Cannot read properties of null (<texto>) en foo.js:123');
  });

  it('entiende una pila de Windows y una pila que es solo la ruta', () => {
    const w = new Error('boom');
    w.stack = 'Error: boom\n    at C:\\app\\apps\\api\\src\\me\\bar.ts:77:3';
    expect(resumenInterno(w)).toBe('Error: boom en bar.ts:77');
    const s = new TypeError('x');
    s.stack = '/app/apps/api/dist/me/foo.js:123:45';
    expect(resumenInterno(s)).toContain('foo.js:123');
  });

  it('un error sin pila, un texto suelto y valores raros no revientan', () => {
    const sinPila = new Error('algo');
    sinPila.stack = undefined;
    expect(resumenInterno(sinPila)).toBe('Error: algo');
    expect(resumenInterno('texto suelto con 12 cosas')).toBe('Error: texto suelto con <n> cosas');
    expect(resumenInterno(null)).toBe('Error');
    expect(resumenInterno(undefined)).toBe('Error');
  });

  it('el mensaje de un error corriente no deja correos ni datos y mide hasta 200', () => {
    const e = new Error(`Falla con adam@empresa.com y ${'x'.repeat(500)}`);
    const resumen = resumenInterno(e);
    expect(resumen).not.toContain('adam@empresa.com');
    expect(resumen).not.toContain('@');
    expect(resumen.length).toBeLessThanOrEqual(200);
  });

  it('un P2010 de queryRaw con un valor largo entre acentos graves no deja el valor puesto', () => {
    const valor = 'Juan Perez '.repeat(30);
    const resumen = resumenInterno(
      errorDePrisma(
        'PrismaClientKnownRequestError',
        `Raw query failed. Code: \`22P02\`. Message: \`invalid input syntax for type integer: ${valor}\``,
        'P2010',
      ),
    );
    expect(resumen).toBe('PrismaClientKnownRequestError P2010 Raw query failed. Code: <texto>. Message:');
    expect(resumen).not.toContain('Juan');
  });

  it('una comilla sin cerrar en el mensaje de un error corriente corta ahí', () => {
    const e = new Error('Fecha inválida: "Juan Perez');
    e.stack = undefined;
    expect(resumenInterno(e)).toBe('Error: Fecha inválida:');
  });

  it('el mensaje de Prisma en una sola línea con el cuerpo pegado deja solo el modelo, la acción y el código', () => {
    const unaLinea =
      'Invalid `prisma.cotizacion.update()` invocation: { where: { id: 5 }, data: { email: "x@y.com", nombre: Juan, telefono: 2381234567, rfc: ABC010101AAA } }';
    expect(resumenInterno(errorDePrisma('PrismaClientValidationError', unaLinea))).toBe(
      'PrismaClientValidationError prisma.cotizacion.update',
    );
    const conCodigo = resumenInterno(errorDePrisma('PrismaClientKnownRequestError', unaLinea, 'P2025'));
    expect(conCodigo).toBe('PrismaClientKnownRequestError prisma.cotizacion.update P2025');
  });

  it('varios «campo: valor» pegados a «invocation:» sin llaves tampoco se conservan', () => {
    const resumen = resumenInterno(
      errorDePrisma(
        'PrismaClientValidationError',
        'Invalid `prisma.cotizacion.update()` invocation: where: id: 5, data: nombre: Zoe Perez, rfc: ABC010101AAA',
      ),
    );
    expect(resumen).toBe('PrismaClientValidationError prisma.cotizacion.update');
  });

  it('una causa corta pegada a «invocation:» se conserva', () => {
    const resumen = resumenInterno(
      errorDePrisma(
        'PrismaClientKnownRequestError',
        'Invalid `prisma.user.create()` invocation: Unique constraint failed on the fields: (`email`)',
        'P2002',
      ),
    );
    expect(resumen).toBe('PrismaClientKnownRequestError prisma.user.create P2002 Unique constraint failed on the fields: (<texto>)');
  });

  it('con el cuerpo en varias líneas sigue quedándose la causa del final', () => {
    const resumen = resumenInterno(errorDePrisma('PrismaClientValidationError', cuerpoConValores));
    expect(resumen).toBe('PrismaClientValidationError prisma.cotizacion.update Unknown argument <texto>. Available options are marked with ?.');
  });
});

describe('clasificarError', () => {
  it('un error de negocio con código propio llega con su estado, código y mensaje, y sin resumen interno', () => {
    const c = clasificarError(
      new ConflictException({ statusCode: 409, code: 'JORNADA_NO_ABIERTA', message: 'Registra tu entrada para empezar' }),
    );
    expect(c.status).toBe(409);
    expect(c.code).toBe('JORNADA_NO_ABIERTA');
    expect(c.errorCode).toBe('JORNADA_NO_ABIERTA');
    expect(c.message).toBe('Registra tu entrada para empezar');
    expect(c.mensajeRespuesta).toBe('Registra tu entrada para empezar');
    expect(c.interno).toBeUndefined();
  });

  it('un 422 que no es de Nest (HttpException con estado propio) conserva su estado', () => {
    const c = clasificarError(new HttpException({ code: 'MONTO_INVALIDO', message: 'El monto no es válido' }, 422));
    expect(c.status).toBe(422);
    expect(c.code).toBe('MONTO_INVALIDO');
  });

  it('si el mensaje es un arreglo, el cliente lo sigue recibiendo como arreglo y el resumen lo une con « | »', () => {
    const c = clasificarError(new BadRequestException(['El correo no es válido', 'Falta el nombre']));
    expect(c.status).toBe(400);
    expect(c.mensajeRespuesta).toEqual(['El correo no es válido', 'Falta el nombre']);
    expect(c.message).toBe('El correo no es válido | Falta el nombre');
    expect(c.code).toBeUndefined();
  });

  it('una excepción de Nest con texto simple', () => {
    const c = clasificarError(new NotFoundException('Actividad 7 no encontrada'));
    expect(c.status).toBe(404);
    expect(c.message).toBe('Actividad 7 no encontrada');
    expect(c.errorCode).toBe('Not Found');
  });

  it('PrismaClientValidationError es 400 INVALID_REQUEST y trae el resumen interno sin valores', () => {
    const c = clasificarError(
      errorDePrisma(
        'PrismaClientValidationError',
        'Invalid `prisma.cotizacion.update()` invocation:\n\n{\n  data: { email: "x@y.com" }\n}\n\nUnknown argument `nombre`.',
      ),
    );
    expect(c.status).toBe(HttpStatus.BAD_REQUEST);
    expect(c.errorCode).toBe('INVALID_REQUEST');
    expect(c.message).toBe('Parámetros de la petición inválidos');
    expect(c.interno).toContain('prisma.cotizacion.update');
    expect(c.interno).not.toContain('x@y.com');
    expect(c.interno).not.toMatch(/[{}@]/);
  });

  it('MulterError por tamaño es 413', () => {
    const c = clasificarError(new MulterError('LIMIT_FILE_SIZE'));
    expect(c.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(c.errorCode).toBe('FILE_TOO_LARGE');
    expect(c.interno).toContain('MulterError');
  });

  it('un TypeError es 500 con mensaje genérico, y su texto real queda solo en el resumen y los detalles', () => {
    const c = clasificarError(new TypeError("Cannot read properties of null (reading 'userId')"));
    expect(c.status).toBe(500);
    expect(c.message).toBe('Error interno del servidor');
    expect(c.errorCode).toBe('INTERNAL_ERROR');
    expect(c.interno).toContain('TypeError');
    expect(c.details.originalMessage).toContain('userId');
  });

  it('lo que no es un Error (un texto lanzado) es 500 con el mensaje genérico en inglés de siempre', () => {
    const c = clasificarError('algo raro');
    expect(c.status).toBe(500);
    expect(c.message).toBe('Internal server error');
    expect(c.details).toEqual({});
    expect(c.interno).toBe('Error: algo raro');
  });
});

// Lo que el cliente recibe no cambia con la extracción de `clasificarError`: web y apps leen
// `message` (texto o arreglo), `errorCode`, `code` y `suggestions`. Las expectativas son las del
// filtro anterior, comprobadas contra su código antes de moverlo.
describe('AllExceptionsFilter · la respuesta al cliente sigue idéntica', () => {
  function responder(excepcion: unknown, url = '/api/x') {
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json };
    const req = { url, method: 'POST', headers: {}, body: { password: 'p' }, query: {}, params: {} };
    const warn = jest.fn();
    const error = jest.fn();
    const filter = new AllExceptionsFilter({ warn, error, log: jest.fn() });
    filter.catch(excepcion, { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as any);
    return { estado: res.status.mock.calls[0]![0] as number, cuerpo: json.mock.calls[0]![0] as Record<string, unknown>, warn, error };
  }
  const marca = { timestamp: expect.any(String), path: '/api/x' };

  it('una excepción de Nest con texto', () => {
    const { estado, cuerpo } = responder(new NotFoundException('Actividad 7 no encontrada'));
    expect(estado).toBe(404);
    expect(cuerpo).toEqual({
      statusCode: 404,
      errorCode: 'Not Found',
      message: 'Actividad 7 no encontrada',
      suggestions: ['Revisa si el recurso existe o la URL es correcta.'],
      ...marca,
    });
  });

  it('la validación sigue mandando el mensaje como arreglo', () => {
    const { estado, cuerpo, warn } = responder(new BadRequestException(['El correo no es válido', 'Falta el nombre']));
    expect(estado).toBe(400);
    expect(cuerpo).toEqual({
      statusCode: 400,
      errorCode: 'Bad Request',
      message: ['El correo no es válido', 'Falta el nombre'],
      suggestions: ['Verifica los datos enviados.'],
      ...marca,
    });
    // El log también conserva el mensaje tal cual.
    expect(warn.mock.calls[0]![1].message).toEqual(['El correo no es válido', 'Falta el nombre']);
  });

  it('el error con código propio', () => {
    const { estado, cuerpo } = responder(
      new ConflictException({ statusCode: 409, code: 'JORNADA_NO_ABIERTA', message: 'Registra tu entrada' }),
    );
    expect(estado).toBe(409);
    expect(cuerpo).toEqual({
      statusCode: 409,
      errorCode: 'JORNADA_NO_ABIERTA',
      code: 'JORNADA_NO_ABIERTA',
      message: 'Registra tu entrada',
      suggestions: [],
      ...marca,
    });
  });

  it('Prisma de validación responde 400 genérico, sin la consulta', () => {
    const { estado, cuerpo } = responder(
      errorDePrisma('PrismaClientValidationError', 'Invalid `prisma.cotizacion.update()` invocation: { data: "x@y.com" }'),
    );
    expect(estado).toBe(400);
    expect(cuerpo).toEqual({
      statusCode: 400,
      errorCode: 'INVALID_REQUEST',
      message: 'Parámetros de la petición inválidos',
      suggestions: ['Verifica los datos enviados.'],
      ...marca,
    });
  });

  it('la subida demasiado grande responde 413', () => {
    const { estado, cuerpo } = responder(new MulterError('LIMIT_FILE_SIZE'));
    expect(estado).toBe(413);
    expect(cuerpo).toEqual({
      statusCode: 413,
      errorCode: 'FILE_TOO_LARGE',
      message: 'El archivo es demasiado grande.',
      suggestions: [],
      ...marca,
    });
  });

  it('un error no controlado responde 500 genérico, queda como error en el log y no filtra su texto', () => {
    const interno = new TypeError("Cannot read properties of null (reading 'userId')");
    interno.stack = 'TypeError: x\n    at foo';
    const { estado, cuerpo, error } = responder(interno);
    expect(estado).toBe(500);
    expect(cuerpo).toEqual({
      statusCode: 500,
      errorCode: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
      suggestions: ['Contacta al soporte técnico con el código de error.'],
      ...marca,
    });
    expect(JSON.stringify(cuerpo)).not.toContain('userId');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('algo que no es un Error responde 500 con el mensaje de siempre', () => {
    const { estado, cuerpo } = responder('algo raro');
    expect(estado).toBe(500);
    expect(cuerpo).toEqual({
      statusCode: 500,
      errorCode: 'INTERNAL_ERROR',
      message: 'Internal server error',
      suggestions: ['Contacta al soporte técnico con el código de error.'],
      ...marca,
    });
  });
});
