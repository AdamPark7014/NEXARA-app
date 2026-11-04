import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** De qué es la foto de la comida. Las apps viejas no lo mandan. */
export const FOTOS_DE_COMIDA = ['escritorio', 'personal'] as const;
export type FotoDeComida = (typeof FOTOS_DE_COMIDA)[number];

export class CreateLunchBreakDto {
  @IsISO8601()
  checkinTime!: string; // ISO datetime string

  @IsString()
  checkinPhotoUrl!: string;

  /** Obligatoria si sales a comer fuera de tu ventana (oficina 15:00–16:00; cuadrilla, ver `ventana-comida.ts`). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  justificacion?: string;

  @IsOptional()
  @IsIn(FOTOS_DE_COMIDA)
  fotoTipo?: FotoDeComida;

  /** Obligatorio si la foto es personal: por qué no está en oficina. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivoFuera?: string;
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

  @IsOptional()
  @IsIn(FOTOS_DE_COMIDA)
  fotoTipo?: FotoDeComida;

  /** Obligatorio si la foto es personal: por qué no está en oficina. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivoFuera?: string;
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
