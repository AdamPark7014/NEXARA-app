import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { PortalCompanyHint } from '../portal-auth/portal-auth.service.js';
import { BranchAuthService } from './branch-auth.service.js';

@Controller('branch-auth')
export class BranchAuthController {
  constructor(private readonly branchAuthService: BranchAuthService) {}

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

  /** @deprecated Prefer POST /portal/login */
  @Post('login')
  login(
    @Body() body: { email?: string; password?: string; companySlug?: string; companyId?: number | string },
    @Headers('x-company-slug') headerSlug: string | undefined,
    @Req() req: Request,
  ) {
    const meta = {
      ipAddress: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0]?.trim(),
      userAgent: String(req.headers['user-agent'] || ''),
    };
    return this.branchAuthService.login(
      String(body.email || ''),
      String(body.password || ''),
      meta,
      this.resolveCompanyHint(body || {}, headerSlug),
    );
  }
}
