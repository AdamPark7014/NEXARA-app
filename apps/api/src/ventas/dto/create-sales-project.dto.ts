import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { SalesProjectStatus, ServiceProjectType } from '@prisma/client';

export class CreateSalesProjectDto {
  @IsInt()
  opportunityId!: number;

  @IsString()
  name!: string;

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
  @IsNumber()
  budget?: number;

  @IsOptional()
  @IsNumber()
  costProducts?: number;

  @IsOptional()
  @IsNumber()
  costViaticos?: number;

  @IsOptional()
  @IsNumber()
  costOperativo?: number;

  @IsOptional()
  status?: SalesProjectStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}


