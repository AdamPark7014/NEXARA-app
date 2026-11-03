import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../auth/auth.service';
import { FestivosController } from '../../festivos/festivos.controller';
import { RbacGuard } from '../rbac.guard';
import { ROLES, type RoleKey } from './roles.v2';
import { checkUrlAccess } from './url-matrix';

/**
 * «Mi día» de las apps pide `GET festivos/mio` a todo el personal. Si la matriz dice que no, la app
 * no enseña error: esa persona se queda sin el aviso del festivo y sin los próximos. Abrirlo no abre
 * el resto de `/api/festivos`.
 */
const PERSONAL = (Object.values(ROLES) as RoleKey[]).filter(
  (role) => role !== ROLES.CLIENTE && role !== ROLES.SUPER_ADMIN,
);

/** Permisos reales, con el mismo código que usa el login; sin levantar el módulo de Nest. */
function permisosDe(roleKey: RoleKey): string[] {
  const proto = AuthService.prototype as unknown as {
    resolveUserPermissions: (u: unknown, superAdmin: boolean) => string[];
  };
  return proto.resolveUserPermissions.call(proto, { email: 'persona@nexara.com.mx', roleKey }, false);
}

function contexto(roleKey: RoleKey): ExecutionContext {
  const user = { id: 7, email: 'persona@nexara.com.mx', roleKey, permissions: permisosDe(roleKey) };
  const url = '/api/festivos/mio';
  const request = { user, method: 'GET', originalUrl: url, url };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => FestivosController.prototype.mio,
  } as unknown as ExecutionContext;
}

describe('matriz: mis festivos en las apps', () => {
  it.each(PERSONAL)('%s llega a sus festivos', (role) => {
    expect(checkUrlAccess(role, '/api/festivos/mio', 'GET').allowed).toBe(true);
  });

  it('un cliente no llega a los festivos del equipo', () => {
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/festivos/mio', 'GET').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/festivos', 'GET').allowed).toBe(false);
  });

  it.each(PERSONAL)('%s solo lee: no escribe por esa ruta', (role) => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      expect(checkUrlAccess(role, '/api/festivos/mio', method).allowed).toBe(false);
    }
  });

  // Marcar y quitar son de dirección, por su correo (`puedeEditarFestivos`), y el listado trae a las
  // personas del equipo: esta regla no cambia ninguno de los dos.
  it.each(PERSONAL)('%s no gana marcar ni quitar un festivo', (role) => {
    expect(checkUrlAccess(role, '/api/festivos/2026-12-25', 'PUT').allowed).toBe(false);
    expect(checkUrlAccess(role, '/api/festivos/2026-12-25', 'DELETE').allowed).toBe(false);
  });

  it('el listado sigue siendo de quien ya lo leía', () => {
    const conListado = PERSONAL.filter((role) => checkUrlAccess(role, '/api/festivos', 'GET').allowed);
    expect(conListado).toEqual([ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN]);
  });
});

describe('guardia real: mis festivos', () => {
  beforeAll(() => {
    jest.spyOn(Object.getPrototypeOf(RbacGuard.prototype), 'canActivate').mockResolvedValue(true);
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });

  const guardia = () => new RbacGuard(new Reflector());

  // La matriz y `@RBAC` se suman: pasar la primera y topar con la segunda sería otro 403.
  it.each(PERSONAL)('%s pasa la matriz y los permisos de la ruta', async (role) => {
    await expect(guardia().canActivate(contexto(role))).resolves.toBe(true);
  });

  it('a un cliente lo detiene la guardia', async () => {
    await expect(guardia().canActivate(contexto(ROLES.CLIENTE))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
