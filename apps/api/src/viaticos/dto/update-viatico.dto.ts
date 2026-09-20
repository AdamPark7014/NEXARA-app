import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ViaticoParteDto } from './viatico-reparto.dto.js';

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

  /**
   * Reparto nuevo. Si cambias el monto de un viático ya repartido, mandas el
   * reparto corregido en el mismo guardado o la API lo rechaza: un reparto que
   * no suma el total es costo perdido o duplicado en el P&L.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ViaticoParteDto)
  partes?: ViaticoParteDto[];
}
