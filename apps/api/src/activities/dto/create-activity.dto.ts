import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { ActivityType, ActivityWorkType, TicketType } from '@prisma/client';

export class CreateActivityDto {
  @IsOptional()
  @IsString()
  anNumber?: string;

  @IsNotEmpty()
  @IsString()
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  indicaciones?: string;

  @IsOptional()
  @IsString()
  estatus?: string;

  @IsOptional()
  @IsString()
  prioridad?: string;

  @IsOptional()
  @IsEnum(ActivityType)
  activityType?: ActivityType;

  @IsOptional()
  @IsEnum(TicketType)
  ticketType?: TicketType;

  @IsOptional()
  @IsString()
  ticketTypeCustom?: string;

  @IsOptional()
  @IsEnum(ActivityWorkType)
  workType?: ActivityWorkType;

  @IsOptional()
  @IsInt()
  clientId?: number;

  @IsOptional()
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  branchNumber?: string;

  @IsOptional()
  @IsString()
  branchCity?: string;

  @IsOptional()
  @IsString()
  branchState?: string;

  @IsOptional()
  @IsString()
  branchAddress?: string;

  @IsOptional()
  @IsInt()
  tiempoEstimadoMin?: number;

  @IsOptional()
  @IsInt()
  tiempoMaximoMin?: number;

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
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaMaxima?: string;

  @IsOptional()
  @IsDateString()
  fechaEntregaEsperada?: string;

  @IsOptional()
  @IsDateString()
  fechaFinalizacion?: string;
}
