import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { DeshacerService } from './deshacer.service.js';
import { esTipoDeshacer } from './deshacer-reglas.js';

/**
 * `POST /deshacer` `{ tipo: 'actividad' | 'viatico', ids: number[] }` (o `id`).
 *
 * Solo pide sesión: quién puede lo decide el servicio con el organigrama (quien lo hizo dentro del
 * plazo, o un superior suyo). 410 = ya pasó el plazo; 409 = ya avanzó; 403 = no es suyo ni de su gente.
 */
@Controller('deshacer')
@UseGuards(AuthGuard('jwt'))
export class DeshacerController {
  constructor(private readonly service: DeshacerService) {}

  @Post()
  @HttpCode(200)
  deshacer(
    @Body() body: { tipo?: unknown; ids?: unknown; id?: unknown },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!esTipoDeshacer(body?.tipo)) throw new BadRequestException('No se puede deshacer eso.');
    const actor = user?.id
      ? { id: Number(user.id), nombre: user.nombre ?? null, email: user.email ?? null, isSuperAdmin: Boolean(user.isSuperAdmin) }
      : null;
    return this.service.deshacer(body.tipo, body.ids ?? body.id, actor, companyId);
  }
}
