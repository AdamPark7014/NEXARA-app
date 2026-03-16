import { IsDateString, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { SalesProjectStatus } from '@prisma/client';

export class CreateSalesProjectDto {
  @IsInt()
  opportunityId!: number;

  @IsString()
  name!: string;

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


