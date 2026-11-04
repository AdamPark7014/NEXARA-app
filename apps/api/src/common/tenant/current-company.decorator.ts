import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

/** Empresa activa resuelta por TenantInterceptor (`req.companyId`). */
export const CurrentCompanyId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.companyId != null ? Number(req.companyId) : null;
});

export const EMPRESA_POR_CABECERA_SIN_SESION = 'empresaPorCabeceraSinSesion';

/**
 * Ruta sin sesión que obedece `X-Company-Id`. Sin esta marca, `TenantInterceptor` la ignora: cualquiera elegiría
 * empresa con un número. Una prueba impide usarla en otra ruta sin darse cuenta.
 */
export const EmpresaPorCabeceraSinSesion = () => SetMetadata(EMPRESA_POR_CABECERA_SIN_SESION, true);

export const CurrentCompany = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.company ?? null;
});
