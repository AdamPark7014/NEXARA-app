import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Asignación de viático a un beneficiario, sin evidencia previa.
 *
 * Mismo motivo que en el alta: sin validadores, `whitelist` rechazaba todas las
 * propiedades y la asignación nunca llegaba al servicio.
 */
export class AssignViaticoDto {
  /** Beneficiario del viático (obligatorio). */
  @Type(() => Number)
  @IsInt()
  usuarioId!: number | string;

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

  /** COMBUSTIBLE | CASETA | HOSPEDAJE | ALIMENTACION | TRANSPORTE | OTROS */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  categoria?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  montoSolicitado!: number | string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  concepto?: string;
}
