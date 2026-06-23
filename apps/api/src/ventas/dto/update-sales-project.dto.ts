import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesProjectDto } from './create-sales-project.dto.js';

export class UpdateSalesProjectDto extends PartialType(CreateSalesProjectDto) {}
