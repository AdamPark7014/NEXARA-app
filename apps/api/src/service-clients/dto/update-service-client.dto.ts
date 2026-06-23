import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateServiceClientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  accountCode?: string;

  @IsOptional()
  @IsEmail()
  portalEmail?: string;

  @IsOptional()
  @IsString()
  portalPassword?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
