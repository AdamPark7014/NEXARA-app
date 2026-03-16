import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertSettingDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsOptional()
  label?: string;
}
