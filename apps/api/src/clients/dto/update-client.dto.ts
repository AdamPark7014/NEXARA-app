import { PartialType } from '@nestjs/mapped-types';
import { IsBooleanString, IsOptional } from 'class-validator';
import { CreateClientDto } from './create-client.dto.js';

export class UpdateClientDto extends PartialType(CreateClientDto) {
	@IsOptional()
	@IsBooleanString()
	removeImage?: string;
}
