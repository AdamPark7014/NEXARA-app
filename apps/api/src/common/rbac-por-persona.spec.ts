import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from './rbac.guard';
import { PERMISSIONS } from './permissions';

/**
 * Iván es de campo y opera el almacén y las herramientas por persona, sin cambiarle el rol. Las rutas
 * que escriben pasan por `RbacGuard`, y solo `UrlAccessGuard` conocía esa excepción: le daba 403.
 */
describe('RbacGuard: almacén y herramientas por persona', () => {
  const IVAN = 'administracion.ventas@nexara.com.mx';
  const TODOS = [
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.STOCK_MANAGE,
    PERMISSIONS.WAREHOUSE_MANAGE,
    PERMISSIONS.CATALOG_MANAGE,
    PERMISSIONS.TOOLS_VIEW,
    PERMISSIONS.TOOLS_MANAGE,
  ];

  const pasa = async (
    email: string,
    method: string,
    url: string,
    opciones: { permissions?: string[]; rbac?: string[] } = {},
  ) => {
    Object.getPrototypeOf(RbacGuard.prototype).canActivate = async () => true;
    const handler = () => undefined;
    Reflect.defineMetadata('rbac', opciones.rbac ? { permissions: opciones.rbac } : {}, handler);
    const guard = new RbacGuard(new Reflector());
    const req = {
      user: { id: 10, email, roleKey: 'ing_campo', permissions: opciones.permissions ?? TODOS },
      method,
      originalUrl: url,
      url,
      body: {},
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
      getClass: () => class {},
    };
    return guard.canActivate(ctx as never);
  };

  it.each([
    ['GET', '/api/stock/levels'],
    ['POST', '/api/stock/movements'],
    ['POST', '/api/stock/movements/por-codigo'],
    ['POST', '/api/stock/products/por-codigo'],
    ['PATCH', '/api/stock/levels/1'],
    ['POST', '/api/warehouse'],
    ['POST', '/api/catalog/products'],
    ['PUT', '/api/tool-requests/inventory/1'],
    ['PUT', '/api/tool-requests/kits/1/inspeccion-programada'],
  ])('Iván sí: %s %s', async (metodo, url) => {
    await expect(pasa(IVAN, metodo, url)).resolves.toBe(true);
  });

  it.each([
    ['DELETE', '/api/stock/1'],
    ['DELETE', '/api/tool-requests/1'],
    ['GET', '/api/users'],
    ['POST', '/api/employee-payments'],
  ])('Iván no: %s %s', async (metodo, url) => {
    await expect(pasa(IVAN, metodo, url)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['GET', '/api/stock/levels'],
    ['POST', '/api/stock/movements'],
    ['POST', '/api/catalog/products'],
    ['PUT', '/api/tool-requests/inventory/1'],
  ])('otro de campo sigue sin poder: %s %s', async (metodo, url) => {
    await expect(pasa('instalador@example.com', metodo, url)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el permiso del endpoint se sigue exigiendo aunque la ruta se abra', async () => {
    await expect(
      pasa(IVAN, 'POST', '/api/stock/movements', { permissions: [], rbac: [PERMISSIONS.STOCK_MANAGE] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      pasa(IVAN, 'POST', '/api/stock/movements', { rbac: [PERMISSIONS.STOCK_MANAGE] }),
    ).resolves.toBe(true);
  });
});
