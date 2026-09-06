import { Controller, Get, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { MeService } from './me.service.js';

@Controller('me')
@UseGuards(AuthGuard('jwt'))
export class MeController {
  constructor(private readonly me: MeService) {}

  /**
   * Navegación canónica por rol (url-matrix).
   * Clientes (web/Android) consumen paneles + moduleKeys en lugar de matrices locales.
   */
  @Get('navigation')
  navigation(@CurrentUser() user: any) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.me.navigation(Number(user.id));
  }
}
