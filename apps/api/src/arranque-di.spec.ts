/**
 * Guardiana de arranque: arma el AppModule completo y comprueba que Nest resuelve TODAS las dependencias.
 *
 * Las pruebas de cada módulo usan proveedores simulados, así que un proveedor que falta en `imports` o `providers`
 * pasa todas las pruebas y aun así tumba la API al arrancar en producción. Esta prueba solo compila el grafo
 * (constructores); no llama a `init()`, así que no conecta a la base, a Redis ni abre puertos.
 */
import { Test, TestingModule } from '@nestjs/testing';

jest.setTimeout(180_000);

const ENTORNO_MINIMO: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://prueba:prueba@127.0.0.1:59999/prueba',
  JWT_SECRET: 'solo-para-la-prueba-de-arranque-0123456789abcdef',
  JWT_REFRESH_SECRET: 'solo-para-la-prueba-de-arranque-fedcba9876543210',
  PULSO_LATIDO: '0',
};

describe('arranque de la API', () => {
  const previo: Record<string, string | undefined> = {};
  let modulo: TestingModule | undefined;

  beforeAll(() => {
    for (const [clave, valor] of Object.entries(ENTORNO_MINIMO)) {
      previo[clave] = process.env[clave];
      if (!process.env[clave]) process.env[clave] = valor;
    }
  });

  afterAll(async () => {
    await modulo?.close().catch(() => undefined);
    for (const [clave, valor] of Object.entries(previo)) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
  });

  it('Nest resuelve todas las dependencias del AppModule', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppModule } = require('./app.module');
    modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(modulo).toBeDefined();
  });
});
