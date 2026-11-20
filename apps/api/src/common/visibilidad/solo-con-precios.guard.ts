import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { puedeVerPrecios, reglasActivas } from './visibilidad.js';

/**
 * Para rutas que escriben directo a la respuesta (PDF, Excel) y no pasan por el filtro de montos:
 * con el interruptor prendido, sin «Ver precios» no se generan. Apagado, deja pasar a todos.
 */
@Injectable()
export class SoloConPreciosGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!reglasActivas()) return true;
    const user = context.switchToHttp().getRequest()?.user;
    if (puedeVerPrecios(user)) return true;
    throw new ForbiddenException('Este reporte lleva montos y tu perfil no tiene «Ver precios»');
  }
}
