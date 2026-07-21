import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PortalAuthService } from './portal-auth.service.js';

@Controller('portal')
export class PortalAuthController {
  constructor(private readonly portalAuth: PortalAuthService) {}

  /** Login unificado portal tickets (cliente o sucursal). */
  @Post('login')
  login(@Body() body: { email?: string; password?: string }, @Req() req: Request) {
    const meta = {
      ipAddress: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0]?.trim(),
      userAgent: String(req.headers['user-agent'] || ''),
    };
    return this.portalAuth.login(String(body.email || ''), String(body.password || ''), meta);
  }
}
