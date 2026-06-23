import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class ClientPortalGuard extends AuthGuard('jwt') implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;
    const request = context.switchToHttp().getRequest();
    if (!request.user?.isClient || !request.user?.clientId) {
      throw new ForbiddenException('Acceso exclusivo para clientes');
    }
    return true;
  }
}
