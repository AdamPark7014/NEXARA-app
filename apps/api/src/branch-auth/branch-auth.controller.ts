import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BranchAuthService } from './branch-auth.service.js';

@Controller('branch-auth')
export class BranchAuthController {
  constructor(private readonly branchAuthService: BranchAuthService) {}

  /** @deprecated Prefer POST /portal/login */
  @Post('login')
  login(@Body() body: { email?: string; password?: string }, @Req() req: Request) {
    const meta = {
      ipAddress: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0]?.trim(),
      userAgent: String(req.headers['user-agent'] || ''),
    };
    return this.branchAuthService.login(String(body.email || ''), String(body.password || ''), meta);
  }
}
