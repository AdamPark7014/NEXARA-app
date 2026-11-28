import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { clasificarError } from '../common/errors/all-exception.filter.js';
import { esLlaveSecreta } from '../common/errors/mascara-log.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const SKIP_PREFIXES = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/register',
  '/api/portal/login',
  '/api/audit',
  '/health',
  '/auth/login',
  '/uploads',
  // Webhook de los terminales Hikvision (INTEGRA): ~56 mil POST al día sin usuario. Cada evento ya queda en
  // integra_push_events; auditarlos llenó 9.8 GB de audit_logs en un mes (y guardaba el token de la ruta).
  '/api/integra/hik/',
  // Cronómetro de procesos: una fila por cada alta medida; la tabla misma es el registro.
  '/api/proceso-tiempos',
];

/** ¿Esta ruta queda fuera de la auditoría de mutaciones? */
export function skipsMutationAudit(path: string): boolean {
  return SKIP_PREFIXES.some((p) => path.startsWith(p) || path.includes(p));
}

/**
 * El JSON `changes` de una fila de la bitácora de mutaciones. Un rechazo (`status: 'error'`) suma lo
 * que ya sabía el filtro de excepciones: `httpStatus` (422, 409, 500…), `codigo` (el `code` propio,
 * `JORNADA_NO_ABIERTA`…), `errorCode` y `interno` (qué falló y dónde, sin valores entre comillas
 * ni números). Para consultar: `(changes->>'httpStatus')::int`. Un éxito queda como siempre.
 * Nunca recibe el mensaje interno de Prisma: `error` es el mensaje que ve quien llamó.
 */
export function armarCambiosDeBitacora(input: {
  path: string;
  method: string;
  durationMs: number;
  status: 'ok' | 'error';
  httpStatus?: number;
  codigo?: string;
  errorCode?: string;
  error?: string;
  interno?: string;
  requestSanitizado?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const fallo = input.status === 'error';
  return {
    path: input.path,
    method: input.method,
    durationMs: input.durationMs,
    status: input.status,
    ...(input.error ? { error: String(input.error).slice(0, 300) } : {}),
    ...(fallo && input.httpStatus != null ? { httpStatus: input.httpStatus } : {}),
    ...(fallo && input.codigo ? { codigo: input.codigo } : {}),
    ...(fallo && input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(fallo && input.interno ? { interno: input.interno } : {}),
    ...(input.requestSanitizado ? { request: input.requestSanitizado } : {}),
  };
}

/**
 * Audit de mutaciones tras AuthGuard (tiene req.user).
 * Cast `as any` evita conflicto de tipos por rxjs duplicado en monorepo.
 */
@Injectable()
export class MutationAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): any {
    const req = context.switchToHttp().getRequest<any>();
    const method = String(req?.method || '').toUpperCase();
    if (!MUTATING.has(method)) return next.handle();

    const path = String(req?.originalUrl || req?.url || '').split('?')[0];
    if (skipsMutationAudit(path)) {
      return next.handle();
    }

    const userId = req?.user?.id ? Number(req.user.id) : undefined;
    const ipAddress = String(req?.headers?.['x-forwarded-for'] || req?.ip || '')
      .split(',')[0]
      ?.trim();
    const userAgent = req?.headers?.['user-agent']
      ? String(req.headers['user-agent']).slice(0, 500)
      : undefined;
    const started = Date.now();
    const requestBody = req?.body;

    // require local to Nest's rxjs copy
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tap } = require('rxjs/operators');

    return (next.handle() as any).pipe(
      tap({
        next: (body: unknown) => {
          void this.safeLog({
            method, path, userId, ipAddress, userAgent,
            status: 'ok',
            durationMs: Date.now() - started,
            body,
            requestBody,
          });
        },
        error: (err: any) => {
          // Lo mismo que le responde el filtro de excepciones: estado, código propio y mensaje que
          // ve quien llamó. Un error no controlado (Prisma, TypeError…) ya no guarda su texto interno.
          // La bitácora nunca cambia el error que recibe quien llamó: una excepción dentro de este callback
          // reemplazaría la del controlador, así que si clasificarla fallara (un `message` que lanza al leerse,
          // un arreglo de mensajes raro) se guarda el rechazo sin clasificar.
          let c: ReturnType<typeof clasificarError> | null = null;
          try {
            c = clasificarError(err);
          } catch {
            c = null;
          }
          void this.safeLog({
            method, path, userId, ipAddress, userAgent,
            status: 'error',
            durationMs: Date.now() - started,
            httpStatus: c?.status,
            codigo: c?.code,
            errorCode: c?.errorCode,
            error: c ? c.message : 'Error sin clasificar',
            interno: c?.interno,
            requestBody,
          });
        },
      }),
    );
  }

  private async safeLog(input: {
    method: string;
    path: string;
    userId?: number;
    ipAddress?: string;
    userAgent?: string;
    status: 'ok' | 'error';
    durationMs: number;
    body?: unknown;
    requestBody?: unknown;
    error?: string;
    httpStatus?: number;
    codigo?: string;
    errorCode?: string;
    interno?: string;
  }) {
    try {
      const entity = this.resolveEntity(input.path, input.body, input.requestBody);
      await this.audit.log(
        {
          entityType: entity.entityType,
          entityId: entity.entityId,
          action: `${input.method}_${input.status === 'ok' ? 'OK' : 'FAIL'}`,
          changes: armarCambiosDeBitacora({
            path: input.path,
            method: input.method,
            durationMs: input.durationMs,
            status: input.status,
            httpStatus: input.httpStatus,
            codigo: input.codigo,
            errorCode: input.errorCode,
            error: input.error,
            interno: input.interno,
            requestSanitizado: this.sanitizeBody(input.requestBody),
          }),
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
        input.userId,
      );
    } catch {
      // no bloquear
    }
  }

  private resolveEntity(
    path: string,
    body: unknown,
    requestBody: unknown,
  ): { entityType: string; entityId: number } {
    const segments = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const entityType =
      (segments[0] || 'Http').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'Http';
    const fromBody =
      this.pickId(body) ?? this.pickId(requestBody) ?? this.pickIdFromPath(segments);
    return { entityType, entityId: fromBody ?? 0 };
  }

  private pickId(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') return null;
    const obj = payload as Record<string, unknown>;
    for (const key of ['id', 'entityId', 'userId', 'invoiceId', 'activityId']) {
      const n = Number(obj[key]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }

  private pickIdFromPath(segments: string[]): number | null {
    for (const seg of segments) {
      if (/^\d+$/.test(seg)) return Number(seg);
    }
    return null;
  }

  private sanitizeBody(body: unknown): Record<string, unknown> | null {
    return sanitizarCuerpoParaBitacora(body);
  }
}

/**
 * Nombres exactos cuyo valor no se guarda en la bitácora (en minúsculas: se compara con `llave.toLowerCase()`).
 * Son los que por sí solos no dicen «secreto» (`code`, `pin`, `otp`, `confirm`...). Lo demás se reconoce por
 * el nombre con `esLlaveSecreta` (contiene `password`, `token`, `secret`...; empieza o termina en `rfc`,
 * `curp`, `nss`, `clabe`...), de modo que `portalPassword` o `counterpartyClabe` no dependen de estar aquí.
 */
const LLAVES_TACHADAS = new Set([
  'password', 'passwordhash', 'password_hash', 'newpassword', 'currentpassword', 'confirmpassword',
  'confirm', 'contrasena', 'token', 'access_token', 'refresh_token', 'refreshtoken', 'authorization',
  'cookie', 'secret', 'otp', 'mfacode', 'code', 'pickupcode', 'pin', 'apikey', 'api_key',
  // Datos personales y bancarios de altas de personal y clientes.
  'curp', 'rfc', 'nss', 'clabe',
]);

/** Coordenadas: la tabla de ubicaciones ya es el registro de dónde estuvo cada quien (21,702 filas las repetían). */
const LLAVES_UBICACION = new Set([
  'latitude', 'longitude', 'latitud', 'longitud', 'lat', 'lng', 'lon', 'accuracy',
]);

/** Fotos y archivos en línea: guardaban el inicio del base64 (200 caracteres de basura por fila). */
const LLAVES_ARCHIVO = new Set(['photourl', 'photobase64', 'fotobase64', 'foto']);

/**
 * Lo que de la petición queda en `changes.request` de la bitácora: solo valores sueltos (texto,
 * número, booleano, nulo); un objeto o arreglo anidado no se guarda. No se guardan contraseñas,
 * códigos, claves, tokens, CURP/RFC/NSS/CLABE, números de tarjeta o de cuenta (`[redacted]`; se
 * reconocen por el nombre de la llave: `portalPassword`, `counterpartyClabe`, `receptorRfc`...),
 * coordenadas (`[ubicación]`) ni fotos o cualquier texto que empiece con `data:` (`[archivo]`).
 * Un texto de más de 200 caracteres se corta.
 */
export function sanitizarCuerpoParaBitacora(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const src = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    const llave = k.toLowerCase();
    if (LLAVES_TACHADAS.has(llave) || esLlaveSecreta(k)) {
      out[k] = '[redacted]';
      continue;
    }
    if (LLAVES_UBICACION.has(llave)) {
      out[k] = '[ubicación]';
      continue;
    }
    if (LLAVES_ARCHIVO.has(llave) && typeof v === 'string' && v.length > 0) {
      out[k] = '[archivo]';
      continue;
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
      if (typeof v === 'string' && /^\s*data:/i.test(v.slice(0, 40))) {
        out[k] = '[archivo]';
      } else {
        out[k] = typeof v === 'string' && v.length > 200 ? `${v.slice(0, 200)}…` : v;
      }
    }
  }
  return Object.keys(out).length ? out : null;
}
