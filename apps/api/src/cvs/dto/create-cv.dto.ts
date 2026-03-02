import { IsArray, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

const EMPLOYMENT_STATUSES = ['NEW_CANDIDATE', 'CURRENT_EMPLOYEE', 'FORMER_EMPLOYEE'] as const;

export class CreateCvDto {
  @IsString()
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsIn(EMPLOYMENT_STATUSES)
  employmentStatus?: (typeof EMPLOYMENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  recruiterNotes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
