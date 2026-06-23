import { IsOptional, IsString } from 'class-validator';

export class CreateWorkProjectPayrollDto {
  @IsString()
  employee!: string;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
