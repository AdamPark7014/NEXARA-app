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
 * Alta de viático.
 *
 * Estos campos llevaban tipo pero ningún validador. El `ValidationPipe` global
 * corre con `whitelist` y `forbidNonWhitelisted`, y una propiedad sin metadata
 * de class-validator no está en la lista blanca: el alta rebotaba con 400
 * («property usuarioId should not exist») antes de llegar al controlador, sin
 * importar lo que mandara la pantalla. Declarar el contrato es lo que abre la
 * puerta.
 *
 * El importe y los identificadores llegan como número por JSON y como texto por
 * multipart —el formulario manda `FormData` cuando se adjunta el ticket—, así
 * que se convierten antes de validar.
 */
export class CreateViaticoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  usuarioId?: number;

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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ticketEvidenciaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comprobante?: string;

  /**
   * Reparto del gasto entre varias actividades. Opcional: sin él, el viático
   * sigue siendo de la actividad de `actividadId`, como siempre.
   *
   * Solo llega por JSON. En `multipart` —cuando se adjunta el ticket— una
   * lista anidada no sobrevive al `FormData`, así que el reparto se guarda
   * después con `PUT /viatics/:id/reparto`.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ViaticoParteDto)
  partes?: ViaticoParteDto[];
}
