import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, IsInt, IsObject, ValidateIf } from 'class-validator';
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

  /** Activa/desactiva cuenta ERP (+ empuje ACS enable). */
  @IsOptional()
  isActive?: boolean;

  /**
   * Overrides de menú por módulo.
   * null = restablecer a plantilla del rol.
   * Objeto = { "ops-activities": "deliver"|"supervise"|"both"|"off", "crm-clients": "on"|"off", ... }
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  moduleAccess?: Record<string, string> | null;
}
