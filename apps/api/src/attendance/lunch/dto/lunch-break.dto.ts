import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLunchBreakDto {
  @IsISO8601()
  checkinTime!: string; // ISO datetime string

  @IsString()
  checkinPhotoUrl!: string;

  /** Obligatoria si sales a comer fuera de 15:00–16:00. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  justificacion?: string;
}

export class UpdateLunchBreakDto {
  @IsISO8601()
  checkoutTime!: string; // ISO datetime string

  @IsString()
  checkoutPhotoUrl?: string;

  /** Obligatoria si regresas después de las 16:05. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  justificacion?: string;
}

/** Superior aprueba o rechaza una comida a destiempo. */
export class RevisarComidaDto {
  @IsIn(['aprobar', 'rechazar'])
  decision!: 'aprobar' | 'rechazar';

  /** Obligatorias al rechazar. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notas?: string;
}
