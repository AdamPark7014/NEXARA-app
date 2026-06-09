
import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';
import { ALL_ROLES } from '../../common/rbac/roles.v2.js';

export class UpdateUserDto extends PartialType(CreateUserDto) {
	@IsOptional()
	@IsString()
	avatarUrl?: string;

	@IsOptional()
	@IsString()
	employeeNumber?: string;

	/**
	 * Rol RBAC v2 (`roles.v2.ts`). Cuando se incluye, el `UrlAccessGuard` y la
	 * matriz de URLs lo usarán como fuente de verdad. Coexiste con `roleId`
	 * legacy mientras dura la migración.
	 */
	@IsOptional()
	@IsString()
	@IsIn(ALL_ROLES as readonly string[], {
		message: `roleKey inválido. Valores permitidos: ${ALL_ROLES.join(', ')}`,
	})
	roleKey?: string;
}
