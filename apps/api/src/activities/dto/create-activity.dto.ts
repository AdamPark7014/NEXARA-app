import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
} from 'class-validator';

export class CreateActivityDto {
  @IsNotEmpty()
  @IsString()
  anNumber!: string;

  @IsNotEmpty()
  @IsString()
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  estatus?: string;

  @IsOptional()
  @IsString()
  prioridad?: string;

  @IsNotEmpty()
  @IsInt()
  creadoPorId!: number;

  @IsNotEmpty()
  @IsInt()
  responsableId!: number;

  @IsOptional()
  @IsInt()
  eficienciaScore?: number;

  @IsOptional()
  @IsString()
  comentariosFeedback?: string;

  @IsOptional()
  @IsDateString()
  fechaAsignacion?: string;

  @IsOptional()
  @IsDateString()
  fechaEntregaEsperada?: string;

  @IsOptional()
  @IsDateString()
  fechaFinalizacion?: string;
}
