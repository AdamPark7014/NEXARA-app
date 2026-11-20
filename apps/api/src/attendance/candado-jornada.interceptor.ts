import { CallHandler, ConflictException, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CODIGO_JORNADA_NO_ABIERTA, MENSAJE_JORNADA_NO_ABIERTA, pideJornadaAbierta } from './candado-jornada.js';

/**
 * Candado «sin entrada no se trabaja». Corre después de los guards (ya hay `req.user`) y antes del
 * controlador: una escritura de alguien que debe checar y no tiene jornada abierta se rechaza con 409
 * y el código `JORNADA_NO_ABIERTA`, que web y apps usan para mandar a la persona a checar.
 *
 * La jornada abierta puede ser de ayer: un turno de noche sigue abierto pasada la medianoche.
 */
@Injectable()
export class JornadaAbiertaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(JornadaAbiertaInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const usuario = req?.user;
    if (!pideJornadaAbierta({ metodo: req?.method, url: req?.originalUrl ?? req?.url, usuario })) {
      return next.handle();
    }

    let abierta = true;
    try {
      const dia = await this.prisma.attendanceDay.findFirst({
        where: { userId: Number(usuario.id), isOpen: true },
        select: { id: true },
      });
      abierta = Boolean(dia);
    } catch (error) {
      // Si no se puede consultar la jornada, no se le impide trabajar a nadie por una falla nuestra.
      this.logger.warn(`No se pudo revisar la jornada de ${usuario.id}: ${String(error)}`);
    }
    if (!abierta) {
      this.logger.log(`Sin jornada abierta: usuario ${usuario.id} intentó ${req.method} ${req.originalUrl ?? req.url}`);
      throw new ConflictException({
        statusCode: 409,
        code: CODIGO_JORNADA_NO_ABIERTA,
        message: MENSAJE_JORNADA_NO_ABIERTA,
      });
    }
    return next.handle();
  }
}
