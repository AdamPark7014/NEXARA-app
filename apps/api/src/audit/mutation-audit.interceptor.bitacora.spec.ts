import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { throwError, of, lastValueFrom } from 'rxjs';
import { armarCambiosDeBitacora, MutationAuditInterceptor } from './mutation-audit.interceptor';

/** Un error con el nombre de clase de Prisma, sin arrastrar su runtime. */
function errorDePrisma(nombre: string, mensaje: string, code?: string): Error {
  class Nombrada extends Error {}
  Object.defineProperty(Nombrada, 'name', { value: nombre });
  const e = new Nombrada(mensaje);
  if (code) (e as unknown as { code: string }).code = code;
  return e;
}

const MENSAJE_PRISMA_CON_VALORES = [
  'Invalid `prisma.cotizacion.update()` invocation:',
  '',
  '{',
  '  where: { id: 5 },',
  '  data: {',
  '    email: "x@y.com",',
  '    nombre: "Zoe",',
  '    ~~~~~~',
  '  }',
  '}',
  '',
  'Unknown argument `nombre`. Available options are marked with ?.',
].join('\n');

describe('bitácora de mutaciones · armarCambiosDeBitacora', () => {
  const base = { path: '/api/tool-requests', method: 'POST', durationMs: 12 };

  it('un rechazo 422 con código propio guarda el estado HTTP, el código y el errorCode', () => {
    const cambios = armarCambiosDeBitacora({
      ...base,
      status: 'error',
      httpStatus: 422,
      codigo: 'JORNADA_NO_ABIERTA',
      errorCode: 'JORNADA_NO_ABIERTA',
      error: 'Registra tu entrada para empezar a trabajar',
    });
    expect(cambios).toEqual({
      path: '/api/tool-requests',
      method: 'POST',
      durationMs: 12,
      status: 'error',
      error: 'Registra tu entrada para empezar a trabajar',
      httpStatus: 422,
      codigo: 'JORNADA_NO_ABIERTA',
      errorCode: 'JORNADA_NO_ABIERTA',
    });
  });

  it('un éxito queda como siempre, sin estado HTTP ni códigos aunque se los pasen', () => {
    const cambios = armarCambiosDeBitacora({
      ...base,
      status: 'ok',
      httpStatus: 201,
      codigo: 'X_Y_Z',
      errorCode: 'Created',
      interno: 'algo',
      requestSanitizado: { nombre: 'Luis' },
    });
    expect(cambios).toEqual({
      path: '/api/tool-requests',
      method: 'POST',
      durationMs: 12,
      status: 'ok',
      request: { nombre: 'Luis' },
    });
    expect(cambios).not.toHaveProperty('httpStatus');
    expect(cambios).not.toHaveProperty('codigo');
  });

  it('sin código propio no inventa uno, y el error se recorta a 300 como antes', () => {
    const cambios = armarCambiosDeBitacora({
      ...base,
      status: 'error',
      httpStatus: 404,
      errorCode: 'Not Found',
      error: 'x'.repeat(500),
    });
    expect(cambios).not.toHaveProperty('codigo');
    expect(cambios).not.toHaveProperty('interno');
    expect((cambios['error'] as string).length).toBe(300);
    expect(cambios['httpStatus']).toBe(404);
  });

  it('un error no controlado guarda el resumen interno y no el texto de Prisma', () => {
    // Lo que hace el interceptor: clasifica y pasa el mensaje que vería quien llamó.
    const { clasificarError } = jest.requireActual('../common/errors/all-exception.filter.js');
    const c = clasificarError(errorDePrisma('PrismaClientValidationError', MENSAJE_PRISMA_CON_VALORES));
    const cambios = armarCambiosDeBitacora({
      ...base,
      status: 'error',
      httpStatus: c.status,
      codigo: c.code,
      errorCode: c.errorCode,
      error: c.message,
      interno: c.interno,
    });
    const texto = JSON.stringify(cambios);
    expect(cambios['httpStatus']).toBe(400);
    expect(cambios['errorCode']).toBe('INVALID_REQUEST');
    expect(cambios['error']).toBe('Parámetros de la petición inválidos');
    expect(cambios['interno']).toContain('prisma.cotizacion.update');
    expect(texto).not.toContain('x@y.com');
    expect(texto).not.toContain('Zoe');
    expect(texto).not.toContain('Invalid `prisma');
    expect(cambios['interno'] as string).not.toMatch(/[{}@]/);
  });
});

describe('bitácora de mutaciones · intercept con un rechazo real', () => {
  function armar() {
    const log = jest.fn().mockResolvedValue(undefined);
    const interceptor = new MutationAuditInterceptor({ log } as any);
    const contexto = (metodo = 'POST', url = '/api/tool-requests?x=1') =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ method: metodo, originalUrl: url, headers: {}, body: { nombre: 'Luis' }, user: { id: 9 } }),
        }),
      }) as any;
    return { log, interceptor, contexto };
  }

  const reposar = () => new Promise((listo) => setImmediate(listo));

  it('un 409 con código propio queda con su estado, su código y su mensaje', async () => {
    const { log, interceptor, contexto } = armar();
    const siguiente = {
      handle: () =>
        throwError(() => new ConflictException({ statusCode: 409, code: 'JORNADA_NO_ABIERTA', message: 'Registra tu entrada' })),
    };
    await expect(lastValueFrom(interceptor.intercept(contexto(), siguiente as any))).rejects.toBeInstanceOf(ConflictException);
    await reposar();
    expect(log).toHaveBeenCalledTimes(1);
    const [fila, userId] = log.mock.calls[0]!;
    expect(userId).toBe(9);
    expect(fila.action).toBe('POST_FAIL');
    expect(fila.changes).toMatchObject({
      path: '/api/tool-requests',
      status: 'error',
      httpStatus: 409,
      codigo: 'JORNADA_NO_ABIERTA',
      errorCode: 'JORNADA_NO_ABIERTA',
      error: 'Registra tu entrada',
      request: { nombre: 'Luis' },
    });
    expect(fila.changes).not.toHaveProperty('interno');
  });

  it('un error de Prisma queda como 400 con resumen interno y sin sus valores', async () => {
    const { log, interceptor, contexto } = armar();
    const siguiente = { handle: () => throwError(() => errorDePrisma('PrismaClientValidationError', MENSAJE_PRISMA_CON_VALORES)) };
    await expect(lastValueFrom(interceptor.intercept(contexto('PATCH', '/api/cotizaciones/5'), siguiente as any))).rejects.toThrow();
    await reposar();
    const fila = log.mock.calls[0]![0];
    expect(fila.action).toBe('PATCH_FAIL');
    expect(fila.changes.httpStatus).toBe(400);
    expect(fila.changes.error).toBe('Parámetros de la petición inválidos');
    expect(fila.changes.interno).toContain('prisma.cotizacion.update');
    const texto = JSON.stringify(fila.changes);
    expect(texto).not.toContain('x@y.com');
    expect(texto).not.toContain('Zoe');
  });

  it('un 404 de negocio y un error de código no se ven igual: el 500 trae su resumen', async () => {
    const { log, interceptor, contexto } = armar();
    await expect(
      lastValueFrom(interceptor.intercept(contexto(), { handle: () => throwError(() => new NotFoundException('Actividad 7 no encontrada')) } as any)),
    ).rejects.toThrow();
    const nulo = new TypeError("Cannot read properties of null (reading 'userId')");
    nulo.stack = "TypeError: Cannot read properties of null (reading 'userId')\n    at X.y (/app/apps/api/dist/me/foo.js:123:45)";
    await expect(lastValueFrom(interceptor.intercept(contexto(), { handle: () => throwError(() => nulo) } as any))).rejects.toThrow();
    await reposar();
    const [negocio, codigo] = log.mock.calls.map((c) => c[0].changes);
    expect(negocio.httpStatus).toBe(404);
    expect(negocio).not.toHaveProperty('interno');
    expect(codigo.httpStatus).toBe(500);
    expect(codigo.error).toBe('Error interno del servidor');
    expect(codigo.interno).toBe('TypeError: Cannot read properties of null (<texto>) en foo.js:123');
  });

  it('una petición que sale bien no suma estado HTTP', async () => {
    const { log, interceptor, contexto } = armar();
    await lastValueFrom(interceptor.intercept(contexto(), { handle: () => of({ id: 3 }) } as any));
    await reposar();
    const fila = log.mock.calls[0]![0];
    expect(fila.action).toBe('POST_OK');
    expect(fila.entityId).toBe(3);
    expect(fila.changes).not.toHaveProperty('httpStatus');
    expect(fila.changes.status).toBe('ok');
  });

  it('una lectura (GET) no se audita', () => {
    const { log, interceptor, contexto } = armar();
    const siguiente = { handle: jest.fn(() => of(1)) };
    interceptor.intercept(contexto('GET'), siguiente as any);
    expect(siguiente.handle).toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});

describe('bitácora de mutaciones · la bitácora nunca cambia el error de quien llamó', () => {
  it('si clasificar el error lanza, quien llamó recibe el error original y la fila queda sin clasificar', async () => {
    const log = jest.fn().mockResolvedValue(undefined);
    const interceptor = new MutationAuditInterceptor({ log } as any);
    const contexto = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', originalUrl: '/api/tool-requests', headers: {}, body: {}, user: { id: 9 } }),
      }),
    } as any;
    // Un arreglo de mensajes con un objeto sin prototipo: `String(m)` lanza «Cannot convert object to primitive value».
    const raro = new BadRequestException({ statusCode: 400, message: [Object.create(null)], error: 'Bad Request' });

    await expect(
      lastValueFrom(interceptor.intercept(contexto, { handle: () => throwError(() => raro) } as any)),
    ).rejects.toBe(raro);
    await new Promise((listo) => setImmediate(listo));

    expect(log).toHaveBeenCalledTimes(1);
    const fila = log.mock.calls[0]![0];
    expect(fila.action).toBe('POST_FAIL');
    expect(fila.changes).toMatchObject({ status: 'error', error: 'Error sin clasificar' });
    expect(fila.changes).not.toHaveProperty('httpStatus');
  });
});
