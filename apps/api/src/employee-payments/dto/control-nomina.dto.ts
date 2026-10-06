import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Cuerpos del control de nómina semanal (`employee-payments/control-semanal`).
 *
 * `semana` es el lunes `AAAA-MM-DD`; cualquier otro día se lleva al lunes de su semana.
 * El pipe global corre con `whitelist` + `forbidNonWhitelisted`: todo campo va declarado.
 */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MENSAJE_FECHA = 'debe ser una fecha AAAA-MM-DD';

export class SemanaControlDto {
  @IsString()
  @Matches(FECHA, { message: `semana ${MENSAJE_FECHA}` })
  semana!: string;
}

export class AjustarDiaControlDto extends SemanaControlDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @IsString()
  @Matches(FECHA, { message: `fecha ${MENSAJE_FECHA}` })
  fecha!: string;

  /** Oficina | Foráneo | Descanso | Falta | Falta justificada | Guardia | Vacaciones | Permiso; null = automático. */
  @ValidateIf((o) => o.lugar !== null)
  @IsString({ message: 'lugar debe ser un texto o null (null = volver a automático)' })
  @MaxLength(40)
  lugar!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nota?: string | null;
}

export class ActualizarFilaControlDto extends SemanaControlDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  /** null = volver a la nota automática; '' = sin nota. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notaFila?: string | null;

  /** Sueldo semanal de RH (`UserProfile.sueldoSemanal`). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9_999_999.99)
  sueldoSemanal?: number;
}

export class CrearDescuentoControlDto extends SemanaControlDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  concepto!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9_999_999.99)
  monto!: number;
}

export class AceptarSugeridosControlDto extends SemanaControlDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  /** Solo estas faltas (`AAAA-MM-DD`); sin la lista, todas las sugeridas. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @Matches(FECHA, { each: true, message: `cada fecha ${MENSAJE_FECHA}` })
  fechas?: string[];
}

export class ReabrirSemanaControlDto extends SemanaControlDto {
  @IsString()
  @MinLength(10, { message: 'El motivo es obligatorio (al menos 10 caracteres)' })
  @MaxLength(1000)
  motivo!: string;
}
