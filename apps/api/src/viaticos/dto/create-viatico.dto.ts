import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
}
