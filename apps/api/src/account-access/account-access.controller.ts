import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { AccountAccessService } from './account-access.service.js';

class UnlockDto {
  /** La contraseña del dueño, otra vez. Viaja solo en esta petición; el registro de auditoría la oculta. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}

/**
 * «Acceso a cuentas» — solo el dueño (Christian). Todo lo demás responde 403.
 *  · POST unlock → vuelve a escribir su contraseña y recibe una ficha de 5 minutos.
 *  · GET users → cuentas de la empresa (encabezado `x-access-token` con la ficha).
 *  · POST users/:id/reset-password → contraseña nueva para esa cuenta, visible una sola vez.
 */
@Controller('account-access')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class AccountAccessController {
  constructor(private readonly service: AccountAccessService) {}

  private empresa(companyId: number | null): number {
    if (companyId == null) throw new BadRequestException('No se pudo determinar la empresa activa.');
    return companyId;
  }

  @Get('status')
  async status(@CurrentUser() user: any) {
    return { puedeEntrar: await this.service.puedeEntrar(user) };
  }

  @Post('unlock')
  @HttpCode(200)
  unlock(@CurrentUser() user: any, @Body() dto: UnlockDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.desbloquear(user, dto.password, companyId);
  }

  @Get('users')
  users(
    @CurrentUser() user: any,
    @Headers('x-access-token') ficha: string | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listar(user, ficha, this.empresa(companyId));
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  reset(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-access-token') ficha: string | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.restablecer(user, ficha, id, this.empresa(companyId));
  }
}
