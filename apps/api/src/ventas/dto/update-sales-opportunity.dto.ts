import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesOpportunityDto } from './create-sales-opportunity.dto.js';
import { IsDateString, IsOptional } from 'class-validator';

export class UpdateSalesOpportunityDto extends PartialType(CreateSalesOpportunityDto) {
  @IsOptional()
  @IsDateString()
  closedAt?: string;
}
