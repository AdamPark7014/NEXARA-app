/**
 * `GET studio/page-content` entrega las filas completas de la empresa, con el borrador y quién lo editó, y solo pedía
 * un token firmado: lo leían clientes y sucursales del portal, y cualquier persona sin permiso de Studio.
 * `:section/draft` entrega lo mismo de una sección y ya pedía más. `sections` es del mismo editor, y nadie más la usa.
 *
 * Corren `JwtStrategy`, `AuthService`, `RbacGuard` y la matriz de verdad, con las guardias que declara cada ruta. Lo
 * único fingido es la base y la firma del token.
 */
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] || 'secreto-de-prueba';

import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth/auth.service.js';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { RbacGuard } from '../common/rbac.guard.js';
import { ALL_ROLES, ROLES, type RoleKey } from '../common/rbac/roles.v2.js';
import { PageContentController } from './page-content.controller.js';

const BASE = '/api/studio/page-content';
const LISTA = { ruta: 'findAll', url: BASE };
const SECCIONES = { ruta: 'listSections', url: `${BASE}/sections` };
const BORRADOR = { ruta: 'findDraft', url: `${BASE}/page_home/draft` };

const ENTRAN: RoleKey[] = [ROLES.CEO, ROLES.DIR_ADMIN, ROLES.DIR_OPERACIONES, ROLES.LIDER_DISENO, ROLES.DISENADOR];
const NO_ENTRAN = ALL_ROLES.filter((rol) => !ENTRAN.includes(rol) && rol !== ROLES.SUPER_ADMIN);

const handler = (ruta: string) => (PageContentController.prototype as unknown as Record<string, () => unknown>)[ruta];
const guardias = (ruta: string): unknown[] => Reflect.getMetadata(GUARDS_METADATA, handler(ruta)) ?? [];

/** Pasa por las guardias que declara la ruta, como Nest. `AuthGuard('jwt')` solo revisa la firma, que aquí es buena. */
const responde = async (ruta: string, user: unknown, url: string) => {
  const request = { user, method: 'GET', originalUrl: url, url };
  const contexto = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler(ruta),
  } as unknown as ExecutionContext;
  try {
    for (const guardia of guardias(ruta)) {
      if (guardia === RbacGuard) await new RbacGuard(new Reflector()).canActivate(contexto);
    }
    return 'entra';
  } catch (error) {
    if (error instanceof ForbiddenException) return 'no entra';
    throw error;
  }
};

/** Lo que `JwtStrategy` deja en `req.user` para una fila de `users` y un token. */
const sesion = (fila: Record<string, unknown> | null, token: Record<string, unknown>) => {
  const prisma = { user: { findUnique: jest.fn(async () => fila) } };
  return new JwtStrategy(prisma as never, new AuthService(prisma as never, {} as never)).validate(token);
};

const persona = (roleKey: RoleKey | null, role: Record<string, unknown> | null = null, token = {}) =>
  sesion(
    { id: 7, email: 'persona@ejemplo.test', isActive: true, departmentId: 1, roleKey, role },
    { sub: 7, roleId: 1, ...token },
  );

const cliente = () => sesion(null, { isClient: true, clientId: 5, companyId: 1, portalKind: 'client' });
const sucursal = () => sesion(null, { isBranchUser: true, branchId: 6, clientId: 5, companyId: 1, portalKind: 'branch' });

describe('quién lee la lista completa de Studio', () => {
  beforeAll(() => {
    jest.spyOn(Object.getPrototypeOf(RbacGuard.prototype), 'canActivate').mockResolvedValue(true);
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe.each([
    ['la lista con borradores', LISTA],
    ['los nombres de sección', SECCIONES],
  ])('%s', (_, { ruta, url }) => {
    it('un cliente del portal no entra', async () => {
      await expect(responde(ruta, await cliente(), url)).resolves.toBe('no entra');
    });

    it('una sucursal del portal no entra', async () => {
      await expect(responde(ruta, await sucursal(), url)).resolves.toBe('no entra');
    });

    it.each(NO_ENTRAN)('%s, sin permiso de Studio, no entra', async (rol) => {
      await expect(responde(ruta, await persona(rol), url)).resolves.toBe('no entra');
    });

    it.each(ENTRAN)('%s entra', async (rol) => {
      await expect(responde(ruta, await persona(rol), url)).resolves.toBe('entra');
    });

    it('la plataforma entra', async () => {
      await expect(responde(ruta, await persona(ROLES.SUPER_ADMIN, null, { isSuperAdmin: true }), url)).resolves.toBe('entra');
    });

    it('un rol viejo entra con gestión web, y sin ella no', async () => {
      const conWeb = await persona(null, { nombre: 'Rol viejo', accesoGestionWeb: true });
      const sinWeb = await persona(null, { nombre: 'Rol viejo' });
      await expect(responde(ruta, conWeb, url)).resolves.toBe('entra');
      await expect(responde(ruta, sinWeb, url)).resolves.toBe('no entra');
    });

    it('ni el diagonal final ni un parámetro abren otra puerta', async () => {
      for (const variante of [`${url}/`, `${url}?x=1`]) {
        await expect(responde(ruta, await cliente(), variante)).resolves.toBe('no entra');
        await expect(responde(ruta, await persona(ROLES.VENDEDOR), variante)).resolves.toBe('no entra');
        await expect(responde(ruta, await persona(ROLES.DISENADOR), variante)).resolves.toBe('entra');
      }
    });

    it('pide lo mismo que el borrador de una sección', () => {
      expect(guardias(ruta)).toEqual(guardias(BORRADOR.ruta));
      expect(Reflect.getMetadata('rbac', handler(ruta))).toEqual(Reflect.getMetadata('rbac', handler(BORRADOR.ruta)));
    });
  });

  it.each(ALL_ROLES)('%s recibe la misma respuesta en las dos rutas y en el borrador', async (rol) => {
    const user = await persona(rol);
    const [lista, secciones, borrador] = await Promise.all(
      [LISTA, SECCIONES, BORRADOR].map(({ ruta, url }) => responde(ruta, user, url)),
    );
    expect({ lista, secciones }).toEqual({ lista: borrador, secciones: borrador });
  });

  it('el sitio público sigue sin pedir sesión', () => {
    for (const ruta of ['findOne', 'getMedia']) {
      expect(guardias(ruta)).toEqual([]);
      expect(Reflect.getMetadata('rbac', handler(ruta))).toBeUndefined();
    }
  });
});
