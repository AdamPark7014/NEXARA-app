import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { RbacGuard } from '../common/rbac.guard.js';
import { StaffOnlyGuard } from '../common/security/staff-only.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { GrabacionService, type AcuerdoConfirmado, type CuerpoParte } from './grabacion.service.js';

/**
 * Grabación de juntas con notas en vivo y minuta automática. Va fuera de `/reuniones` a
 * propósito: todo el personal lee `/api/reuniones/**`, pero el audio, el texto y la IA solo los
 * toca quien conduce (`MEETINGS_LEAD_URL_RULES`).
 *
 *   POST :id/partes          una parte de audio (~1 min) con su posición en la grabación
 *   GET  :id?notasDesde=n    estado, notas en vivo (desde la n) y la minuta cuando está
 *   POST :id/concluir        «Concluir reunión»: escribe la minuta en segundo plano
 *   POST :id/texto           transcripción o notas pegadas (mismo camino, sin audio)
 *   POST :id/acuerdos        guarda los acuerdos confirmados (y sus actividades)
 *   GET  :id/pdf · POST :id/enviar · GET :id/transcripcion · POST :id/regenerar · DELETE :id
 */
@Controller('grabaciones-reuniones')
@UseGuards(AuthGuard('jwt'), StaffOnlyGuard, RbacGuard)
export class GrabacionController {
  constructor(private readonly grabacion: GrabacionService) {}

  @Post(':id/partes')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 25 * 1024 * 1024 } }))
  subirParte(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CuerpoParte,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.grabacion.subirParte(id, body ?? {}, file, companyId);
  }

  @Get(':id')
  estado(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Query('notasDesde') notasDesde?: string,
  ) {
    return this.grabacion.estado(id, companyId, Number(notasDesde) || 0);
  }

  @Get(':id/transcripcion')
  transcripcion(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.grabacion.transcripcion(id, companyId);
  }

  @Post(':id/concluir')
  concluir(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.grabacion.concluir(id, companyId);
  }

  @Post(':id/regenerar')
  regenerar(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.grabacion.regenerar(id, companyId);
  }

  @Post(':id/texto')
  texto(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { texto?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.grabacion.desdeTexto(id, body?.texto, companyId);
  }

  @Post(':id/acuerdos')
  acuerdos(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { acuerdos?: AcuerdoConfirmado[] },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.grabacion.confirmarAcuerdos(id, body?.acuerdos ?? [], Number(user?.id) || null, companyId);
  }

  @Get(':id/pdf')
  async pdf(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null, @Res() res: Response) {
    const archivo = await this.grabacion.pdf(id, companyId);
    if (!archivo) throw new NotFoundException('Esta reunión todavía no tiene minuta.');
    res.header('Content-Type', 'application/pdf');
    res.header('Content-Disposition', `attachment; filename="${archivo.nombre}"`);
    res.send(archivo.pdf);
  }

  @Post(':id/enviar')
  enviar(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.grabacion.enviar(id, companyId);
  }

  @Delete(':id')
  borrar(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.grabacion.borrar(id, companyId);
  }
}
