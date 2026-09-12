import { Controller, Get, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { MeService } from './me.service.js';
import { TeamBoardService } from './team-board.service.js';

@Controller('me')
@UseGuards(AuthGuard('jwt'))
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly teamBoard: TeamBoardService,
  ) {}

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

  /** Pizarra corporativa: equipo en scope company (CEO) o subtree (managerId). */
  @Get('board')
  board(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.teamBoard.getBoard(
      {
        id: Number(user.id),
        roleKey: user.roleKey ?? null,
        email: user.email ?? null,
        isSuperAdmin: Boolean(user.isSuperAdmin),
      },
      companyId,
    );
  }
}
