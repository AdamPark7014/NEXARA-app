import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyService } from '../../company/company.service.js';
import { getClientIpFromRequestMeta } from '../security/security.utils.js';
import { EMPRESA_POR_CABECERA_SIN_SESION } from './current-company.decorator.js';
import { runWithTenantAsync } from './tenant-context.js';

/**
 * Resuelve la empresa activa desde `X-Company-Id` (o primaria) y la adjunta a `req.companyId`.
 * Valida membresía UserCompany excepto super_admin. Sin persona no hay membresía que validar, así que ahí la
 * cabecera no cuenta (ver `empresaSinPersona`).
 * Propaga el contexto vía AsyncLocalStorage para middleware Prisma fail-closed.
 *
 * Cast `as any` + require local rxjs evita conflicto de tipos por rxjs duplicado en monorepo
 * (mismo patrón que IdempotencyInterceptor).
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly companyService: CompanyService,
    private readonly reflector: Reflector,
  ) {}

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
      const cabecera = Number.isFinite(headerId) ? headerId : undefined;
      const userId = req.user?.id != null ? Number(req.user.id) : undefined;
      const isSuperAdmin = Boolean(req.user?.isSuperAdmin || req.user?.roleKey === 'super_admin');

      try {
        const company =
          userId && userId > 0
            ? await this.companyService.resolveForUser({ companyId: cabecera, userId, isSuperAdmin })
            : await this.companyService.resolve(this.empresaSinPersona(context, req, cabecera));
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

  /**
   * La empresa de quien no es una persona: una ruta sin guardia, donde no existe `req.user`, o un token de portal,
   * que trae `id: null`. `undefined` es la principal. La cabecera no cuenta: con ella, un cliente del portal leía los
   * borradores de otra empresa.
   */
  private empresaSinPersona(context: ExecutionContext, req: any, cabecera?: number): number | undefined {
    // Portales: la dice su token firmado.
    if (req.user?.isClient || req.user?.isBranchUser) {
      const delToken = Number(req.user.companyId);
      return Number.isFinite(delToken) && delToken > 0 ? delToken : undefined;
    }
    // SCIM con el secreto de la plataforma: elige empresa con la cabecera (`ScimController.companyIdFrom`).
    if (req.scimLegacyAuth) return cabecera;
    return this.reflector.get<boolean>(EMPRESA_POR_CABECERA_SIN_SESION, context.getHandler()) ? cabecera : undefined;
  }
}
