import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateContactMessageDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsIn(['SOPORTE', 'VENTAS'])
  category?: 'SOPORTE' | 'VENTAS';

  @IsString()
  @MinLength(5)
  message!: string;

  @IsOptional()
  @IsBoolean()
  newsletter?: boolean;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  pageUrl?: string;
}
