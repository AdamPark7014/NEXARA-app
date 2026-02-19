import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PERMISSIONS } from './permissions.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('No user in request');
    const isSuperAdmin = Boolean(user.isSuperAdmin);
    const canAdmin = isSuperAdmin || user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);
    if (!canAdmin) throw new ForbiddenException('No tienes permisos para esta acción');
    return true;
  }
}
