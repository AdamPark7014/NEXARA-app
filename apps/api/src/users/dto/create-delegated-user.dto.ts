import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ALL_ROLES } from '../../common/rbac/roles.v2.js';

/** Alta de un usuario por quien tiene el permiso delegado (o por dirección). */
export class CreateDelegatedUserDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(180)
  nombre!: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  /** La escribe (o genera en pantalla) quien da de alta; se guarda solo como hash. */
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  /** Tipo de usuario (`ing_soporte`, `ing_campo`…). El API valida que esta persona pueda darlo de alta. */
  @IsNotEmpty()
  @IsIn(ALL_ROLES)
  roleKey!: string;

  /** Si se omite, el de quien da de alta. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeNumber?: string;

  /** Solo lo respeta dirección. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  managerId?: number;
}
