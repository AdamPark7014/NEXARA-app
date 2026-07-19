import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsIn(ACCOUNT_TYPES)
  type!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(ACCOUNT_TYPES)
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateCostCenterDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  defaultAccountId?: number;
}

export class CreateFiscalPeriodDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}

export class CreateBudgetDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Type(() => Number)
  @IsInt()
  costCenterId!: number;

  @Type(() => Number)
  @IsInt()
  year!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  month?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  plannedAmount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
