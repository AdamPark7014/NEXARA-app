import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { VisibilidadService } from './visibilidad.service.js';

/**
 * Toda ruta de cotizaciones con `:id` (detalle, PDF, vista previa, versiones, participantes, costos de
 * hoy, PUT, enviar, revisar, aprobar, rechazar, refoliar, asignar, planos, paquetes, actividad, pedir
 * revisión… y las que se agreguen) responde 404 si quien pregunta no puede ver esa cotización.
 *
 * Es interceptor y no guarda porque la empresa activa (`req.companyId`) la pone el TenantInterceptor
 * global, que corre después de las guardas y antes de los interceptores del controlador.
 */
@Injectable()
export class CotizacionVisibleInterceptor implements NestInterceptor {
  constructor(private readonly visibilidad: VisibilidadService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    // `:id` en /cotizaciones; `:cotizacionId` en las rutas de smart-quote (pedidos CT).
    const crudo = req?.params?.id ?? req?.params?.cotizacionId;
    if (crudo == null) return next.handle();
    const id = Number(crudo);
    const companyId = req.companyId != null ? Number(req.companyId) : null;
    return from(this.visibilidad.assertCotizacionVisible(id, req.user, companyId)).pipe(switchMap(() => next.handle()));
  }
}
