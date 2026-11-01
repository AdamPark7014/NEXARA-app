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
