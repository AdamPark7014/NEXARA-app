import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { StaffOnlyGuard } from '../common/security/staff-only.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { CctvDisenosService, type ActorCctv } from './cctv-disenos.service.js';
import { ConflictoVersionFilter } from './conflicto-version.js';
import { CROQUIS_MAX_BYTES } from './croquis-imagen.js';
import { CrearDisenoDto } from './dto/crear-diseno.dto.js';
import { GuardarDisenoDto } from './dto/guardar-diseno.dto.js';

/**
 * Diseñador de videovigilancia (`docs/DISENADOR-CCTV.md` §9).
 *
 * La matriz de URLs abre el camino a los encargados y a quienes podrían llevar gente
 * (`CCTV_DISENOS_URL_RULES`); quién entra de verdad lo decide el servicio con `puedeDisenarCctv`
 * (403 con el motivo). `GET acceso` es la excepción: todo el personal la consulta y nunca da 403.
 */
@Controller('cctv-disenos')
@UseGuards(UrlAccessGuard, StaffOnlyGuard)
@UseFilters(ConflictoVersionFilter)
export class CctvDisenosController {
  constructor(private readonly service: CctvDisenosService) {}

  /** `{ puede }`: la web decide con esto si muestra el módulo. Antes de `:id`. */
  @Get('acceso')
  acceso(@Req() req: any) {
    return this.service.acceso(this.actor(req));
  }

  @Get()
  listar(@Req() req: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.listar(this.actor(req), companyId);
  }

  @Post()
  crear(@Req() req: any, @Body() dto: CrearDisenoDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.crear(this.actor(req), dto, companyId);
  }

  @Get(':id')
  detalle(@Req() req: any, @Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.detalle(this.actor(req), id, companyId);
  }

  @Patch(':id')
  guardar(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarDisenoDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.guardar(this.actor(req), id, dto, companyId);
  }

  @Post(':id/archivar')
  @HttpCode(200)
  archivar(@Req() req: any, @Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.archivar(this.actor(req), id, companyId);
  }

  /** Multipart `file`: PNG, JPEG o WebP hasta 20 MB (multer corta a los 25 MB). */
  @Post(':id/croquis')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CROQUIS_MAX_BYTES + 5 * 1024 * 1024, files: 1 } }))
  subirCroquis(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.subirCroquis(this.actor(req), id, file, companyId);
  }

  /** El rol que resolvió `UrlAccessGuard` (también para claves legacy); si no, el del JWT. */
  private actor(req: any): ActorCctv {
    const u = req?.user ?? {};
    return {
      id: Number(u.id),
      roleKey: req?.rbac?.role ?? u.roleKey ?? null,
      isSuperAdmin: Boolean(u.isSuperAdmin || u.superadmin),
      email: u.email ?? null,
    };
  }
}
