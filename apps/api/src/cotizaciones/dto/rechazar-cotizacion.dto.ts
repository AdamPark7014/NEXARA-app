import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

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
