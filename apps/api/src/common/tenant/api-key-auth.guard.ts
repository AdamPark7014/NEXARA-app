import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CompanyApiKeysService } from '../../company/company-api-keys.service.js';

/**
 * Auth alternativa por `X-Api-Key` / `Authorization: Bearer nxk_…`.
 * Setea `req.companyId`, `req.apiKeyScopes` y un user sintético machine.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly keys: CompanyApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const headerKey =
      req.headers?.['x-api-key'] ??
      req.headers?.['X-Api-Key'] ??
      (typeof req.headers?.authorization === 'string' &&
      String(req.headers.authorization).toLowerCase().startsWith('bearer nxk_')
        ? String(req.headers.authorization).slice(7).trim()
        : null);

    if (!headerKey) {
      throw new UnauthorizedException('API key requerida');
    }

    const auth = await this.keys.authenticate(String(headerKey));
    req.companyId = auth.companyId;
    req.company = auth.company;
    req.apiKeyId = auth.apiKeyId;
    req.apiKeyScopes = auth.scopes;
    req.user = {
      id: 0,
      isSuperAdmin: false,
      roleKey: 'api_key',
      permissions: auth.scopes,
      apiKeyId: auth.apiKeyId,
      companyId: auth.companyId,
    };
    return true;
  }
}
