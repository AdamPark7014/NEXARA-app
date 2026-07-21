import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ClientAuthService } from './client-auth.service.js';

@Controller('client-auth')
export class ClientAuthController {
  constructor(private readonly clientAuth: ClientAuthService) {}

  /** @deprecated Prefer POST /portal/login */
  @Post('login')
  login(@Body() body: { email?: string; password?: string }, @Req() req: Request) {
    const meta = {
      ipAddress: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0]?.trim(),
      userAgent: String(req.headers['user-agent'] || ''),
    };
    return this.clientAuth.login(String(body.email || ''), String(body.password || ''), meta);
  }
}
