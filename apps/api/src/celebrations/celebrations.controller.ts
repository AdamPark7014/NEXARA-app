import { Controller, Get, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { CelebrationsService } from './celebrations.service.js';

// Bajo /me: la matriz de URL ya deja a todo rol autenticado leer ahí.
@Controller('me/celebraciones')
@UseGuards(AuthGuard('jwt'))
export class CelebrationsController {
  constructor(private readonly celebrations: CelebrationsService) {}

  /** Cumpleaños y aniversarios de hoy en la empresa, para el aviso dentro de la app. */
  @Get('hoy')
  hoy(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    // El portal de clientes no ve datos del equipo.
    if (!user?.id || user?.isClient || user?.isBranchUser) {
      throw new UnauthorizedException('Token de usuario inválido');
    }
    return this.celebrations.deHoy(companyId, Number(user.id));
  }
}
