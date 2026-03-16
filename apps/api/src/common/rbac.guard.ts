import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from './permissions';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

export interface RbacOptions {
  permissions?: string[];
  anyPermissions?: string[];
  sameDepartment?: boolean;
}

@Injectable()
export class RbacGuard extends AuthGuard('jwt') {
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
    // Superadmin acceso total
    if (user.superadmin || user.isSuperAdmin) return true;

    // Lógica de exclusión por rol principal
    if (rbac.permissions || rbac.anyPermissions) {
      // Si el endpoint requiere permisos de admin, ingeniero o vendedor, validar el rol principal
      if (rbac.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) && !user.admin) {
        throw new ForbiddenException('Solo administradores pueden acceder');
      }
      if (rbac.permissions?.includes(PERMISSIONS.PANEL_VENTAS) && !user.vendedor) {
        throw new ForbiddenException('Solo vendedores pueden acceder');
      }
      if (rbac.permissions?.includes(PERMISSIONS.CONSOLE_ACCESS) && !user.ingeniero) {
        throw new ForbiddenException('Solo ingenieros pueden acceder');
      }
    }
    const permissions: string[] = user.permissions || [];
    if (rbac.permissions && rbac.permissions.length > 0) {
      const hasAll = rbac.permissions.every((permission) => permissions.includes(permission));
      if (!hasAll) throw new ForbiddenException('No tienes permisos para esta acción');
    }
    if (rbac.anyPermissions && rbac.anyPermissions.length > 0) {
      const hasAny = rbac.anyPermissions.some((permission) => permissions.includes(permission));
      if (!hasAny) throw new ForbiddenException('No tienes permisos para esta acción');
    }
    // Check sameDepartment
    if (rbac.sameDepartment && request.body && request.body.departamentoId) {
      if (user.departmentId !== request.body.departamentoId) {
        throw new ForbiddenException('Solo puedes gestionar tu propio departamento');
      }
    }
    return true;
  }
}

// Decorator for easy usage
import { SetMetadata } from '@nestjs/common';
export const RBAC = (options: RbacOptions) => SetMetadata('rbac', options);
