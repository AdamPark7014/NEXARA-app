import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Edición de un pago a empleado.
 *
 * El alta se salva porque su `@Body()` es un tipo intersección —TypeScript lo
 * emite como `Object` y el pipe ni lo mira—, pero aquí el cuerpo es la clase
 * pelada: sin validadores, `whitelist` + `forbidNonWhitelisted` rechazaban
 * cada propiedad y el PATCH devolvía 400 siempre. Con el contrato declarado, la
 * edición funciona y además valida de verdad.
 *
 * El importe llega como texto por multipart (el formulario adjunta evidencias)
 * y como número por JSON.
 */
export class UpdateEmployeePaymentDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsString()
  periodFrom?: string;

  @IsOptional()
  @IsString()
  periodTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: string | number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  concepto?: string;

  /** Borrador | Pagado */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
}
