import { IsDateString, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { SalesOpportunityStage } from '@prisma/client';

export class CreateSalesOpportunityDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  stage?: SalesOpportunityStage;

  @IsOptional()
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsInt()
  probability?: number;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsInt()
  clientId?: number;

  @IsOptional()
  @IsInt()
  leadId?: number;

  @IsOptional()
  @IsInt()
  ownerId?: number;
}
