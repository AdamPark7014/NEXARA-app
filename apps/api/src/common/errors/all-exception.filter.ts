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
      message = exception.message;
      details = { stack: exception.stack };
    }

    // Log error with context
    this.logger.error('API Exception', {
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
    });

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
