import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

export const NAS_EXPORT_TOKEN_MIN = 32;

export function tokenNasExportValido(recibido: unknown, esperado: string | undefined | null): boolean {
  if (esperado == null || typeof esperado !== 'string' || esperado.length < NAS_EXPORT_TOKEN_MIN) return false;
  if (typeof recibido !== 'string' || recibido.length === 0) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function empresaNasExport(envCompanyId?: string | null): number {
  const n = Number.parseInt(String(envCompanyId ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Llave de máquina para exportar cotizaciones a la NAS; nunca loguear el token. */
@Injectable()
export class NasExportGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header = req.headers?.['x-nas-token'] ?? req.headers?.['X-Nas-Token'];
    const recibido = Array.isArray(header) ? header[0] : header;
    const esperado = process.env.NAS_EXPORT_TOKEN;
    if (!tokenNasExportValido(recibido, esperado)) {
      throw new UnauthorizedException('No autorizado');
    }
    const companyId = empresaNasExport(process.env.NAS_EXPORT_COMPANY_ID);
    req.nasExportCompanyId = companyId;
    req.companyId = companyId;
    return true;
  }
}