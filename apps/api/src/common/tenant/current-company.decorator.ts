import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Empresa activa resuelta por TenantInterceptor (`req.companyId`). */
export const CurrentCompanyId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.companyId != null ? Number(req.companyId) : null;
});

export const CurrentCompany = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.company ?? null;
});
