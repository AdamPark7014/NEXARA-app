import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from './permissions.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('No user in request');
    // Nueva lógica de roles principales
    const isSuperAdmin = Boolean(user.superadmin || user.isSuperAdmin);
    const isAdmin = Boolean(user.admin && !isSuperAdmin);
    const isIngeniero = Boolean(user.ingeniero && !isSuperAdmin && !isAdmin);
    const isVendedor = Boolean(user.vendedor && !isSuperAdmin && !isAdmin && !isIngeniero);

    // Solo superadmin y admin pueden pasar este guard
    if (!isSuperAdmin && !isAdmin) throw new ForbiddenException('No tienes permisos para esta acción');
    return true;
  }
}
