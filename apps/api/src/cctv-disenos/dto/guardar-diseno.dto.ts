import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ESTADOS_DISENO, NOMBRE_DISENO_MAX, type EstadoDiseno } from '../plano-cctv.js';

/**
 * `PATCH /api/cctv-disenos/:id`: guarda lo que cambió. `version` es la que se abrió: si alguien
 * guardó después, responde 409 y no pisa nada. `clienteId`, `cotizacionId`, `grabacion` y
 * `resumen` aceptan `null` para quitarlos.
 */
export class GuardarDisenoDto {
  @IsInt({ message: 'Falta la versión del diseño que abriste.' })
  @Min(1, { message: 'Falta la versión del diseño que abriste.' })
  version!: number;

  @IsOptional()
  @IsString({ message: 'Escribe un nombre para el diseño.' })
  @MinLength(1, { message: 'Escribe un nombre para el diseño.' })
  @MaxLength(NOMBRE_DISENO_MAX, { message: `El nombre no puede pasar de ${NOMBRE_DISENO_MAX} caracteres.` })
  nombre?: string;

  @IsOptional()
  @IsInt({ message: 'El cliente no es válido.' })
  @Min(1, { message: 'El cliente no es válido.' })
  clienteId?: number | null;

  @IsOptional()
  @IsInt({ message: 'La cotización no es válida.' })
  @Min(1, { message: 'La cotización no es válida.' })
  cotizacionId?: number | null;

  @IsOptional()
  @IsIn(ESTADOS_DISENO as unknown as string[], { message: 'El estado debe ser borrador, enviada o aprobada.' })
  estado?: EstadoDiseno;

  @IsOptional()
  @IsObject({ message: 'El plano no tiene el formato esperado.' })
  plano?: Record<string, unknown>;

  @IsOptional()
  @IsObject({ message: 'La grabación no tiene el formato esperado.' })
  grabacion?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject({ message: 'El resumen no tiene el formato esperado.' })
  resumen?: Record<string, unknown> | null;
}
