import { IsOptional, IsString } from 'class-validator';

export class CreateWorkProjectExpenseDto {
  @IsString()
  category!: string;

  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  incurredAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
