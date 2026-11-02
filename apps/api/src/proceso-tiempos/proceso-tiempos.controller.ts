import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const PROCESOS_MEDIDOS = ['asignar', 'autoasignar', 'asignar_ia', 'cotizar', 'revisar'] as const;

/** Más que esto no es una medición, es una pestaña que se quedó abierta. */
const TOPE_MS = 8 * 60 * 60 * 1000;

class RegistrarTiempoDto {
  @IsIn(PROCESOS_MEDIDOS as unknown as string[]) proceso!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(TOPE_MS) duracionMs!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) clics?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) entidadId?: number;
  @IsOptional() @IsString() @MaxLength(60) detalle?: string;
}

/**
 * Cronómetro de procesos (Programa Velocidad Core, 01-11-2026). Cada persona manda su propio tiempo:
 * el usuario y la empresa salen de la sesión, nunca del cuerpo. Solo escribe.
 */
@Controller('proceso-tiempos')
@UseGuards(UrlAccessGuard)
export class ProcesoTiemposController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  async registrar(
    @Body() dto: RegistrarTiempoDto,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ): Promise<void> {
    await this.prisma.procesoTiempo.create({
      data: {
        companyId: requireCompanyId(companyId),
        userId: user.id,
        proceso: dto.proceso,
        duracionMs: dto.duracionMs,
        clics: dto.clics ?? null,
        entidadId: dto.entidadId ?? null,
        detalle: dto.detalle?.trim() || null,
      },
    });
  }
}
