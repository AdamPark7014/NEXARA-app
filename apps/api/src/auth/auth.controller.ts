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
import { clearSessionCookie, setSessionCookie } from '../common/security/session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidc: OidcService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto, req);

    // La sesión del navegador viaja en cookie `HttpOnly`; el `access_token` del
    // cuerpo se mantiene para la app nativa y las integraciones, que no tienen
    // cookie jar.
    if (result?.access_token) {
      setSessionCookie(res, result.access_token);
    }

    return result;
  }

  /**
   * Cierre de sesión.
   *
   * Con la cookie en `HttpOnly` el cliente ya no puede borrarla por su cuenta:
   * sin este endpoint no habría forma de cerrar sesión.
   */
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    clearSessionCookie(res);
    return { ok: true };
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
    // Misma sesión por cookie que en el login normal.
    if (session?.access_token) {
      setSessionCookie(res, session.access_token);
    }
    const web = process.env.WEB_PUBLIC_URL || 'http://localhost:3000';
    // Entrega token vía fragmento hash (no viaja a logs de servidor web)
    const hash = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
    return res.redirect(`${web}/login?sso=ok#${hash}`);
  }


  @Post('session/extend')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async extendSession(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    const result = await this.authService.extendSession(
      Number(user.id),
      user.jti as string | undefined,
      req,
    );
    if (result?.access_token) {
      setSessionCookie(res, result.access_token);
    }
    return result;
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
