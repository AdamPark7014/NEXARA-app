import { IsString, IsOptional, IsArray, IsBoolean, IsDate } from 'class-validator';

export class CreateAccessRuleDto {
  @IsString()
  employeeId!: string;

  @IsArray()
  @IsString({ each: true })
  doorIds!: string[];

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @IsDate()
  @IsOptional()
  startDate?: Date;

  @IsDate()
  @IsOptional()
  endDate?: Date;

  @IsString()
  @IsOptional()
  accessLevel?: 'basic' | 'intermediate' | 'admin'; // Nivel de acceso

  @IsArray()
  @IsOptional()
  allowedTimeSlots?: { start: string; end: string }[]; // HH:MM format
}

export class UpdateAccessRuleDto {
  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsDate()
  @IsOptional()
  endDate?: Date;

  @IsArray()
  @IsOptional()
  doorIds?: string[];

  @IsString()
  @IsOptional()
  accessLevel?: 'basic' | 'intermediate' | 'admin';

  @IsArray()
  @IsOptional()
  allowedTimeSlots?: { start: string; end: string }[];
}
