import { Injectable, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { PERMISSIONS } from './permissions';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { checkUrlAccess } from './rbac/url-matrix.js';
import { LEGACY_TO_V2, ROLES, type RoleKey } from './rbac/roles.v2.js';

export interface RbacOptions {
  permissions?: string[];
  anyPermissions?: string[];
  sameDepartment?: boolean;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * RbacGuard híbrido — combina RBAC v2 (url-matrix.ts) con el modelo legacy
 * basado en flags `acceso*` y permisos.
 *
 * Estrategia:
 *   1. Super admin → bypass total.
 *   2. Si user tiene `roleKey` v2 y la URL está EXPLÍCITAMENTE en `url-matrix`
 *      → respeta ese veredicto (allow/deny).
 *   3. Si url-matrix no contempla la URL para ese rol (regla no encontrada)
 *      → cae al modelo legacy (`@RBAC()` + permisos + flags).
 *   4. Si user NO tiene `roleKey` v2 → solo modelo legacy.
 *
 * Esto permite migración progresiva: cada vez que añades una URL al matrix
 * para un rol v2, el endpoint queda gobernado por v2. El resto sigue
 * funcionando con el modelo legacy hasta que termines de cubrir todo.
 */
@Injectable()
export class RbacGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger('RbacGuard');

  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;
    const request = context.switchToHttp().getRequest();
    const rbac: RbacOptions = this.reflector.get<RbacOptions>('rbac', context.getHandler()) || {};
    const user = request.user;
    if (!user) throw new ForbiddenException('No user in request');

    // 1) Superadmin bypass
    if (user.superadmin || user.isSuperAdmin || user.role === ROLES.SUPER_ADMIN) {
      return true;
    }

    // 2) Modelo RBAC v2 — si el rol y la URL están en la matriz, manda.
    const v2Role = this.resolveV2Role(user);
    if (v2Role) {
      const method = (request.method as HttpMethod) ?? 'GET';
      const url = request.originalUrl || request.url || '';
      const result = checkUrlAccess(v2Role, url, method);
      if (result.matchedRule) {
        // La matriz cubre esta URL → veredicto definitivo.
        if (!result.allowed) {
          this.logger.warn(`[v2 DENY] role=${v2Role} ${method} ${url}`);
          throw new ForbiddenException(`Tu rol (${v2Role}) no puede acceder a ${method} ${url}`);
        }
        (request as { rbac?: unknown }).rbac = {
          role: v2Role,
          scope: result.scope,
          rule: result.matchedRule,
          source: 'v2',
        };
        return true;
      }
      // Si la matriz NO cubre esta URL para este rol → no podemos negar
      // todavía (rompería endpoints no migrados). Pasamos al modelo legacy.
    }

    // 3) Modelo legacy — flags + permisos + decorator @RBAC
    const permissions: string[] = user.permissions || [];
    const isConsoleAdmin = Boolean(
      user.admin ||
      user.roleFlags?.accesoConsoleAdmin ||
      permissions.includes(PERMISSIONS.CONSOLE_ADMIN),
    );
    const isSalesUser = Boolean(
      user.vendedor ||
      user.roleFlags?.accesoPanelVentas ||
      permissions.includes(PERMISSIONS.PANEL_VENTAS),
    );
    const isConsoleUser = Boolean(
      user.ingeniero ||
      user.roleFlags?.accesoConsole ||
      permissions.includes(PERMISSIONS.CONSOLE_ACCESS),
    );

    if (rbac.permissions || rbac.anyPermissions) {
      if (rbac.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) && !isConsoleAdmin) {
        throw new ForbiddenException('Solo administradores pueden acceder');
      }
      if (rbac.permissions?.includes(PERMISSIONS.PANEL_VENTAS) && !isSalesUser) {
        throw new ForbiddenException('Solo vendedores pueden acceder');
      }
      if (rbac.permissions?.includes(PERMISSIONS.CONSOLE_ACCESS) && !isConsoleUser) {
        throw new ForbiddenException('Solo ingenieros pueden acceder');
      }
    }
    if (rbac.permissions && rbac.permissions.length > 0) {
      const hasAll = rbac.permissions.every((permission) => permissions.includes(permission));
      if (!hasAll) throw new ForbiddenException('No tienes permisos para esta acción');
    }
    if (rbac.anyPermissions && rbac.anyPermissions.length > 0) {
      const hasAny = rbac.anyPermissions.some((permission) => permissions.includes(permission));
      if (!hasAny) throw new ForbiddenException('No tienes permisos para esta acción');
    }
    if (rbac.sameDepartment && request.body && request.body.departamentoId) {
      if (user.departmentId !== request.body.departamentoId) {
        throw new ForbiddenException('Solo puedes gestionar tu propio departamento');
      }
    }
    (request as { rbac?: unknown }).rbac = { source: 'legacy' };
    return true;
  }

  /** Resuelve el rol v2 desde el user del JWT, soportando legacy. */
  private resolveV2Role(user: any): RoleKey | null {
    const validKeys = Object.values(ROLES) as string[];
    if (user.roleKey && validKeys.includes(user.roleKey)) {
      return user.roleKey as RoleKey;
    }
    if (user.role && validKeys.includes(user.role)) {
      return user.role as RoleKey;
    }
    if (user.orgRoleKey && LEGACY_TO_V2[user.orgRoleKey]) {
      return LEGACY_TO_V2[user.orgRoleKey];
    }
    return null;
  }
}

// Decorator for easy usage
import { SetMetadata } from '@nestjs/common';
export const RBAC = (options: RbacOptions) => SetMetadata('rbac', options);
