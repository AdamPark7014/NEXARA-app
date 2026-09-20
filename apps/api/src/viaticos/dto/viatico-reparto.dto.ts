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

/**
 * Una parte del reparto: qué actividad carga cuánto.
 *
 * El `ValidationPipe` global corre con `whitelist` y `forbidNonWhitelisted`,
 * así que sin declarar el contrato la lista entera rebota con 400 antes de
 * llegar al servicio.
 */
export class ViaticoParteDto {
  @Type(() => Number)
  @IsInt()
  actividadId!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nota?: string | null;
}

/** Reemplaza el reparto completo. Lista vacía = deshacer el reparto. */
export class SetViaticoRepartoDto {
  @IsArray()
  // Un viaje no reparte entre cincuenta actividades; el tope evita que un
  // cliente descuidado meta miles de filas en una transacción.
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ViaticoParteDto)
  partes!: ViaticoParteDto[];
}

/** Comprobación del anticipo: cuánto se gastó de verdad. */
export class ComprobarViaticoDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  montoComprobado!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ticketEvidenciaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
