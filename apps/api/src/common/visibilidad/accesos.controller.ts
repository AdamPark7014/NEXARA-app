import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CurrentUser } from '../current-user.decorator.js';
import { CurrentCompanyId } from '../tenant/current-company.decorator.js';
import { CLAVES_ACCESO, esSuperAdmin, normalizarAccesos } from './visibilidad.js';

/**
 * Accesos por persona («Ver precios», «Ver todas las cotizaciones»). Solo superadmin los cambia; se
 * eligen en la ficha de Usuarios, nunca con correos o ids en el código.
 */
@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class AccesosController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('accesos/catalogo')
  catalogo() {
    return {
      claves: CLAVES_ACCESO,
      etiquetas: { 'precios.ver': 'Ver precios', 'cotizaciones.ver_todas': 'Ver todas las cotizaciones' },
    };
  }

  @Patch(':id/accesos')
  async cambiar(
    @CurrentUser() actor: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { accesos?: unknown },
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!esSuperAdmin(actor)) throw new ForbiddenException('Solo dirección general cambia los accesos.');
    const persona = await this.prisma.user.findFirst({
      where: { id, ...(companyId != null ? { companyMemberships: { some: { companyId } } } : {}) },
      select: { id: true },
    });
    if (!persona) throw new NotFoundException('Usuario no encontrado');
    const accesos = normalizarAccesos(body?.accesos);
    const actualizado = await this.prisma.user.update({ where: { id }, data: { accesos }, select: { id: true, accesos: true } });
    return actualizado;
  }
}
