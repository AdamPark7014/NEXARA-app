import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { NOMBRE_DISENO_MAX } from '../plano-cctv.js';

/** `POST /api/cctv-disenos`: un diseño nuevo. Sin `plano`, empieza vacío (`planoVacio()`). */
export class CrearDisenoDto {
  @IsString({ message: 'Escribe un nombre para el diseño.' })
  @MinLength(1, { message: 'Escribe un nombre para el diseño.' })
  @MaxLength(NOMBRE_DISENO_MAX, { message: `El nombre no puede pasar de ${NOMBRE_DISENO_MAX} caracteres.` })
  nombre!: string;

  /** Cliente comercial (`SalesClient.id`). */
  @IsOptional()
  @IsInt({ message: 'El cliente no es válido.' })
  @Min(1, { message: 'El cliente no es válido.' })
  clienteId?: number | null;

  @IsOptional()
  @IsInt({ message: 'La cotización no es válida.' })
  @Min(1, { message: 'La cotización no es válida.' })
  cotizacionId?: number | null;

  /** El `Plano` versión 1; la forma y el tamaño los revisa `validarPlano`. */
  @IsOptional()
  @IsObject({ message: 'El plano no tiene el formato esperado.' })
  plano?: Record<string, unknown>;
}
