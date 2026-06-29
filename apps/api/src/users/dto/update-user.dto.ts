
import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateUserDto } from './create-user.dto.js';

export class UpdateUserDto extends PartialType(CreateUserDto) {
	@IsOptional()
	@IsString()
	avatarUrl?: string;

	@IsOptional()
	@IsString()
	employeeNumber?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	managerId?: number | null;
}
