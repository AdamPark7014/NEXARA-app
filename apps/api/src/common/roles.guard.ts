import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
// import { Reflector } from '@nestjs/core'; // Removed unused import

@Injectable()
export class RolesGuard implements CanActivate {
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('No user in request');
    // Example: Only allow CEO and Supervisor
    if (user.nivelAutoridad < 50) {
      throw new ForbiddenException('No tienes permisos para esta acción');
    }
    return true;
  }
}
