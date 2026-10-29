import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SugerirComplejidadDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  coreKind?: string;

  /** Subtipo de tarea (etiqueta del chip) o tipo de servicio. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tipo?: string;

  @IsString()
  @MaxLength(200)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  indicaciones?: string;
}
