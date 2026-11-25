import { CallHandler, ConflictException, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CODIGO_JORNADA_NO_ABIERTA, MENSAJE_JORNADA_NO_ABIERTA, pideJornadaAbierta, rutaNormalizada } from './candado-jornada.js';

/**
 * Candado «sin entrada no se trabaja». Corre después de los guards (ya hay `req.user`) y antes del
 * controlador: una escritura de alguien que debe checar y no tiene jornada abierta se rechaza con 409
 * y el código `JORNADA_NO_ABIERTA`, que web y apps usan para mandar a la persona a checar.
 *
 * La jornada abierta puede ser de ayer: un turno de noche sigue abierto pasada la medianoche.
 *
 * Evidencia sin señal: si la foto trae su hora de captura y cae dentro de una jornada ya cerrada, se
 * acepta aunque llegue después de la salida. Cada rechazo queda en la bitácora.
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
    if (!abierta) abierta = await this.capturadaDentroDeJornada(Number(usuario.id), req);
    if (!abierta) {
      await this.auditarRechazo(usuario, req);
      this.logger.log(`Sin jornada abierta: usuario ${usuario.id} intentó ${req.method} ${req.originalUrl ?? req.url}`);
      throw new ConflictException({
        statusCode: 409,
        code: CODIGO_JORNADA_NO_ABIERTA,
        message: MENSAJE_JORNADA_NO_ABIERTA,
      });
    }
    return next.handle();
  }

  /**
   * Se mira en las checadas y no en `AttendanceDay`: al cerrar la jornada su `lastEntryAt` queda en
   * null, así que ahí ya no se sabe a qué hora entró. Sin una salida posterior a la captura no se acepta.
   * Solo evidencias: la hora la manda el teléfono y no debe abrir el resto de la plataforma.
   */
  private async capturadaDentroDeJornada(
    userId: number,
    req: { method?: string; originalUrl?: string; url?: string; body?: unknown },
  ): Promise<boolean> {
    const ruta = rutaNormalizada(req.originalUrl ?? req.url);
    if (req.method !== 'POST' || !ruta.startsWith('activity-evidence/')) return false;
    const body = req.body as { clientCapturedAt?: unknown; capturedAt?: unknown } | undefined;
    const valor = body?.clientCapturedAt || body?.capturedAt;
    if (typeof valor !== 'string') return false;
    const captura = new Date(valor);
    if (Number.isNaN(captura.getTime()) || captura.getTime() > Date.now()) return false;

    try {
      const entrada = await this.prisma.attendance.findFirst({
        where: { userId, type: 'entrada', timestamp: { lte: captura } },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });
      if (!entrada) return false;
      const salida = await this.prisma.attendance.findFirst({
        where: { userId, type: 'salida', timestamp: { gte: entrada.timestamp } },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true },
      });
      return Boolean(salida && salida.timestamp >= captura);
    } catch (error) {
      this.logger.warn(`No se pudo revisar la captura sin señal de ${userId}: ${String(error)}`);
      return false;
    }
  }

  /** Nunca impide contestar el 409: si la bitácora falla solo se avisa en el log. */
  private async auditarRechazo(
    usuario: { id: number; companyId?: number | null },
    req: { method?: string; originalUrl?: string; url?: string; companyId?: number | null },
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: CODIGO_JORNADA_NO_ABIERTA,
          entityType: 'AttendanceDay',
          entityId: Number(usuario.id),
          userId: Number(usuario.id),
          companyId: Number(usuario.companyId ?? req.companyId) || null,
          changes: {
            metodo: req.method ?? '',
            ruta: rutaNormalizada(req.originalUrl ?? req.url),
          },
        },
      });
    } catch (error) {
      this.logger.warn(`No se pudo auditar el rechazo de ${usuario.id}: ${String(error)}`);
    }
  }
}
