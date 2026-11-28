/**
 * Ayudante de PRUEBAS: corre un bloque de `it(...)` contra un Postgres de verdad y DESECHABLE. Sin
 * `NEXARA_PRUEBAS_URL` el bloque entero se salta (así corre limpio en CI y en cualquier laptop sin base).
 *
 *   NEXARA_PRUEBAS_URL=postgresql://postgres@127.0.0.1:55481/nexara_molde npx jest --runInBand src/common/piloto
 *
 * La URL apunta a una base YA MIGRADA (`prisma migrate deploy`) que solo sirve de molde: antes de cada prueba se clona
 * con `CREATE DATABASE … TEMPLATE molde` y después de cada prueba se borra. El molde nunca se escribe.
 * Se niega a trabajar si el anfitrión no es exactamente 127.0.0.1 (un `?host=` en la URL manda sobre el anfitrión) o
 * si en el molde ya entró alguien (`User.lastLoginAt`), que sería señal de que es una base de uso real vista por túnel.
 *
 * Patrón extraído de `common/seeds/seed-seguro.base.spec.ts`, que sigue con el suyo (`SEED_PRUEBAS_URL`).
 *
 * Cómo levantar el molde sin pisar a otra sesión: puerto libre (`netstat -ano | findstr :PUERTO`), `initdb` y
 * `pg_ctl start -l archivo` propios, y confirmar `psql -Atc "show data_directory"` ANTES del primer `createdb`.
 *
 * Este archivo es del repo pero no del producto: nadie lo importa fuera de pruebas (`*.spec.ts`).
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

/** La base molde ya migrada. Sin ella, todo bloque `conBaseDesechable` se salta. */
export const URL_BASE_MOLDE = process.env.NEXARA_PRUEBAS_URL;

/** Lo que recibe el bloque: se llena antes de cada prueba y se vacía después. Solo se lee dentro de `it`/hooks. */
export type BaseDesechable = {
  /** Cliente plano de Prisma (sin el middleware de empresa de `PrismaService`) conectado a la copia de esta prueba. */
  readonly prisma: PrismaClient;
  /** URL de la copia de esta prueba. */
  readonly url: string;
  /** Nombre de la copia de esta prueba. */
  readonly nombre: string;
};

function analizar(url: string): { host: string; nombre: string; u: URL } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('NEXARA_PRUEBAS_URL no es una URL.');
  }
  // `?host=` gana en Postgres sobre el anfitrión de la URL: si viene, es el que cuenta.
  const host = u.searchParams.get('host') || u.hostname;
  const nombre = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!nombre) throw new Error('NEXARA_PRUEBAS_URL no dice a qué base se conecta.');
  return { host, nombre, u };
}

const conNombreDeBase = (u: URL, nombre: string): string => {
  const copia = new URL(u.toString());
  copia.pathname = `/${nombre}`;
  return copia.toString();
};

const abrir = (url: string) => new PrismaClient({ datasources: { db: { url } }, log: [], errorFormat: 'minimal' });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Se comprueba una sola vez por proceso: anfitrión local y molde sin uso real. */
let molde: Promise<{ nombre: string; u: URL }> | null = null;
function comprobarMolde(url: string): Promise<{ nombre: string; u: URL }> {
  molde ??= (async () => {
    const { host, nombre, u } = analizar(url);
    if (host !== '127.0.0.1') throw new Error('NEXARA_PRUEBAS_URL tiene que apuntar a 127.0.0.1');
    const cliente = abrir(url);
    try {
      if (await cliente.user.count({ where: { lastLoginAt: { not: null } } })) {
        throw new Error('El molde no es desechable: ya hay cuentas que iniciaron sesión.');
      }
    } finally {
      // CREATE DATABASE … TEMPLATE exige que nadie más esté conectado al molde.
      await cliente.$disconnect();
    }
    return { nombre, u };
  })();
  return molde;
}

/**
 * `describe` contra una copia nueva del molde por cada prueba. Dentro de `definir` se usa `base.prisma`:
 *
 *   conBaseDesechable('mi servicio contra Postgres', (base) => {
 *     it('hace algo', async () => {
 *       await base.prisma.companyProfile.create({ data: { ... } });
 *     });
 *   });
 */
export function conBaseDesechable(titulo: string, definir: (base: BaseDesechable) => void): void {
  // Ojo: el cuerpo de un `describe.skip` también se ejecuta, y `jest.setTimeout` vale para TODO el archivo. Por eso el
  // plazo largo (crear la copia tarda) solo se pide cuando hay base; sin ella las pruebas en memoria conservan sus 5 s.
  if (URL_BASE_MOLDE) jest.setTimeout(120_000);
  (URL_BASE_MOLDE ? describe : describe.skip)(titulo, () => {
    let admin: PrismaClient | undefined;
    let prisma: PrismaClient | undefined;
    let url = '';
    let nombre = '';

    const base: BaseDesechable = {
      get prisma() {
        if (!prisma) throw new Error('La base desechable solo existe dentro de una prueba.');
        return prisma;
      },
      get url() {
        return url;
      },
      get nombre() {
        return nombre;
      },
    };

    beforeAll(async () => {
      const { u } = await comprobarMolde(URL_BASE_MOLDE as string);
      admin = abrir(conNombreDeBase(u, 'postgres'));
    });
    afterAll(async () => {
      await admin?.$disconnect();
      admin = undefined;
    });

    beforeEach(async () => {
      const { nombre: nombreMolde, u } = await comprobarMolde(URL_BASE_MOLDE as string);
      nombre = `nexara_prueba_${randomBytes(6).toString('hex')}`;
      // Dos archivos de prueba en paralelo pueden pedir copias a la vez: si el molde está ocupado un instante, se reintenta.
      for (let intento = 1; ; intento++) {
        try {
          await (admin as PrismaClient).$executeRawUnsafe(`create database "${nombre}" template "${nombreMolde}"`);
          break;
        } catch (error) {
          if (intento >= 8 || !/being accessed by other users/i.test(String((error as Error)?.message))) throw error;
          await esperar(250 * intento);
        }
      }
      url = conNombreDeBase(u, nombre);
      prisma = abrir(url);
    });
    afterEach(async () => {
      await prisma?.$disconnect();
      prisma = undefined;
      if (nombre) await admin?.$executeRawUnsafe(`drop database if exists "${nombre}" with (force)`);
      nombre = '';
      url = '';
    });

    definir(base);
  });
}
