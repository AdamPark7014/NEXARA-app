import {
  Body,
  Controller,
  HttpStatus,
  type INestApplication,
  Module,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AllExceptionsFilter } from '../errors/all-exception.filter.js';
import { FileFieldsInterceptor, FileInterceptor, FilesInterceptor } from './interceptores-subida.js';

describe('limites de los campos de una subida, por HTTP con multer real', () => {
  const resumen = (cuerpo: Record<string, unknown>) => ({ campos: Object.keys(cuerpo) });

  @Controller('subidas')
  class SubidasController {
    @Post('uno')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 } }))
    uno(@UploadedFile() archivo: { size: number } | undefined, @Body() cuerpo: Record<string, unknown>) {
      return { ...resumen(cuerpo), tam: archivo?.size ?? null };
    }

    @Post('varios')
    @UseInterceptors(FilesInterceptor('files', 2))
    varios(@Body() cuerpo: Record<string, unknown>) {
      return resumen(cuerpo);
    }

    @Post('campos')
    @UseInterceptors(FileFieldsInterceptor([{ name: 'a', maxCount: 1 }]))
    campos(@Body() cuerpo: Record<string, unknown>) {
      return resumen(cuerpo);
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

  const enviar = async (ruta: string, campo: string) => {
    const forma = new FormData();
    forma.append(campo, '1');
    const respuesta = await fetch(`${base}/subidas/${ruta}`, { method: 'POST', body: forma });
    return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
  };

  it.each(['uno', 'varios', 'campos'])('rechaza un indice enorme con 400 en /%s', async (ruta) => {
    const { status, cuerpo } = await enviar(ruta, 'a[99999999]');
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(cuerpo['errorCode']).toBe('INVALID_UPLOAD');
  });

  it.each(['uno', 'varios', 'campos'])('rechaza un nombre demasiado anidado con 400 en /%s', async (ruta) => {
    const { status, cuerpo } = await enviar(ruta, `a${'[b]'.repeat(6)}`);
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(cuerpo['errorCode']).toBe('INVALID_UPLOAD');
  });

  it('deja pasar lo que esta justo en el tope', async () => {
    expect(await enviar('varios', 'a[1000]')).toEqual({ status: 201, cuerpo: { campos: ['a'] } });
    expect(await enviar('varios', `a${'[b]'.repeat(5)}`)).toEqual({ status: 201, cuerpo: { campos: ['a'] } });
  });

  it('respeta los limites propios de cada ruta', async () => {
    const forma = new FormData();
    forma.append('file', new Blob([Buffer.alloc(1025, 7)]), 'a.pdf');
    const respuesta = await fetch(`${base}/subidas/uno`, { method: 'POST', body: forma });
    expect(respuesta.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
  });
});

describe('toda subida de la API lleva los limites', () => {
  const src = path.resolve(__dirname, '../..');
  const fuentes: Array<{ ruta: string; texto: string }> = [];
  const recorrer = (carpeta: string) => {
    for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
      const ruta = path.join(carpeta, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (entrada.name.endsWith('.ts')) fuentes.push({ ruta, texto: fs.readFileSync(ruta, 'utf8') });
    }
  };
  recorrer(src);
  const relativa = (ruta: string) => path.relative(src, ruta).replace(/\\/g, '/');

  it('solo el envoltorio importa los interceptores de Nest', () => {
    const directos = fuentes
      .filter(({ texto }) => /Interceptor\b[^;]*from\s+['"]@nestjs\/platform-express['"]/.test(texto))
      .map(({ ruta }) => relativa(ruta));
    expect(directos).toEqual(['common/files/interceptores-subida.ts']);
  });

  it('quien arma multer a mano tambien los aplica', () => {
    const sinLimites = fuentes
      .filter(({ texto }) => /\bmulter\(/.test(texto) && !texto.includes('LIMITES_CAMPOS_SUBIDA'))
      .map(({ ruta }) => relativa(ruta));
    expect(sinLimites).toEqual([]);
  });
});
