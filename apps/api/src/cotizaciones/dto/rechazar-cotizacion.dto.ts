import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

/** Rechazo con motivo: lo usa dirección desde Core y el cliente desde el enlace público. */
export class RechazarCotizacionDto {
  @IsString()
  @MinLength(5)
  motivo!: string;

  /** Quién la rechaza (el cliente escribe su nombre en el enlace). */
  @IsOptional()
  @IsString()
  nombre?: string;
}

/** Ligar una actividad comercial existente a la cotización. */
export class LigarActividadDto {
  @IsInt()
  activityId!: number;
}

/** Agregar N paquetes («Cámara bala instalada»). */
export class AgregarPaqueteDto {
  @IsString()
  clave!: string;

  @IsInt()
  @Min(1)
  cantidad!: number;
}
