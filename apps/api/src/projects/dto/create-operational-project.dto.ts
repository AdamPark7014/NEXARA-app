import { IsString, IsNumber, IsOptional, IsDateString, MinLength, IsEnum, IsInt } from 'class-validator';
import { ServiceProjectType } from '@prisma/client';

export class CreateOperationalProjectDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ServiceProjectType)
  projectType?: ServiceProjectType;

  @IsOptional()
  @IsString()
  scopeSummary?: string;

  @IsOptional()
  @IsInt()
  siteCount?: number;

  @IsOptional()
  @IsInt()
  salesProjectId?: number;

  @IsNumber()
  vendorId!: number;

  @IsNumber()
  clientId!: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateOperationalProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ServiceProjectType)
  projectType?: ServiceProjectType;

  @IsOptional()
  @IsString()
  scopeSummary?: string;

  @IsOptional()
  @IsInt()
  siteCount?: number;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  actualEndDate?: string;
}

export class ProjectStatusChangeDto {
  @IsString()
  status!: 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

  /** Obligatorio al cancelar: un proyecto que se cae sin motivo no se puede explicar. */
  @IsOptional()
  @IsString()
  cancelReason?: string;

  /** Fin **real** al dar por terminado. Sin él se usa hoy. */
  @IsOptional()
  @IsDateString()
  actualEndDate?: string;
}

export class AssignProjectEngineerDto {
  @IsNumber()
  engineerId!: number;
}

export class CreateProjectActivityDto {
  @IsString()
  @MinLength(3)
  titulo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsNumber()
  responsableId!: number;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  branchNumber?: string;
}

export class RemoveProjectEngineerDto {
  @IsNumber()
  engineerId!: number;
}
