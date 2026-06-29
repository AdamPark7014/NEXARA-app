import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsInt } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  nombre!: string;

  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsNotEmpty()
  @Transform(({ value }) => value)
  roleId!: number | string;

  @IsNotEmpty()
  @Transform(({ value }) => value)
  departmentId!: number | string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  employeeNumber?: string;

  /** Manager directo; si se omite, el backend asigna al CEO por defecto. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  managerId?: number | null;
}
