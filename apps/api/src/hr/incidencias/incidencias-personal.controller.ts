import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '../../common/files/interceptores-subida.js';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { IncidenciasPersonalService } from './incidencias-personal.service.js';

@Controller('hr/incidencias')
@UseGuards(AuthGuard('jwt'), UrlAccessGuard)
export class IncidenciasPersonalController {
  constructor(private readonly svc: IncidenciasPersonalService) {}

  @Get()
  listar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('semana') semana?: string,
    @Query('userId') userId?: string,
    @Query('tipo') tipo?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.svc.listar(user, Number(companyId), {
      semana, desde, hasta,
      userId: userId ? Number(userId) : undefined,
      tipo,
    });
  }

  @Post()
  crear(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() body: any) {
    return this.svc.crear(user, Number(companyId), body);
  }

  @Patch(':id')
  actualizar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.svc.actualizar(user, Number(companyId), id, body);
  }

  @Post('aplicar-semana')
  aplicar(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() body: { semana?: string }) {
    return this.svc.aplicarSemana(user, Number(companyId), String(body?.semana ?? ''));
  }

  @Post('importar')
  @UseInterceptors(FileInterceptor('file'))
  importar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.importar(user, Number(companyId), file?.buffer);
  }
}
