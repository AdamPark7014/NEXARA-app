import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { esSuperAdmin } from './visibilidad.js';

/** Lo agregado de toda la empresa (ejecutivo, BI con cotizaciones) solo para superadmin (quién ve qué). */
@Injectable()
export class SoloSuperAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest()?.user;
    if (!esSuperAdmin(user)) throw new ForbiddenException('Solo dirección general ve este resumen.');
    return true;
  }
}
