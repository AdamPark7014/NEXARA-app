import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { AuditService } from './audit.service.js';

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
];

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
    if (SKIP_PREFIXES.some((p) => path.startsWith(p) || path.includes(p))) {
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
          void this.safeLog({
            method, path, userId, ipAddress, userAgent,
            status: 'error',
            durationMs: Date.now() - started,
            error: err?.message || String(err),
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
  }) {
    try {
      const entity = this.resolveEntity(input.path, input.body, input.requestBody);
      await this.audit.log(
        {
          entityType: entity.entityType,
          entityId: entity.entityId,
          action: `${input.method}_${input.status === 'ok' ? 'OK' : 'FAIL'}`,
          changes: {
            path: input.path,
            method: input.method,
            durationMs: input.durationMs,
            status: input.status,
            ...(input.error ? { error: String(input.error).slice(0, 300) } : {}),
            ...(this.sanitizeBody(input.requestBody)
              ? { request: this.sanitizeBody(input.requestBody) }
              : {}),
          },
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const src = body as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const redact = new Set([
      'password', 'passwordHash', 'newPassword', 'confirm', 'token',
      'access_token', 'refreshToken', 'secret', 'otp', 'mfaCode',
    ]);
    for (const [k, v] of Object.entries(src)) {
      if (redact.has(k)) {
        out[k] = '[redacted]';
        continue;
      }
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
        out[k] = typeof v === 'string' && v.length > 200 ? `${v.slice(0, 200)}…` : v;
      }
    }
    return Object.keys(out).length ? out : null;
  }
}
