import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { FormatosActividadService, type ActorFormato } from './formatos-actividad.service.js';
import { MAX_RENGLONES } from './receta-formato.js';

class GuardarFormatoDto {
  @IsOptional() @IsString() @MaxLength(120) nombre?: string;
  @IsOptional() @IsString() @MaxLength(300) descripcion?: string | null;
  /** Se revisa y limpia en `normalizarReceta`. */
  @IsOptional() @IsObject() receta?: Record<string, unknown>;
}

class AplicarFormatoDto {
  @IsString() @MaxLength(64) clave!: string;
  @Type(() => Number) @IsInt() @Min(1) responsableId!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsInt({ each: true }) equipoIds?: number[];
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Elige el día' }) fecha!: string;
  @IsOptional() @IsString() @MaxLength(5) hora?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) clientId?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) projectId?: number | null;
  @IsOptional() @IsString() @MaxLength(160) sucursal?: string | null;
  /** Se revisan y limpian en `normalizarRenglon`. */
  @IsArray() @ArrayMaxSize(MAX_RENGLONES) renglones!: Array<{ titulo: string; minutos?: number }>;
}

/** Quien entra lo decide el servicio, con la misma regla de asignar a otra persona. */
@Controller('formatos-actividad')
@UseGuards(UrlAccessGuard)
export class FormatosActividadController {
  constructor(private readonly formatos: FormatosActividadService) {}

  @Get()
  listar(@CurrentUser() user: ActorFormato, @CurrentCompanyId() companyId: number | null) {
    return this.formatos.listar(user, companyId);
  }

  @Get('borrador-desde/:activityId')
  borrador(
    @Param('activityId', ParseIntPipe) activityId: number,
    @CurrentUser() user: ActorFormato,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.formatos.borradorDesdeActividad(activityId, user, companyId);
  }

  @Post()
  crear(@Body() dto: GuardarFormatoDto, @CurrentUser() user: ActorFormato, @CurrentCompanyId() companyId: number | null) {
    return this.formatos.crear(dto, user, companyId);
  }

  @Put(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarFormatoDto,
    @CurrentUser() user: ActorFormato,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.formatos.editar(id, dto, user, companyId);
  }

  /** Archivar: es un POST para no abrir DELETE en la matriz; el formato no se borra. */
  @Post(':id/archivar')
  archivar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ActorFormato,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.formatos.archivar(id, user, companyId);
  }

  @Post(':id/aplicar')
  aplicar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AplicarFormatoDto,
    @CurrentUser() user: ActorFormato,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.formatos.aplicar(id, dto as never, user, companyId);
  }
}
