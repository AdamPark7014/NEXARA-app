import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Restringe un endpoint al personal interno.
 *
 * `AuthGuard('jwt')` acepta **cualquier** token firmado, y los portales de
 * cliente y de sucursal emiten tokens con el mismo secreto (ver
 * `jwt.strategy.ts`: los payloads con `isClient` / `isBranchUser` se validan sin
 * lanzar). Por eso un controlador protegido solo con `AuthGuard` queda abierto a
 * los usuarios externos de los portales.
 *
 * Esta guarda es deliberadamente estrecha: no decide **qué** rol interno puede
 * hacer qué —eso es la matriz RBAC— sino únicamente que quien llama sea del
 * personal y no un cliente o una sucursal.
 */
@Injectable()
export class StaffOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    if (!user) {
      throw new ForbiddenException('Se requiere sesión de personal interno');
    }
    if (user.isClient || user.isBranchUser) {
      throw new ForbiddenException('Los portales externos no tienen acceso a este recurso');
    }
    // Los tokens de personal siempre llevan `sub` → `id`.
    if (user.id == null) {
      throw new ForbiddenException('Token sin identidad de personal interno');
    }

    return true;
  }
}
