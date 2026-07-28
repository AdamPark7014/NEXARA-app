import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import { CompanyService } from '../../company/company.service.js';
import { runWithTenantAsync } from './tenant-context.js';

/**
 * Resuelve la empresa activa desde `X-Company-Id` (o primaria) y la adjunta a `req.companyId`.
 * Valida membresía UserCompany excepto super_admin.
 * Propaga el contexto vía AsyncLocalStorage para middleware Prisma fail-closed.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly companyService: CompanyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest();

    // Si ApiKeyAuthGuard ya resolvió empresa, no sobrescribir — sí propagar ALS.
    if (req.apiKeyId && req.companyId != null) {
      const companyId = Number(req.companyId);
      return from(
        runWithTenantAsync({ companyId, bypass: false }, () => lastValueFrom(next.handle())),
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
    return from(
      runWithTenantAsync({ companyId, bypass: false }, () => lastValueFrom(next.handle())),
    );
  }
}
