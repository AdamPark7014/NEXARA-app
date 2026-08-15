import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { CompanyService } from '../../company/company.service.js';
import { getClientIpFromRequestMeta } from '../security/security.utils.js';
import { runWithTenantAsync } from './tenant-context.js';

/**
 * Resuelve la empresa activa desde `X-Company-Id` (o primaria) y la adjunta a `req.companyId`.
 * Valida membresía UserCompany excepto super_admin.
 * Propaga el contexto vía AsyncLocalStorage para middleware Prisma fail-closed.
 *
 * Cast `as any` + require local rxjs evita conflicto de tipos por rxjs duplicado en monorepo
 * (mismo patrón que IdempotencyInterceptor).
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly companyService: CompanyService) {}

  intercept(context: ExecutionContext, next: CallHandler): any {
    const req = context.switchToHttp().getRequest();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { from } = require('rxjs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { lastValueFrom } = require('rxjs');

    const run = async () => {
      // El autor viaja en el contexto para que el middleware de auditoría de
      // Prisma pueda sellar `AuditLog.userId` sin tocar cada servicio.
      const authorId =
        req.user?.id != null && Number.isFinite(Number(req.user.id)) && Number(req.user.id) > 0
          ? Number(req.user.id)
          : null;

      // Origen de la petición para las columnas homónimas de AuditLog. Se
      // recortan a la longitud de columna (45 / 500) para que un user-agent
      // largo no tumbe el INSERT de auditoría.
      const rawUserAgent = req.headers?.['user-agent'];
      const requestMeta = {
        ipAddress: getClientIpFromRequestMeta(req.headers?.['x-forwarded-for'], req.ip).slice(0, 45),
        userAgent: typeof rawUserAgent === 'string' ? rawUserAgent.slice(0, 500) : null,
      };

      // Si ApiKeyAuthGuard ya resolvió empresa, no sobrescribir — sí propagar ALS.
      if (req.apiKeyId && req.companyId != null) {
        const companyId = Number(req.companyId);
        return runWithTenantAsync(
          { companyId, bypass: false, userId: authorId, ...requestMeta },
          () => lastValueFrom(next.handle()),
        );
      }

      const raw = req.headers?.['x-company-id'] ?? req.headers?.['X-Company-Id'];
      const headerId = raw != null && String(raw).trim() !== '' ? Number(raw) : undefined;
      const userId = req.user?.id != null ? Number(req.user.id) : undefined;
      const isSuperAdmin = Boolean(req.user?.isSuperAdmin || req.user?.roleKey === 'super_admin');

      try {
        const company = await this.companyService.resolveForUser({
          companyId: Number.isFinite(headerId) ? headerId : undefined,
          userId: userId && userId > 0 ? userId : undefined,
          isSuperAdmin,
        });
        req.companyId = company?.id ?? null;
        req.company = company ?? null;
      } catch (err) {
        if (err instanceof ForbiddenException) throw err;
        req.companyId = null;
        req.company = null;
      }

      const companyId =
        req.companyId != null && Number.isFinite(Number(req.companyId))
          ? Number(req.companyId)
          : null;

      // Super-admin without explicit company still must not auto-leak; they pick a tenant.
      return runWithTenantAsync(
        { companyId, bypass: false, userId: authorId, ...requestMeta },
        () => lastValueFrom(next.handle()),
      );
    };

    return from(run());
  }
}
