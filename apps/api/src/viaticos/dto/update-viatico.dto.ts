import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Edición de viático. Sin validadores, `whitelist` tumbaba cada PATCH con 400.
 */
export class UpdateViaticoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  actividadId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vehicleId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  categoria?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  montoSolicitado?: number | string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  concepto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ticketEvidenciaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comprobante?: string;
}
