import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class BranchPortalGuard extends AuthGuard('jwt') implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;
    const request = context.switchToHttp().getRequest();
    if (!request.user?.isBranchUser || !request.user?.branchId) {
      throw new ForbiddenException('Acceso exclusivo para sucursales');
    }
    return true;
  }
}
