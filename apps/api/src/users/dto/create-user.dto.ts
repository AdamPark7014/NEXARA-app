import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

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
}
