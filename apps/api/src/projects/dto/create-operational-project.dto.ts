import { IsString, IsNumber, IsOptional, IsDateString, MinLength } from 'class-validator';

export class CreateOperationalProjectDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  vendorId!: number;

  @IsNumber()
  clientId!: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateOperationalProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  actualEndDate?: string;
}

export class ProjectStatusChangeDto {
  @IsString()
  status!: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
}

export class AssignProjectEngineerDto {
  @IsNumber()
  engineerId!: number;
}

export class RemoveProjectEngineerDto {
  @IsNumber()
  engineerId!: number;
}
