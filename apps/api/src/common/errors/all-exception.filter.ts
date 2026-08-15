import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';


@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: any) {}

  private isExpectedNoise404(pathname: string, method: string): boolean {
    if (method === 'POST' && pathname === '/') {
      return true;
    }

    return (
      pathname === '/' ||
      pathname === '/robots.txt' ||
      pathname === '/favicon.ico' ||
      pathname === '/appsettings.Production.json'
    );
  }

  private sanitizeValue(value: unknown): unknown {
    const sensitiveKeys = new Set([
      'password',
      'passwordHash',
      'token',
      'access_token',
      'refresh_token',
      'authorization',
    ]);

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item));
    }

    if (value && typeof value === 'object') {
      const source = value as Record<string, unknown>;
      const sanitized: Record<string, unknown> = {};
      for (const [key, current] of Object.entries(source)) {
        if (sensitiveKeys.has(key.toLowerCase())) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeValue(current);
        }
      }
      return sanitized;
    }

    return value;
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_ERROR';
    let details: any = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = (res as any).message || message;
        errorCode = (res as any).error || errorCode;
        details = res;
      }
    } else if (exception instanceof Error) {
      const mapped = mapPrismaError(exception);
      if (mapped) {
        status = mapped.status;
        message = mapped.message;
        errorCode = mapped.errorCode;
      } else {
        // Nunca se devuelve al cliente el mensaje interno de un error no
        // controlado: los de Prisma incluyen la forma de la consulta y los
        // nombres de las columnas. Se registra completo y se responde genérico.
        message = 'Error interno del servidor';
      }
      details = { originalMessage: exception.message, stack: exception.stack };
    }

    const payload = {
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      status,
      message,
      errorCode,
      details: this.sanitizeValue(details),
      user: (request as any).user || null,
      body: this.sanitizeValue(request.body),
      query: this.sanitizeValue(request.query),
      params: this.sanitizeValue(request.params),
    };

    // Keep expected public internet probes out of error-level noise.
    if (status === 404 && this.isExpectedNoise404(request.url, request.method)) {
      this.logger.warn('API Not Found (noise)', payload);
    } else {
      this.logger.error('API Exception', payload);
    }

    // Suggest possible solutions for common errors
    const suggestions = suggestErrorSolutions(status, errorCode, message, details);

    response.status(status).json({
      statusCode: status,
      errorCode,
      message,
      suggestions,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

/**
 * Traduce errores de Prisma a respuestas HTTP correctas.
 *
 * Sin esto, un parámetro de ruta no numérico (`/api/warehouse/abc`) llegaba al
 * motor como `NaN`, Prisma lanzaba un error de validación y el cliente recibía
 * un 500 con la forma completa de la consulta: tabla, columnas y tipos. Son 87
 * los puntos del código que convierten parámetros sin validar, así que se
 * resuelve aquí una sola vez en lugar de parchear cada uno.
 */
export function mapPrismaError(
  error: Error,
): { status: number; message: string; errorCode: string } | null {
  const name = error.constructor?.name ?? error.name;

  if (name === 'PrismaClientValidationError') {
    return {
      status: HttpStatus.BAD_REQUEST,
      message: 'Parámetros de la petición inválidos',
      errorCode: 'INVALID_REQUEST',
    };
  }

  if (name === 'PrismaClientKnownRequestError') {
    const code = (error as unknown as { code?: string }).code;
    switch (code) {
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Recurso no encontrado',
          errorCode: 'NOT_FOUND',
        };
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: 'Ya existe un registro con esos datos',
          errorCode: 'DUPLICATE',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Referencia inválida a otro registro',
          errorCode: 'INVALID_REFERENCE',
        };
      default:
        return null;
    }
  }

  return null;
}

function suggestErrorSolutions(status: number, _errorCode: string, message: string, details: any): string[] {
  // Add more rules as needed for your project
  const suggestions: string[] = [];
  if (status === 400) {
    suggestions.push('Verifica los datos enviados.');
    if (message.includes('required')) suggestions.push('Faltan campos obligatorios.');
  }
  if (status === 401 || status === 403) {
    suggestions.push('Revisa tus credenciales o permisos.');
  }
  if (status === 404) {
    suggestions.push('Revisa si el recurso existe o la URL es correcta.');
  }
  if (status === 409) {
    suggestions.push('Conflicto de datos. Verifica duplicados o integridad.');
  }
  if (status === 500) {
    suggestions.push('Contacta al soporte técnico con el código de error.');
    if (details && details.stack && details.stack.includes('Prisma')) {
      suggestions.push('Error de base de datos. Revisa la conexión y migraciones.');
    }
  }
  return suggestions;
}
