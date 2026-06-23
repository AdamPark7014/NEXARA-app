import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesClientDto } from './create-sales-client.dto.js';

export class UpdateSalesClientDto extends PartialType(CreateSalesClientDto) {}
