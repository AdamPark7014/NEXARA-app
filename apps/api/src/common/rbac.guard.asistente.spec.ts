import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RbacGuard } from './rbac.guard';
import { ROLES } from './rbac/roles.v2';

/** El guardia real con la matriz real; solo se finge la sesión y el conteo de gente a cargo. */
function contexto(user: Record<string, unknown>, method: string, url: string): ExecutionContext {
  const request = { user, method, originalUrl: url, url };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
  } as unknown as ExecutionContext;
}

function guardia(aCargo: number | null) {
  const reflector = { get: () => ({}) } as unknown as Reflector;
  const moduleRef =
    aCargo === null ? undefined : ({ get: () => ({ user: { count: async () => aCargo } }) } as never);
  return new RbacGuard(reflector, moduleRef);
}

const mando = { id: 8, email: 'mando@nexara.com.mx', roleKey: ROLES.ADMINISTRATIVO };
const INTERPRETAR = '/api/ai/asistente/interpretar';

describe('RbacGuard · «Asignar con IA» por gente a cargo', () => {
  beforeAll(() => {
    const padre = Object.getPrototypeOf(RbacGuard.prototype);
    jest.spyOn(padre, 'canActivate').mockResolvedValue(true);
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('Nest le inyecta el acceso a Prisma aunque el módulo no lo importe', async () => {
    const modulo = await Test.createTestingModule({ providers: [RbacGuard] }).compile();
    const guardiaDeNest = modulo.get(RbacGuard) as unknown as { moduleRef?: unknown };
    expect(guardiaDeNest.moduleRef).toBeDefined();
  });

  it('un rol sin el asistente en la matriz entra si tiene gente a cargo', async () => {
    await expect(guardia(3).canActivate(contexto(mando, 'POST', INTERPRETAR))).resolves.toBe(true);
    await expect(guardia(3).canActivate(contexto(mando, 'POST', '/api/ai/voz/transcribir'))).resolves.toBe(true);
  });

  it('sin gente a cargo no interpreta, pero sí puede preguntar si le toca', async () => {
    await expect(guardia(0).canActivate(contexto(mando, 'POST', INTERPRETAR))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guardia(0).canActivate(contexto(mando, 'GET', '/api/ai/asistente/estado'))).resolves.toBe(true);
  });

  it('tener gente a cargo no abre ninguna otra ruta', async () => {
    await expect(guardia(3).canActivate(contexto(mando, 'GET', '/api/account-access/x'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('si no puede revisar la jerarquía, niega', async () => {
    await expect(guardia(null).canActivate(contexto(mando, 'POST', INTERPRETAR))).rejects.toBeInstanceOf(ForbiddenException);
    const roto = new RbacGuard(
      { get: () => ({}) } as unknown as Reflector,
      { get: () => ({ user: { count: async () => { throw new Error('sin base'); } } }) } as never,
    );
    await expect(roto.canActivate(contexto(mando, 'POST', INTERPRETAR))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
