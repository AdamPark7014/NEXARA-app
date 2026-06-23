import { IsInt, IsOptional, IsString } from 'class-validator';
import { SalesLeadStatus } from '@prisma/client';

export class CreateSalesLeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  status?: SalesLeadStatus;

  @IsOptional()
  @IsInt()
  score?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  clientId?: number;

  @IsOptional()
  @IsInt()
  ownerId?: number;
}
