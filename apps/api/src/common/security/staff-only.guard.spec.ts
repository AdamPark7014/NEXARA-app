import { ForbiddenException } from '@nestjs/common';
import { StaffOnlyGuard } from './staff-only.guard.js';

const contextWith = (user: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

describe('StaffOnlyGuard', () => {
  const guard = new StaffOnlyGuard();

  it('deja pasar al personal interno', () => {
    expect(guard.canActivate(contextWith({ id: 4, permissions: [] }))).toBe(true);
  });

  it('bloquea a los usuarios del portal de cliente', () => {
    // AuthGuard('jwt') los acepta porque el token va firmado con el mismo
    // secreto: sin esta guarda, un cliente externo podría editar el sitio.
    expect(() =>
      guard.canActivate(contextWith({ id: null, isClient: true, clientId: 9 })),
    ).toThrow(ForbiddenException);
  });

  it('bloquea a los usuarios del portal de sucursal', () => {
    expect(() =>
      guard.canActivate(contextWith({ id: null, isBranchUser: true, branchId: 3 })),
    ).toThrow(ForbiddenException);
  });

  it('bloquea cuando no hay usuario en la petición', () => {
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });

  it('bloquea un token de personal sin identidad', () => {
    expect(() => guard.canActivate(contextWith({ permissions: [] }))).toThrow(ForbiddenException);
  });

  it('no juzga el rol: eso es tarea de la matriz RBAC', () => {
    // Un técnico de campo pasa esta guarda; limitar qué puede hacer es
    // responsabilidad de RbacGuard, no de aquí.
    expect(guard.canActivate(contextWith({ id: 12, roleKey: 'ing_soporte' }))).toBe(true);
  });
});
