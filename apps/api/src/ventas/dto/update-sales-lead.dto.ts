import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesLeadDto } from './create-sales-lead.dto.js';

export class UpdateSalesLeadDto extends PartialType(CreateSalesLeadDto) {}
