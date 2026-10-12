import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { RbacGuard } from '../common/rbac.guard.js';
import { StaffOnlyGuard } from '../common/security/staff-only.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { GrabacionService } from './grabacion.service.js';

/**
 * Grabación de juntas con el transcriptor propio. Va fuera de `/reuniones` a propósito: todo
 * el personal lee `/api/reuniones/**`, pero el audio y su texto solo los toca quien conduce
 * (`MEETINGS_LEAD_URL_RULES`).
 */
@Controller('grabaciones-reuniones')
@UseGuards(AuthGuard('jwt'), StaffOnlyGuard, RbacGuard)
export class GrabacionController {
  constructor(private readonly grabacion: GrabacionService) {}

  /** La web sube una parte de audio cada pocos minutos; el texto se arma en segundo plano. */
  @Post(':id/partes')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 25 * 1024 * 1024 } }))
  subirParte(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { parte?: string },
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.grabacion.subirParte(id, body?.parte, file, companyId);
  }

  @Get(':id')
  estado(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.grabacion.estado(id, companyId);
  }

  @Delete(':id')
  borrar(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.grabacion.borrar(id, companyId);
  }
}
