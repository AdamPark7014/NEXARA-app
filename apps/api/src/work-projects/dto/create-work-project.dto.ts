import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { WorkProjectStatus } from '@prisma/client';

export class CreateWorkProjectDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsEnum(WorkProjectStatus)
  status?: WorkProjectStatus;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  budgetTotal?: string;

  @IsOptional()
  @IsString()
  budgetUsed?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
