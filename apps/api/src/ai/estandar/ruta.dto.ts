import { IsDateString, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

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
}
