import {
  Controller,
  HttpStatus,
  type INestApplication,
  Module,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { FileInterceptor, FilesInterceptor } from '../files/interceptores-subida.js';
import { MulterError } from 'multer';
import { AllExceptionsFilter, mapMulterError, mapPrismaError } from './all-exception.filter.js';

/** Reproduce la forma de los errores de Prisma sin arrastrar su runtime. */
function prismaError(name: string, code?: string): Error {
  const err = new Error('Invalid `prisma.warehouse.findUnique()` invocation: ...');
  Object.defineProperty(err.constructor, 'name', { value: name, configurable: true });
  class Named extends Error {}
  Object.defineProperty(Named, 'name', { value: name });
  const typed = new Named('Invalid `prisma.warehouse.findUnique()` invocation: ...');
  if (code) (typed as unknown as { code: string }).code = code;
  return typed;
}

describe('mapPrismaError', () => {
  it('convierte un error de validacion en 400', () => {
    // El caso real: /api/warehouse/abc -> id NaN -> Prisma revienta.
    // Antes el cliente recibia 500 con la forma completa de la consulta.
    const mapped = mapPrismaError(prismaError('PrismaClientValidationError'));
    expect(mapped?.status).toBe(HttpStatus.BAD_REQUEST);
    expect(mapped?.errorCode).toBe('INVALID_REQUEST');
  });

  it('no filtra la consulta interna en el mensaje', () => {
    const mapped = mapPrismaError(prismaError('PrismaClientValidationError'));
    expect(mapped?.message).not.toMatch(/prisma\./);
    expect(mapped?.message).not.toMatch(/findUnique/);
    expect(mapped?.message).not.toMatch(/warehouse/i);
  });

  it('mapea registro no encontrado a 404', () => {
    expect(mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P2025'))?.status).toBe(
      HttpStatus.NOT_FOUND,
    );
  });

  it('mapea unicidad violada a 409', () => {
    const mapped = mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P2002'));
    expect(mapped?.status).toBe(HttpStatus.CONFLICT);
    expect(mapped?.errorCode).toBe('DUPLICATE');
  });

  it('mapea clave foranea invalida a 400', () => {
    expect(mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P2003'))?.status).toBe(
      HttpStatus.BAD_REQUEST,
    );
  });

  it('mapea un texto mas largo que la columna a 400 (titulo de actividad de mas de 200)', () => {
    const mapped = mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P2000'));
    expect(mapped?.status).toBe(HttpStatus.BAD_REQUEST);
    expect(mapped?.errorCode).toBe('VALUE_TOO_LONG');
  });

  it('mapea un conflicto de escritura concurrente a 409', () => {
    expect(mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P2034'))?.status).toBe(
      HttpStatus.CONFLICT,
    );
  });

  it('deja el choque y el texto largo en una frase y cita el texto viejo', () => {
    const viejoChoque = 'Otro cambio se guardó al mismo tiempo. Vuelve a intentarlo.';
    const viejoLargo = 'Uno de los textos es demasiado largo. Acórtalo e intenta de nuevo.';
    const choque = mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P2034'));
    const largo = mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P2000'));

    expect(choque?.message).toBe('Otro cambio se guardó al mismo tiempo: vuelve a intentarlo.');
    expect(choque?.message).not.toBe(viejoChoque);
    expect(choque?.errorCode).toBe('WRITE_CONFLICT');
    expect(choque?.status).toBe(HttpStatus.CONFLICT);

    expect(largo?.message).toBe('Uno de los textos es demasiado largo: acórtalo e intenta de nuevo.');
    expect(largo?.message).not.toBe(viejoLargo);
    expect(largo?.errorCode).toBe('VALUE_TOO_LONG');
    expect(largo?.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('deja pasar codigos de Prisma desconocidos', () => {
    // Sin mapeo conocido se trata como error interno: mejor un 500 generico
    // que inventar un codigo que no corresponde.
    expect(mapPrismaError(prismaError('PrismaClientKnownRequestError', 'P9999'))).toBeNull();
  });

  it('no toca errores ajenos a Prisma', () => {
    expect(mapPrismaError(new TypeError('algo se rompio'))).toBeNull();
    expect(mapPrismaError(new Error('generico'))).toBeNull();
  });
});

describe('mapMulterError', () => {
  it('mapea el archivo demasiado grande a 413', () => {
    expect(mapMulterError(new MulterError('LIMIT_FILE_SIZE'))?.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
  });

  it('mapea el archivo de mas o en otro campo a 400', () => {
    const mapped = mapMulterError(new MulterError('LIMIT_UNEXPECTED_FILE', 'files'));
    expect(mapped?.status).toBe(HttpStatus.BAD_REQUEST);
    expect(mapped?.errorCode).toBe('UNEXPECTED_FILE');
  });

  it('mapea los demas limites de la subida a 400', () => {
    expect(mapMulterError(new MulterError('LIMIT_FILE_COUNT'))?.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('deja como error interno el flujo roto y los errores ajenos a multer', () => {
    expect(mapMulterError(new MulterError('STREAM_DESTROYED' as never))).toBeNull();
    expect(mapMulterError(new Error('Unexpected field'))).toBeNull();
  });
});

// Sin simular nada: Nest, multer y el filtro por HTTP real. Nest reconoce los errores de multer por
// el texto, asi que un cambio de version de cualquiera de los dos solo se nota por aqui.
describe('subidas por HTTP con multer real', () => {
  @Controller('subidas')
  class SubidasController {
    @Post('uno')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 } }))
    uno(@UploadedFile() archivo: { size: number; buffer: Buffer }) {
      return { tam: archivo.size, leidos: archivo.buffer.length };
    }

    @Post('varios')
    @UseInterceptors(FilesInterceptor('files', 2))
    varios(@UploadedFiles() archivos: unknown[]) {
      return { total: archivos.length };
    }
  }

  @Module({
    controllers: [SubidasController],
    providers: [
      {
        provide: APP_FILTER,
        useFactory: () => new AllExceptionsFilter({ error: jest.fn(), warn: jest.fn() }),
      },
    ],
  })
  class SubidasModule {}

  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(SubidasModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  const subir = async (ruta: string, partes: Array<[campo: string, bytes: number]>) => {
    const forma = new FormData();
    partes.forEach(([campo, bytes]) => forma.append(campo, new Blob([Buffer.alloc(bytes, 7)]), 'a.pdf'));
    const respuesta = await fetch(`${base}/subidas/${ruta}`, { method: 'POST', body: forma });
    return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
  };

  it('acepta un archivo y lo entrega completo, incluso justo en el limite', async () => {
    expect(await subir('uno', [['file', 1024]])).toEqual({ status: 201, cuerpo: { tam: 1024, leidos: 1024 } });
  });

  it('responde 413 si el archivo pasa del limite', async () => {
    expect((await subir('uno', [['file', 1025]])).status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
  });

  it('responde 400, no 500, si el archivo llega en otro campo', async () => {
    const { status, cuerpo } = await subir('uno', [['otro', 10]]);
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(cuerpo['errorCode']).toBe('UNEXPECTED_FILE');
  });

  it('responde 400, no 500, si llegan mas archivos de los permitidos', async () => {
    expect(await subir('varios', [['files', 10], ['files', 10]])).toEqual({ status: 201, cuerpo: { total: 2 } });
    const { status, cuerpo } = await subir('varios', [['files', 10], ['files', 10], ['files', 10]]);
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(cuerpo['errorCode']).toBe('UNEXPECTED_FILE');
  });
});

describe('AllExceptionsFilter · nivel del log', () => {
  function host(url = '/api/page-content/seo_home') {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const req = { url, method: 'GET', headers: {}, body: {}, query: {}, params: {} };
    return {
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
    } as any;
  }

  it('un 4xx va como aviso y un 5xx como error', () => {
    const { NotFoundException } = jest.requireActual('@nestjs/common');
    const warn = jest.fn();
    const error = jest.fn();
    const filter = new AllExceptionsFilter({ warn, error, log: jest.fn() }) as any;
    filter.catch(new NotFoundException('Sección "seo_home" no tiene contenido publicado todavía.'), host());
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    filter.catch(new Error('falla real'), host('/api/x'));
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('AllExceptionsFilter · código propio del error', () => {
  function responder(excepcion: unknown) {
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json };
    const req = { url: '/api/tool-requests', method: 'POST', headers: {}, body: {}, query: {}, params: {} };
    const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as any;
    const filter = new AllExceptionsFilter({ warn: jest.fn(), error: jest.fn(), log: jest.fn() }) as any;
    filter.catch(excepcion, host);
    return json.mock.calls[0]![0] as Record<string, unknown>;
  }

  it('el candado de jornada llega con su código: web y apps lo buscan para mandar a checar', () => {
    const { ConflictException } = jest.requireActual('@nestjs/common');
    const cuerpo = responder(
      new ConflictException({
        statusCode: 409,
        code: 'JORNADA_NO_ABIERTA',
        message: 'Registra tu entrada para empezar a trabajar',
      }),
    );
    expect(cuerpo['statusCode']).toBe(409);
    expect(cuerpo['code']).toBe('JORNADA_NO_ABIERTA');
    expect(cuerpo['errorCode']).toBe('JORNADA_NO_ABIERTA');
    expect(cuerpo['message']).toBe('Registra tu entrada para empezar a trabajar');
    // Un consejo de «duplicados» junto a «registra tu entrada» confunde: ya trae su causa.
    expect(cuerpo['suggestions']).toEqual([]);
  });

  it('un conflicto sin código propio queda como antes', () => {
    const { ConflictException } = jest.requireActual('@nestjs/common');
    const cuerpo = responder(new ConflictException('Ya existe un registro con esos datos'));
    expect(cuerpo['code']).toBeUndefined();
    expect(cuerpo['errorCode']).toBe('Conflict');
    expect(cuerpo['suggestions']).toEqual(['Conflicto de datos. Verifica duplicados o integridad.']);
  });

  it('solo pasa códigos con forma de código, no cualquier texto ni objetos', () => {
    const { BadRequestException } = jest.requireActual('@nestjs/common');
    expect(responder(new BadRequestException({ message: 'x', code: { a: 1 } }))['code']).toBeUndefined();
    expect(responder(new BadRequestException({ message: 'x', code: 'select * from "User"' }))['code']).toBeUndefined();
  });
});

// Lo que el filtro ESCRIBE en el log no es lo que RESPONDE: el log no lleva datos personales ni tokens.
describe('AllExceptionsFilter · lo que se escribe en el log', () => {
  const HEX32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const JWT_DE_SESION = {
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
    accesos: ['finanzas'],
  };

  /** Un error con la forma de los de Prisma: su mensaje y su pila traen los valores que mandó la persona. */
  function errorDePrismaConValores(nombre: string, code: string | undefined, mensaje: string, marcos = 2): Error {
    class Nombrada extends Error {}
    Object.defineProperty(Nombrada, 'name', { value: nombre });
    const e = new Nombrada(mensaje);
    const pila = Array.from(
      { length: marcos },
      (_, i) => `    at PrismaService.operacion${i} (/app/apps/api/dist/cotizaciones/cotizaciones.service.js:${410 + i}:22)`,
    );
    e.stack = [`${nombre}: ${mensaje}`, ...pila].join('\n');
    if (code) (e as unknown as { code: string }).code = code;
    return e;
  }

  const MENSAJE_PRISMA = [
    'Invalid `prisma.cotizacion.update()` invocation:',
    '',
    '{',
    '  where: { id: 5 },',
    '  data: {',
    '    email: "maria@x.com",',
    '    nombre: "Maria",',
    '    ~~~~~~',
    '  }',
    '}',
    '',
    'Unknown argument `nombre`. Available options are marked with ?.',
  ].join('\n');

  type Opciones = { url?: string; method?: string; body?: unknown; query?: unknown; params?: unknown; user?: unknown; route?: unknown };

  function capturar(excepcion: unknown, opciones: Opciones = {}) {
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json };
    const req = {
      url: opciones.url ?? '/api/cotizaciones/5?q=maria',
      originalUrl: opciones.url ?? '/api/cotizaciones/5?q=maria',
      method: opciones.method ?? 'PATCH',
      headers: {},
      body: 'body' in opciones ? opciones.body : { email: 'maria@x.com', nombre: 'Maria', password: 'secreta123' },
      query: 'query' in opciones ? opciones.query : { q: 'maria' },
      params: 'params' in opciones ? opciones.params : { id: '5' },
      user: 'user' in opciones ? opciones.user : JWT_DE_SESION,
      ...('route' in opciones ? { route: opciones.route } : {}),
    };
    const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as any;
    const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    const filter = new AllExceptionsFilter(logger) as any;
    filter.catch(excepcion, host);
    const nivel = logger.error.mock.calls.length ? 'error' : 'warn';
    const [etiqueta, payload] = (logger[nivel].mock.calls[0] ?? []) as [string, Record<string, any>];
    return { etiqueta, payload, nivel, respuesta: json.mock.calls[0]![0] as Record<string, unknown>, logger, filter };
  }

  const LLAVES_ACTUALES = [
    'timestamp', 'path', 'method', 'status', 'message', 'errorCode', 'details', 'user', 'body', 'query', 'params',
  ];

  it('un 500 de Prisma no lleva ningún valor de la persona, y sí el modelo, la acción y las llaves de siempre', () => {
    const { payload, nivel, etiqueta } = capturar(errorDePrismaConValores('PrismaClientKnownRequestError', 'P9999', MENSAJE_PRISMA));
    expect(nivel).toBe('error');
    expect(etiqueta).toBe('API Exception');
    const texto = JSON.stringify(payload);
    expect(texto.toLowerCase()).not.toContain('maria');
    expect(texto).not.toContain('secreta123');
    expect(texto).not.toContain('nexara.com.mx');
    expect(texto).not.toContain('Invalid `prisma');
    expect(texto).toContain('prisma.cotizacion.update');
    expect(payload['status']).toBe(500);
    expect(Object.keys(payload)).toEqual(expect.arrayContaining([...LLAVES_ACTUALES, 'evento', 'ruta']));
    expect(payload['evento']).toBe('API Exception');
    expect(payload['details']['interno']).toContain('prisma.cotizacion.update');
    expect(payload['details']['interno']).toContain('P9999');
    expect(payload['details']).not.toHaveProperty('originalMessage');
  });

  it('un error de validación de Prisma (que responde 400) tampoco deja valores en el log', () => {
    const { payload, nivel } = capturar(errorDePrismaConValores('PrismaClientValidationError', undefined, MENSAJE_PRISMA));
    expect(nivel).toBe('warn');
    expect(payload['status']).toBe(400);
    const texto = JSON.stringify(payload);
    expect(texto.toLowerCase()).not.toContain('maria');
    expect(texto).toContain('prisma.cotizacion.update');
  });

  it('la pila del log trae solo líneas «at», sin el mensaje, y se corta a 12 líneas', () => {
    const { payload } = capturar(errorDePrismaConValores('PrismaClientKnownRequestError', 'P9999', MENSAJE_PRISMA, 40));
    const lineas = (payload['details']['stack'] as string).split('\n');
    expect(lineas).toHaveLength(12);
    expect(lineas.every((l) => l.startsWith('at '))).toBe(true);
    expect(lineas[0]).toContain('cotizaciones.service.js:410');
  });

  it('un error corriente conserva su resumen y su pila (12 líneas como máximo)', () => {
    const e = new TypeError("Cannot read properties of null (reading 'userId')");
    e.stack = "TypeError: Cannot read properties of null (reading 'userId')\n    at X.y (/app/apps/api/dist/me/foo.js:123:45)";
    const { payload } = capturar(e);
    expect(payload['details']['interno']).toBe('TypeError: Cannot read properties of null (<texto>) en foo.js:123');
    expect(payload['details']['stack']).toBe('at X.y (/app/apps/api/dist/me/foo.js:123:45)');
  });

  it('una línea que imita un marco «at» pero no termina como uno no pasa a la pila del log', () => {
    const e = new TypeError('malo');
    e.stack = [
      'TypeError: malo',
      '    at fake (maria@nexara.com)',
      '    at X.y (/app/apps/api/dist/me/foo.js:123:45)',
      '    at new Foo (<anonymous>)',
      '    at async Promise.all (index 0)',
      `    at ${'x'.repeat(1200)} (/app/a.js:1:1)`,
    ].join('\n');
    const { payload } = capturar(e);
    expect(payload['details']['stack']).toBe(
      ['at X.y (/app/apps/api/dist/me/foo.js:123:45)', 'at new Foo (<anonymous>)', 'at async Promise.all (index 0)'].join('\n'),
    );
  });

  it('un 403 con la sesión completa deja el usuario como {id, roleKey, isClient}', () => {
    const { ForbiddenException } = jest.requireActual('@nestjs/common');
    const { payload, nivel, etiqueta } = capturar(new ForbiddenException('No tienes permiso para ver esto'));
    expect(nivel).toBe('warn');
    expect(etiqueta).toBe('API Client Error');
    expect(payload['user']).toEqual({ id: 42, roleKey: 'tecnico', isClient: false });
    const texto = JSON.stringify(payload);
    expect(texto).not.toContain('maria.lopez');
    expect(texto).not.toContain('7f0c2b9e');
    expect(texto).not.toContain('modulo.accion');
  });

  it('sin sesión el usuario es null', () => {
    const { NotFoundException } = jest.requireActual('@nestjs/common');
    expect(capturar(new NotFoundException('x'), { user: undefined }).payload['user']).toBeNull();
  });

  it('el cuerpo y el query van como forma: dicen qué llegó, no los valores', () => {
    const { BadRequestException } = jest.requireActual('@nestjs/common');
    const { payload } = capturar(new BadRequestException('Falta algo'), {
      body: { email: 'maria@x.com', latitude: 19.04, longitude: -98.2, foto: 'data:image/jpeg;base64,' + 'A'.repeat(50000), activo: true },
      query: { q: 'maria', page: '2' },
    });
    expect(payload['body']).toEqual({ email: 's:11', latitude: 'n', longitude: 'n', foto: 's:50023', activo: 'b' });
    expect(payload['query']).toEqual({ q: 's:5', page: 's:1' });
    const texto = JSON.stringify(payload);
    expect(texto).not.toContain('maria');
    expect(texto).not.toContain('19.04');
    expect(texto).not.toContain('AAAA');
  });

  it('la ruta y los parámetros no llevan el token; la ruta patrón sí queda', () => {
    const { NotFoundException } = jest.requireActual('@nestjs/common');
    const { payload } = capturar(new NotFoundException('Enlace no encontrado'), {
      url: `/api/cotizaciones/public/${HEX32}/sign?token=zzz&estado=PENDIENTE&q=maria`,
      method: 'POST',
      params: { token: HEX32 },
      route: { path: '/api/cotizaciones/public/:token/sign' },
    });
    expect(payload['path']).toBe('/api/cotizaciones/public/<token>/sign?token=*&estado=PENDIENTE&q=*');
    expect(payload['params']).toEqual({ token: '<token>' });
    expect(payload['ruta']).toBe('/api/cotizaciones/public/:token/sign');
    expect(JSON.stringify(payload)).not.toContain(HEX32);
  });

  it('el evento queda en su propia llave porque `message` pisa la etiqueta del log', () => {
    const { NotFoundException } = jest.requireActual('@nestjs/common');
    const ruido = capturar(new NotFoundException('x'), { url: '/robots.txt', method: 'GET' });
    expect(ruido.etiqueta).toBe('API Not Found (noise)');
    expect(ruido.payload['evento']).toBe('API Not Found (noise)');
    const cliente = capturar(new NotFoundException('x'), { url: '/api/page-content/seo_home', method: 'GET' });
    expect(cliente.payload['evento']).toBe('API Client Error');
    expect(cliente.payload['ruta']).toBe('/api/page-content/seo_home');
    expect(capturar(new Error('falla real')).payload['evento']).toBe('API Exception');
  });

  it('los detalles de una HttpException salen sin llaves sensibles, sin correos y de hasta 500 caracteres', () => {
    const { BadRequestException } = jest.requireActual('@nestjs/common');
    const { payload } = capturar(
      new BadRequestException({
        message: 'No se pudo',
        code: 'DATOS_RAROS',
        password: 'secreta123',
        passwordHash: 'hash-secreto',
        nested: { newPassword: 'otra', refreshToken: 'rt-secreto' },
        correo: 'maria@x.com',
      }),
    );
    const detalles = payload['details'] as string;
    expect(typeof detalles).toBe('string');
    expect(detalles).toContain('DATOS_RAROS');
    expect(detalles).toContain('[REDACTED]');
    for (const secreto of ['secreta123', 'hash-secreto', 'otra', 'rt-secreto', 'maria@x.com']) {
      expect(detalles).not.toContain(secreto);
    }

    const largo = capturar(new BadRequestException({ message: 'x', lista: 'y'.repeat(5000) })).payload['details'] as string;
    expect(largo.length).toBeLessThanOrEqual(500);
  });

  it('un mensaje con una foto en base64 o un correo no pasa tal cual al log', () => {
    const { BadRequestException } = jest.requireActual('@nestjs/common');
    const { payload } = capturar(new BadRequestException('Foto inválida data:image/png;base64,' + 'B'.repeat(3000) + ' de maria@x.com'));
    expect(payload['message']).toBe('Foto inválida [archivo] de <correo>');
    // Una foto gigante: el mensaje se acota antes de buscarla y nunca sale ni un pedazo.
    const gigante = capturar(new BadRequestException('Foto inválida data:image/png;base64,' + 'B'.repeat(200000)));
    expect(gigante.payload['message']).toBe('Foto inválida [archivo]');
  });

  it('un cuerpo que no es un objeto (texto crudo, nada) no tumba el filtro', () => {
    const { NotFoundException } = jest.requireActual('@nestjs/common');
    const crudo = capturar(new NotFoundException('x'), { body: 'texto crudo con maria@x.com', query: undefined, params: undefined });
    expect(crudo.payload['body']).toBe('s:27');
    expect(crudo.payload['query']).toBeNull();
    expect(crudo.payload['params']).toEqual({});
    const circular: Record<string, unknown> = { a: 1 };
    circular['yo'] = circular;
    expect(() => capturar(new NotFoundException('x'), { body: circular })).not.toThrow();
  });
});

describe('AllExceptionsFilter · sanitizeValue', () => {
  const filter = new AllExceptionsFilter({ warn: jest.fn(), error: jest.fn() }) as any;

  it('tacha passwordHash y los demás camelCase que antes se escapaban por las mayúsculas', () => {
    expect(
      filter.sanitizeValue({
        passwordHash: 'x',
        refreshToken: 'y',
        nested: { newPassword: 'z' },
        lista: [{ currentPassword: 'a', confirmPassword: 'b', mfaCode: '123456', apiKey: 'k' }],
        OTP: '1',
        Pin: '2',
        Secret: '3',
        Cookie: '4',
      }),
    ).toEqual({
      passwordHash: '[REDACTED]',
      refreshToken: '[REDACTED]',
      nested: { newPassword: '[REDACTED]' },
      lista: [{ currentPassword: '[REDACTED]', confirmPassword: '[REDACTED]', mfaCode: '[REDACTED]', apiKey: '[REDACTED]' }],
      OTP: '[REDACTED]',
      Pin: '[REDACTED]',
      Secret: '[REDACTED]',
      Cookie: '[REDACTED]',
    });
  });

  it('tacha también por el nombre de la llave: portalPassword, counterpartyClabe, receptorRfc', () => {
    expect(
      filter.sanitizeValue({
        portalPassword: 'ClaveSucursal#1',
        counterpartyClabe: '012345678901234567',
        receptorRfc: 'XAXX010101000',
        cardNumber: '4111111111111111',
        webhookToken: 't',
        code: 'JORNADA_NO_ABIERTA',
        message: 'No se pudo',
        secretaria: 'Laura',
      }),
    ).toEqual({
      portalPassword: '[REDACTED]',
      counterpartyClabe: '[REDACTED]',
      receptorRfc: '[REDACTED]',
      cardNumber: '[REDACTED]',
      webhookToken: '[REDACTED]',
      // `code` es el código propio del error HTTP: no es un secreto y el log lo necesita.
      code: 'JORNADA_NO_ABIERTA',
      message: 'No se pudo',
      secretaria: 'Laura',
    });
  });

  it('sigue tachando lo que ya tachaba y deja pasar el resto', () => {
    expect(
      filter.sanitizeValue({ password: 'a', token: 'b', access_token: 'c', refresh_token: 'd', authorization: 'e', titulo: 'Visita' }),
    ).toEqual({
      password: '[REDACTED]',
      token: '[REDACTED]',
      access_token: '[REDACTED]',
      refresh_token: '[REDACTED]',
      authorization: '[REDACTED]',
      titulo: 'Visita',
    });
  });

  it('un objeto con un ciclo no revienta', () => {
    const a: Record<string, unknown> = { password: 'x' };
    a['yo'] = a;
    expect(() => filter.sanitizeValue(a)).not.toThrow();
  });
});

// El contrato HTTP no se toca: el log se recorta, la respuesta al cliente queda como estaba.
describe('AllExceptionsFilter · la respuesta al cliente no cambia', () => {
  function responder(excepcion: unknown, url = '/api/cotizaciones/5?q=maria&token=zzz') {
    const json = jest.fn();
    const status = jest.fn().mockReturnThis();
    const res = { status, json };
    const req = {
      url,
      originalUrl: url,
      method: 'PATCH',
      headers: {},
      body: { email: 'maria@x.com', password: 'secreta123' },
      query: { q: 'maria' },
      params: { id: '5' },
      user: { id: 42, email: 'maria.lopez@nexara.com.mx', roleKey: 'tecnico', jti: 'abc', permissions: ['a'] },
    };
    const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as any;
    new AllExceptionsFilter({ warn: jest.fn(), error: jest.fn() }).catch(excepcion, host);
    return { status: status.mock.calls[0]![0] as number, cuerpo: json.mock.calls[0]![0] as Record<string, unknown> };
  }

  function prismaConPila(nombre: string, code: string | undefined, mensaje: string): Error {
    class Nombrada extends Error {}
    Object.defineProperty(Nombrada, 'name', { value: nombre });
    const e = new Nombrada(mensaje);
    e.stack = `${nombre}: ${mensaje}\n    at PrismaService.operacion (/app/apps/api/dist/a.service.js:1:1)`;
    if (code) (e as unknown as { code: string }).code = code;
    return e;
  }

  const MARCA_DE_TIEMPO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

  it('una validación (400) responde el arreglo de mensajes tal cual, con la URL completa que mandó el cliente', () => {
    const { BadRequestException } = jest.requireActual('@nestjs/common');
    const { status, cuerpo } = responder(new BadRequestException(['email must be an email', 'nombre should not be empty']));
    expect(status).toBe(400);
    expect(cuerpo).toEqual({
      statusCode: 400,
      errorCode: 'Bad Request',
      message: ['email must be an email', 'nombre should not be empty'],
      suggestions: ['Verifica los datos enviados.'],
      timestamp: MARCA_DE_TIEMPO,
      path: '/api/cotizaciones/5?q=maria&token=zzz',
    });
  });

  it('un error de Prisma sin mapeo responde 500 genérico y conserva el consejo de base de datos', () => {
    const { status, cuerpo } = responder(prismaConPila('PrismaClientKnownRequestError', 'P9999', 'Invalid `prisma.x.y()` invocation: email "maria@x.com"'));
    expect(status).toBe(500);
    expect(cuerpo).toEqual({
      statusCode: 500,
      errorCode: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
      suggestions: [
        'Contacta al soporte técnico con el código de error.',
        'Error de base de datos. Revisa la conexión y migraciones.',
      ],
      timestamp: MARCA_DE_TIEMPO,
      path: '/api/cotizaciones/5?q=maria&token=zzz',
    });
    expect(JSON.stringify(cuerpo)).not.toContain('maria@x.com');
  });

  it('los errores mapeados de Prisma responden como siempre', () => {
    expect(responder(prismaConPila('PrismaClientKnownRequestError', 'P2002', 'x')).cuerpo).toEqual({
      statusCode: 409,
      errorCode: 'DUPLICATE',
      message: 'Ya existe un registro con esos datos',
      suggestions: ['Conflicto de datos. Verifica duplicados o integridad.'],
      timestamp: MARCA_DE_TIEMPO,
      path: '/api/cotizaciones/5?q=maria&token=zzz',
    });
    expect(responder(prismaConPila('PrismaClientValidationError', undefined, 'x')).cuerpo).toEqual({
      statusCode: 400,
      errorCode: 'INVALID_REQUEST',
      message: 'Parámetros de la petición inválidos',
      suggestions: ['Verifica los datos enviados.'],
      timestamp: MARCA_DE_TIEMPO,
      path: '/api/cotizaciones/5?q=maria&token=zzz',
    });
  });

  it('un error con código propio responde con su code y sin consejos', () => {
    const { ConflictException } = jest.requireActual('@nestjs/common');
    const { status, cuerpo } = responder(
      new ConflictException({ statusCode: 409, code: 'JORNADA_NO_ABIERTA', message: 'Registra tu entrada para empezar a trabajar' }),
      '/api/tool-requests',
    );
    expect(status).toBe(409);
    expect(cuerpo).toEqual({
      statusCode: 409,
      errorCode: 'JORNADA_NO_ABIERTA',
      code: 'JORNADA_NO_ABIERTA',
      message: 'Registra tu entrada para empezar a trabajar',
      suggestions: [],
      timestamp: MARCA_DE_TIEMPO,
      path: '/api/tool-requests',
    });
  });

  it('un 404 de negocio y un 403 responden igual que antes, sin las llaves nuevas del log', () => {
    const { NotFoundException, ForbiddenException } = jest.requireActual('@nestjs/common');
    const noEncontrado = responder(new NotFoundException('Actividad 7 no encontrada'), '/api/activities/7');
    expect(noEncontrado.cuerpo).toEqual({
      statusCode: 404,
      errorCode: 'Not Found',
      message: 'Actividad 7 no encontrada',
      suggestions: ['Revisa si el recurso existe o la URL es correcta.'],
      timestamp: MARCA_DE_TIEMPO,
      path: '/api/activities/7',
    });
    const prohibido = responder(new ForbiddenException('Sin permiso'), '/api/finanzas');
    expect(prohibido.cuerpo).toEqual({
      statusCode: 403,
      errorCode: 'Forbidden',
      message: 'Sin permiso',
      suggestions: ['Revisa tus credenciales o permisos.'],
      timestamp: MARCA_DE_TIEMPO,
      path: '/api/finanzas',
    });
    expect(noEncontrado.cuerpo).not.toHaveProperty('evento');
    expect(noEncontrado.cuerpo).not.toHaveProperty('ruta');
  });
});
