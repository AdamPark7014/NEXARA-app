import { Body, Controller, Headers, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PortalAuthService, type PortalCompanyHint } from './portal-auth.service.js';
import { clearSessionCookie, setSessionCookie } from '../common/security/session-cookie.js';

@Controller('portal')
export class PortalAuthController {
  constructor(private readonly portalAuth: PortalAuthService) {}

  private resolveCompanyHint(
    body: { companySlug?: string; companyId?: number | string },
    headerSlug?: string,
  ): PortalCompanyHint | undefined {
    const companySlug =
      (typeof body.companySlug === 'string' && body.companySlug.trim()) ||
      (typeof headerSlug === 'string' && headerSlug.trim()) ||
      undefined;
    const rawId = body.companyId;
    const companyId =
      rawId != null && String(rawId).trim() !== '' ? Number(rawId) : undefined;
    if (!companySlug && (companyId == null || !Number.isFinite(companyId))) {
      return undefined;
    }
    return {
      companySlug: companySlug || null,
      companyId: companyId != null && Number.isFinite(companyId) ? companyId : null,
    };
  }

  /** Login unificado portal tickets (cliente o sucursal). companySlug/companyId opcionales. */
  @Post('login')
  async login(
    @Body() body: { email?: string; password?: string; companySlug?: string; companyId?: number | string },
    @Headers('x-company-slug') headerSlug: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meta = {
      ipAddress: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0]?.trim(),
      userAgent: String(req.headers['user-agent'] || ''),
    };
    const companyHint = this.resolveCompanyHint(body || {}, headerSlug);
    const result = await this.portalAuth.login(
      String(body.email || ''),
      String(body.password || ''),
      meta,
      companyHint,
    );

    // Misma sesión por cookie `HttpOnly` que el login de staff.
    if (result?.access_token) {
      setSessionCookie(res, result.access_token);
    }

    return result;
  }

  /** Cierre de sesión del portal: la cookie `HttpOnly` solo la borra el servidor. */
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    clearSessionCookie(res);
    return { ok: true };
  }
}
