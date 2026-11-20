import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, map, Observable, switchMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { limpiarEntradaSinPrecios, ocultarContratos, ocultarMontos } from './montos.js';
import { esSuperAdmin, puedeVerPrecios, reglasActivas, type Actor } from './visibilidad.js';

/** Marca un controlador o ruta de Contabilidad: ahí la contadora sí ve montos (decisión 2 de la matriz). */
export const MONTOS_PARA_CONTADORA = 'visibilidad:montosParaContadora';
export const MontosParaContadora = () => SetMetadata(MONTOS_PARA_CONTADORA, true);

const RE_CONTADORA = /\bcontador(a|\(a\))?\b|\bcontabilidad\b/i;

/**
 * Entrega 2 · montos. Con el interruptor prendido y sin «Ver precios», la respuesta sale con los montos
 * en `null` y `montosOcultos: true`. Apagado, no toca nada ni consulta la base.
 */
@Injectable()
export class OcultarMontosInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!reglasActivas()) return next.handle();
    const req = context.switchToHttp().getRequest();
    const actor: Actor | undefined = req?.user;
    if (puedeVerPrecios(actor)) return next.handle();
    const paraContadora = this.reflector.getAllAndOverride<boolean>(MONTOS_PARA_CONTADORA, [
      context.getHandler(),
      context.getClass(),
    ]);
    return from(paraContadora ? this.esContadora(actor, req?.user?.roleKey) : Promise.resolve(false)).pipe(
      switchMap((exenta) => {
        if (exenta) return next.handle();
        if (!['GET', 'HEAD'].includes(String(req?.method ?? 'GET').toUpperCase())) limpiarEntradaSinPrecios(req?.body);
        const respuesta = next.handle();
        return respuesta.pipe(map((v) => ocultarMontos(ocultarContratos(v))));
      }),
    );
  }

  /** El puesto no viene en el token; es lo que distingue a la contadora (igual que en Costos). */
  private async esContadora(actor: Actor | undefined, roleKey?: string | null): Promise<boolean> {
    if (!actor?.id || esSuperAdmin(actor)) return Boolean(actor?.id);
    if (roleKey === 'contabilidad') return true;
    const fila = await this.prisma.user
      .findUnique({ where: { id: Number(actor.id) }, select: { puesto: true } })
      .catch(() => null);
    return RE_CONTADORA.test(String(fila?.puesto ?? ''));
  }
}
