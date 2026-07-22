import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  Get,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { OidcService } from './oidc.service.js';
import { LoginDto } from './dto/login.dto.js';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidc: OidcService,
  ) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() loginDto: LoginDto, @Req() req: Request) {
    return this.authService.login(loginDto, req);
  }

  @Get('oidc/status')
  oidcStatus() {
    return this.oidc.status();
  }

  @Get('oidc/scim-status')
  scimStatus() {
    return this.oidc.scimStatus();
  }

  @Get('oidc/start')
  async oidcStart(@Res() res: Response) {
    const { url } = await this.oidc.buildAuthorizeUrl();
    return res.redirect(url);
  }

  @Get('oidc/callback')
  async oidcCallback(
    @Query('code') code: string,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (error || !code) {
      const web = process.env.WEB_PUBLIC_URL || 'http://localhost:3000';
      return res.redirect(`${web}/login?sso=error`);
    }
    const user = await this.oidc.exchangeCode(code);
    const session = await this.authService.loginWithOidcUser(user, req);
    const web = process.env.WEB_PUBLIC_URL || 'http://localhost:3000';
    // Entrega token vía fragmento hash (no viaja a logs de servidor web)
    const hash = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
    return res.redirect(`${web}/login?sso=ok#${hash}`);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  profile(@CurrentUser() user: any) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.authService.getProfile(Number(user.id));
  }
}
