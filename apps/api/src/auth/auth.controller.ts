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
import { ErrorSso, OidcService } from './oidc.service.js';
import { LoginDto } from './dto/login.dto.js';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import {
  clearSessionCookie,
  logoutDebeBorrarCookie,
  rememberExpiresIn,
  sessionCookieOptions,
  sessionTokenFromHeaders,
  setSessionCookie,
} from '../common/security/session-cookie.js';
import {
  COOKIE_SSO,
  VIGENCIA_ESTADO_MS,
  leerCookie,
  leerEstado,
  vueltaSegura,
  type EstadoSso,
} from './sso-reglas.js';

/** Origen de la página que mandó al SSO, si el web no lo pasó en `vuelta`. */
function origenDeReferer(referer: string | undefined): string | undefined {
  try {
    return referer ? new URL(referer).origin : undefined;
  } catch {
    return undefined;
  }
}

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
      setSessionCookie(res, result.access_token, result.rememberMe ? rememberExpiresIn() : undefined);
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
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Sesión por pestaña: si la cookie es de otra cuenta abierta en otra pestaña, se conserva.
    if (logoutDebeBorrarCookie(req.headers ?? {})) clearSessionCookie(res);
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

  /**
   * Entrar con Google / Microsoft / OIDC: `?proveedor=google|microsoft&recordar=1&next=/erp/...&vuelta=<origen>`.
   * El `state`, el `nonce` y el verificador PKCE viajan firmados en la cookie `nx_sso` (10 min).
   */
  @Get('oidc/start')
  async oidcStart(
    @Query('proveedor') proveedor: string | undefined,
    @Query('recordar') recordar: string | undefined,
    @Query('next') next: string | undefined,
    @Query('vuelta') vuelta: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const origenPedido = vuelta || origenDeReferer(req.headers?.referer);
    try {
      const inicio = await this.oidc.iniciar({
        proveedor,
        recordar: recordar === '1' || recordar === 'true',
        next,
        vuelta: origenPedido,
      });
      res.cookie(COOKIE_SSO, inicio.cookie, sessionCookieOptions(VIGENCIA_ESTADO_MS));
      return res.redirect(inicio.url);
    } catch {
      const web = vueltaSegura(origenPedido, this.oidc.webPredeterminada(), process.env.NODE_ENV !== 'production');
      return res.redirect(`${web}/login?sso=error&motivo=proveedor`);
    }
  }

  @Get('oidc/callback')
  async oidcCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let estado: EstadoSso | null = null;
    try {
      estado = leerEstado(leerCookie(req.headers?.cookie, COOKIE_SSO), state, this.oidc.secretoEstado());
    } catch {
      estado = null;
    }
    const { maxAge: _sinVigencia, ...opcionesCookie } = sessionCookieOptions(0);
    res.clearCookie(COOKIE_SSO, opcionesCookie);

    const web = estado?.vuelta ?? this.oidc.webPredeterminada();
    const conNext = estado?.next ? `&next=${encodeURIComponent(estado.next)}` : '';
    const fallo = (motivo: string) => res.redirect(`${web}/login?sso=error&motivo=${motivo}${conNext}`);

    if (error) return fallo(error === 'access_denied' ? 'cancelado' : 'proveedor');
    if (!estado || !code) return fallo('estado');

    try {
      const user = await this.oidc.completar(estado, code);
      const session = await this.authService.loginWithOidcUser(user, req, estado.recordar);
      // Misma sesión por cookie que en el login normal.
      if (session?.access_token) {
        setSessionCookie(res, session.access_token, session.rememberMe ? rememberExpiresIn() : undefined);
      }
      // Entrega token vía fragmento hash (no viaja a logs de servidor web)
      const hash = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
      return res.redirect(`${web}/login?sso=ok${conNext}#${hash}`);
    } catch (e) {
      return fallo(e instanceof ErrorSso ? e.motivo : 'proveedor');
    }
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
      user.rem === true,
    );
    if (result?.access_token) {
      setSessionCookie(res, result.access_token, result.rememberMe ? rememberExpiresIn() : undefined);
    }
    return result;
  }

  /**
   * Apps móviles: renueva la sesión aunque el token ya haya vencido (sin guard JWT a propósito;
   * `refreshSession` valida la firma, la sesión y al usuario). 401 = hay que volver a entrar.
   */
  @Post('session/refresh')
  @HttpCode(200)
  async refreshSession(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.refreshSession(sessionTokenFromHeaders(req.headers ?? {}));
    if (result?.access_token) {
      setSessionCookie(res, result.access_token, result.rememberMe ? rememberExpiresIn() : undefined);
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
