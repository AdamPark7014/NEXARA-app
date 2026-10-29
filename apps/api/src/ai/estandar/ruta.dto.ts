import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RutaEstandarDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @IsIn(['AUTO', 'TRANSPORTE'])
  modo?: 'AUTO' | 'TRANSPORTE';

  /** Hora de salida prevista (con Google, la ruta toma el tráfico de esa hora). */
  @IsOptional()
  @IsDateString()
  salida?: string;

  /** De dónde sale, si no es la oficina (el sitio de la actividad anterior, la casa del técnico). */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  origenLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  origenLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  origenNombre?: string;
}
