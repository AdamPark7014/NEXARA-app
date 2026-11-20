import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { esSuperAdmin, reglasActivas } from './visibilidad.js';

/** Lo agregado de toda la empresa (ejecutivo, BI con cotizaciones) solo para superadmin (quién ve qué). */
@Injectable()
export class SoloSuperAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    // Apagado (interruptor general): como antes, decide el permiso de la ruta.
    if (!reglasActivas()) return true;
    const user = ctx.switchToHttp().getRequest()?.user;
    if (!esSuperAdmin(user)) throw new ForbiddenException('Solo dirección general ve este resumen.');
    return true;
  }
}
