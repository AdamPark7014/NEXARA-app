import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/** «Guardar como plantilla» desde el editor: de la cotización guardada se toma el contenido. */
export class GuardarPlantillaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;

  @IsInt()
  @Min(1)
  cotizacionId!: number;

  /** También guarda las partidas (con sus precios). */
  @IsOptional()
  @IsBoolean()
  conPartidas?: boolean;
}
